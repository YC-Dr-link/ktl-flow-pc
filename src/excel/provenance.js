// 원본 CSV 바이트와 화면에서 확정한 정보를 출처 시트에 기록한다 (#7).
import packageInfo from '../../package.json' with { type: 'json' };
import { analyze } from '../core/analyze.js';
import { decodeBytes, readCsvFile } from '../core/csv.js';
import { parseXml, setCells, toXml, numToCol } from './sheetXml.js';

const SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RAW_COLUMNS = { rep_summary: 'A', rep_source: 'M', lin_summary: 'X', lin_source: 'AJ', sen_summary: 'A', sen_source: 'M' };

export async function prepareProvenance(files, analysis, result, confirmedAt = new Date().toISOString()) {
  if (files.length !== 6 || !analysis?.result) throw new Error('출처를 기록하려면 검증된 CSV 6개가 필요합니다.');
  if (!Number.isFinite(Date.parse(confirmedAt))) throw new Error('출처 확인 시각이 올바르지 않습니다.');
  const slots = Object.values(analysis.slots);
  if (new Set(slots.map(s => s.fileIndex)).size !== 6 || slots.some(s => !files[s.fileIndex])) {
    throw new Error('출처의 CSV 칸 배정이 올바르지 않습니다.');
  }
  // 호출 후 원본 배열이 바뀌어도 해시·raw 데이터·판별 정보는 같은 스냅샷을 사용한다.
  const snapshot = files.map(f => ({ name: f.name, bytes: new Uint8Array(f.bytes) }));
  const assignment = Object.fromEntries(slots.filter(s => s.manual).map(s => [s.id, s.fileIndex]));
  const checked = analyze(snapshot, { assignment });
  if (!checked.result || JSON.stringify(checked.result) !== JSON.stringify(analysis.result) ||
      slots.some(s => checked.slots[s.id]?.fileIndex !== s.fileIndex)) {
    throw new Error('CSV가 바뀌었습니다. 다시 계산하고 확인한 뒤 저장하세요.');
  }
  for (const key of ['repeatability', 'linearity', 'sensitivity', 'environment']) {
    if (JSON.stringify(result[key]) !== JSON.stringify(checked.result[key])) throw new Error('계산 결과가 CSV와 다릅니다. 다시 확인하세요.');
  }
  const rows = await Promise.all(slots.map(async slot => {
    const file = snapshot[slot.fileIndex];
    const parsed = readCsvFile(file.name, file.bytes);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', file.bytes);
    return {
      slot, file, parsed,
      sha256: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''),
      evidence: checked.slots[slot.id].evidence,
    };
  }));
  return {
    rows, confirmedAt, version: packageInfo.version,
    receipt: String(result.equipment.receipt_no), company: String(result.equipment.company),
    originalReceipt: checked.result.equipment.receipt_no, originalCompany: checked.result.equipment.company,
  };
}

// 원래 행 번호를 유지한다. CSV 문자열을 수식으로 해석하지 않도록 문자열 셀에 쓴다.
export function sourceRawCells(row) {
  const text = decodeBytes(row.file.bytes).text;
  const lines = text.split(/\r\n|\n|\r/);
  while (lines.length && lines.at(-1) === '') lines.pop();
  const start = [...RAW_COLUMNS[row.slot.id]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  return Object.fromEntries(lines.flatMap((line, i) => line.split(',').map((value, j) => [`${numToCol(start + j)}${i + 1}`, value])));
}

export function rawLocation(row, config) {
  const sheet = config.sheetNames[row.slot.test === 'sensitivity' ? 5 : 4];
  return { sheet, column: RAW_COLUMNS[row.slot.id] };
}

export async function appendProvenance(zip, provenance, config, generatedAt = new Date().toISOString()) {
  const workbookPath = 'xl/workbook.xml';
  const relPath = 'xl/_rels/workbook.xml.rels';
  const wb = parseXml(await zip.file(workbookPath).async('string'));
  const rels = parseXml(await zip.file(relPath).async('string'));
  const types = parseXml(await zip.file('[Content_Types].xml').async('string'));
  const sheets = wb.getElementsByTagName('sheets')[0];
  if (!sheets) throw new Error('양식의 시트 목록을 읽지 못했습니다.');
  const existing = [...sheets.getElementsByTagName('sheet')].find(s => s.getAttribute('name') === '출처');
  let part;
  if (existing) {
    const relation = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === existing.getAttribute('r:id'));
    const target = relation?.getAttribute('Target');
    part = target?.startsWith('/') ? target.slice(1) : `xl/${target}`;
    if (!zip.file(part)) throw new Error('양식의 출처 시트 경로가 올바르지 않습니다.');
  } else {
    let suffix = 1;
    do { part = `xl/worksheets/provenance${suffix++}.xml`; } while (zip.file(part));
    const ids = new Set([...rels.getElementsByTagName('Relationship')].map(r => r.getAttribute('Id')));
    let id = 'rIdProvenance';
    while (ids.has(id)) id += 'X';
    const relation = rels.createElementNS(rels.documentElement.namespaceURI, 'Relationship');
    relation.setAttribute('Id', id); relation.setAttribute('Type', `${REL_NS}/worksheet`);
    relation.setAttribute('Target', part.slice(3)); rels.documentElement.appendChild(relation);
    const sheet = wb.createElementNS(SHEET_NS, 'sheet');
    sheet.setAttribute('name', '출처');
    sheet.setAttribute('sheetId', String(Math.max(0, ...[...sheets.getElementsByTagName('sheet')].map(s => Number(s.getAttribute('sheetId')))) + 1));
    sheet.setAttributeNS(REL_NS, 'r:id', id); sheets.appendChild(sheet);
    const type = types.createElementNS(types.documentElement.namespaceURI, 'Override');
    type.setAttribute('PartName', `/${part}`);
    type.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
    types.documentElement.appendChild(type);
  }
  const headers = ['원본 파일명', 'SHA-256', '시험 종류', '결과/source', '지정 방식', '원본 행 수', '데이터 행 수', '인코딩', '도구 버전', '생성 시각', '저장 전 확인 시각', '확인 접수번호', '확인 회사명', 'CSV 접수번호', 'CSV 회사명', '판별 근거', '원본 위치'];
  const values = [headers, ...provenance.rows.map(row => {
    const loc = rawLocation(row, config);
    return [row.file.name, row.sha256, row.slot.test, row.slot.format, row.slot.manual ? '수동' : '자동',
      row.parsed.rows.length, row.parsed.data.length, row.parsed.encoding, provenance.version, generatedAt,
      provenance.confirmedAt, provenance.receipt, provenance.company, provenance.originalReceipt, provenance.originalCompany,
      JSON.stringify(row.evidence), `${loc.sheet}!${loc.column}1`];
  })];
  const doc = parseXml(`<worksheet xmlns="${SHEET_NS}"><dimension ref="A1"/><sheetData/></worksheet>`);
  setCells(doc, Object.fromEntries(values.flatMap((r, i) => r.map((v, j) => [`${numToCol(j + 1)}${i + 1}`, v]))));
  for (const [p, d] of [[workbookPath, wb], [relPath, rels], ['[Content_Types].xml', types], [part, doc]]) zip.file(p, toXml(d), { createFolders: false });
}
