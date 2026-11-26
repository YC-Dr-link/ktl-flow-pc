// 결과 xlsx 바이트를 다시 열어 시트 셀 값·병합·부품 목록을 읽는 검사 도우미
import JSZip from 'jszip';
import { XMLSerializer } from '@xmldom/xmldom';
import { parseXml, readCell } from '../../src/excel/sheetXml.js';

const ser = (el) => new XMLSerializer().serializeToString(el);

// { zip, sheetPaths: {이름: 경로}, sheet(이름) → { doc, cell(ref), cells(), merges(), part(태그) } }
export async function openXlsx(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const read = (p) => zip.file(p).async('string');
  const rels = new Map(
    [...parseXml(await read('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship')].map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]),
  );
  const sheetNames = [];
  const sheetPaths = {};
  for (const s of [...parseXml(await read('xl/workbook.xml')).getElementsByTagName('sheet')]) {
    sheetNames.push(s.getAttribute('name'));
    sheetPaths[s.getAttribute('name')] = `xl/${rels.get(s.getAttribute('r:id'))}`;
  }
  const sst = [...parseXml(await read('xl/sharedStrings.xml')).getElementsByTagName('si')].map((si) =>
    [...si.getElementsByTagName('t')].map((t) => t.textContent).join(''),
  );
  const sheets = {};
  for (const name of sheetNames) {
    const doc = parseXml(await read(sheetPaths[name]));
    const cellEls = new Map([...doc.getElementsByTagName('c')].map((c) => [c.getAttribute('r'), c]));
    sheets[name] = {
      doc,
      el: (ref) => cellEls.get(ref) || null,
      cell: (ref) => (cellEls.has(ref) ? readCell(cellEls.get(ref), sst) : null),
      refs: () => [...cellEls.keys()],
      merges: () => [...doc.getElementsByTagName('mergeCell')].map((m) => m.getAttribute('ref')),
      part: (tag) => [...doc.getElementsByTagName(tag)].map(ser).join(''),
    };
  }
  return { zip, sheetNames, sheetPaths, sst, sheets, read };
}

// zip 안 모든 텍스트 부품(xml, rels)을 { 경로: 문자열 }로
export async function textParts(zip) {
  const out = {};
  for (const name of Object.keys(zip.files)) {
    if (/\.(xml|rels|vml)$/.test(name)) out[name] = await zip.file(name).async('string');
  }
  return out;
}
