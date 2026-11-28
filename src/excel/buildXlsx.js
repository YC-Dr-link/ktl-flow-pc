// 양식 xlsx 바이트에 셀 값과 차트 캐시를 채워 결과 xlsx 바이트와 파일 이름을 만든다
import JSZip from 'jszip';
import defaultConfig from '../config.js';
import { cellValues, chartValues } from './cellValues.js';
import { parseXml, setCells, toXml, splitRef } from './sheetXml.js';
import { updateChart } from './chartXml.js';
import { prepareProvenance, appendProvenance, sourceRawCells, rawLocation } from './provenance.js';

const REL_NS_PATH = 'xl/_rels/workbook.xml.rels';

// workbook.xml과 관계 파일로 시트 이름 → 파일 경로. Target이 '/xl/…'처럼 절대 경로인 파일도 있다
export function sheetPaths(workbookXml, relsXml) {
  const rels = new Map(
    [...parseXml(relsXml).getElementsByTagNameNS('*', 'Relationship')].map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]),
  );
  const out = {};
  for (const s of [...parseXml(workbookXml).getElementsByTagNameNS('*', 'sheet')]) { // 접두사(x:)가 붙은 파일도
    const target = rels.get(s.getAttribute('r:id')) ?? '';
    out[s.getAttribute('name')] = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  return out;
}

// 쓰이지 않는 공유 문자열(양식에 남은 이전 접수 건의 회사명 등)을 지우고 번호를 다시 매긴다
function compactSharedStrings(sstDoc, sheetDocs) {
  const cellsOf = (doc) => [...doc.getElementsByTagName('c')].filter((c) => c.getAttribute('t') === 's');
  const used = new Set();
  let total = 0;
  for (const doc of sheetDocs) {
    for (const c of cellsOf(doc)) {
      used.add(Number(c.getElementsByTagName('v')[0].textContent));
      total += 1;
    }
  }
  const items = [...sstDoc.getElementsByTagName('si')];
  const remap = new Map();
  items.forEach((si, i) => {
    if (used.has(i)) remap.set(i, remap.size);
    else si.parentNode.removeChild(si);
  });
  for (const doc of sheetDocs) {
    for (const c of cellsOf(doc)) {
      const v = c.getElementsByTagName('v')[0];
      v.firstChild.data = String(remap.get(Number(v.textContent)));
    }
  }
  sstDoc.documentElement.setAttribute('count', String(total));
  sstDoc.documentElement.setAttribute('uniqueCount', String(remap.size));
}

// 파일 이름에 쓸 수 없는 글자를 뺀다 (Windows)
function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
}

export function outputFileName(result, config = defaultConfig) {
  return safeFileName(
    config.fileNamePattern
      .replace('{접수번호}', () => result.equipment.receipt_no)
      .replace('{회사명}', () => result.equipment.company),
  );
}

// 사용자가 고른 파일이 쓸 수 있는 양식인지 본다 (시트 이름 6개, 공유 문자열, 민감도 차트 2개). 아니면 화면에 그대로 보여 줄 한국어 오류를 던진다
const CHART_PARTS = ['xl/charts/chart1.xml', 'xl/charts/chart2.xml']; // 30 %, 70 %
export async function checkTemplate(bytes, config = defaultConfig) {
  const notXlsx = () => new Error('Excel 양식 파일(.xlsx)이 아닙니다.');
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw notXlsx();
  }
  const workbook = zip.file('xl/workbook.xml');
  const rels = zip.file(REL_NS_PATH);
  if (!workbook || !rels) throw notXlsx();
  const paths = sheetPaths(await workbook.async('string'), await rels.async('string'));
  for (const name of config.sheetNames) {
    if (!paths[name]) throw new Error(`양식에 '${name}' 시트가 없습니다.`);
  }
  const needed = [...config.sheetNames.map((name) => paths[name]), 'xl/sharedStrings.xml', ...CHART_PARTS];
  if (needed.some((part) => !zip.file(part))) throw new Error('양식의 구조가 맞지 않습니다. 계산식 양식 파일인지 확인하세요.');
}

// templateBytes: 양식 xlsx / result, summaries: analyze() 결과 / optional: 선택 입력 / 반환: { bytes, fileName }
export async function buildXlsx(templateBytes, result, summaries, optional = {}, config = defaultConfig, source = null) {
  if (!result || !summaries) throw new Error('검증을 통과한 결과가 없어 Excel을 만들 수 없습니다.');
  const provenance = source ? await prepareProvenance(source.files, source.analysis, result, source.confirmedAt) : null;
  const zip = await JSZip.loadAsync(templateBytes);
  const read = (path) => zip.file(path).async('string');

  const paths = sheetPaths(await read('xl/workbook.xml'), await read(REL_NS_PATH));
  const values = cellValues(result, summaries, optional, config);
  if (provenance) {
    for (const row of provenance.rows) {
      if (['rep_summary', 'sen_summary'].includes(row.slot.id)) continue;
      const { sheet } = rawLocation(row, config);
      Object.assign(values[sheet], sourceRawCells(row));
    }
  }
  const sheetDocs = [];
  const docByPath = {};
  for (const name of config.sheetNames) {
    const path = paths[name];
    if (!path) throw new Error(`양식에 '${name}' 시트가 없습니다.`);
    const doc = parseXml(await read(path));
    if (provenance && config.sheetNames.slice(4).includes(name)) {
      const clear = Object.fromEntries([...doc.getElementsByTagName('c')]
        .filter(cell => splitRef(cell.getAttribute('r')).col >= 13)
        .map(cell => [cell.getAttribute('r'), null]));
      setCells(doc, clear);
    }
    setCells(doc, values[name]);
    sheetDocs.push(doc);
    docByPath[path] = doc;
  }

  // 양식에 추가 시트가 있어도 공유 문자열 번호가 깨지지 않도록 함께 추적한다.
  for (const [name, path] of Object.entries(paths)) {
    if (docByPath[path] || name === '출처') continue;
    const doc = parseXml(await read(path));
    sheetDocs.push(doc);
    docByPath[path] = doc;
  }

  const sstDoc = parseXml(await read('xl/sharedStrings.xml'));
  compactSharedStrings(sstDoc, sheetDocs);
  // createFolders:false — 양식에 없는 폴더 항목(xl/, xl/charts/ …)이 zip에 새로 생기지 않게 한다
  const write = (path, text) => zip.file(path, text, { createFolders: false });
  write('xl/sharedStrings.xml', toXml(sstDoc));
  for (const [path, doc] of Object.entries(docByPath)) write(path, toXml(doc));

  await Promise.all(
    chartValues(result, config).map(async (series, i) => {
      const path = `xl/charts/chart${i + 1}.xml`;
      const titleReference = `'${config.sheetNames[2].replaceAll("'", "''")}'!$${i === 0 ? 'AC' : 'AD'}$1`;
      write(path, updateChart(await read(path), series, titleReference));
    }),
  );

  if (provenance) await appendProvenance(zip, provenance, config);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { bytes, fileName: outputFileName(result, config) };
}
