// 시트 XML에서 셀 값만 바꾼다. 서식(s)은 유지하고, 없는 행·셀은 순서에 맞게 끼워 넣는다 (EXCEL_MAPPING 1절)
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

export function parseXml(text) {
  return new DOMParser().parseFromString(text, 'text/xml');
}

// 선언부(<?xml …?>)는 직렬화에서 빠지므로 다시 붙인다
export function toXml(doc) {
  return DECLARATION + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
}

export function colToNum(col) {
  return [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

export function numToCol(n) {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export function splitRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`셀 주소 형식이 아닙니다: ${ref}`);
  return { col: colToNum(m[1]), row: Number(m[2]) };
}

const children = (el, name) => [...el.childNodes].filter((n) => n.nodeType === 1 && n.nodeName === name);

// XML 1.0이 허용하지 않는 문자(세로 탭 등)는 Excel 복구 경고를 부르므로 지운다. 눈에 보이는 글자에는 영향이 없다
const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
export const stripXmlForbidden = (s) => s.replace(XML_FORBIDDEN, '');

// 셀 하나의 값을 쓴다. 숫자는 <v>, 문자열은 inlineStr, null은 비움. s(서식)는 건드리지 않는다
function writeValue(doc, cell, value) {
  while (cell.firstChild) cell.removeChild(cell.firstChild);
  cell.removeAttribute('t');
  const ns = doc.documentElement.namespaceURI;
  if (value === null || value === '') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`${cell.getAttribute('r')}: 유한한 숫자가 아닙니다.`);
    const v = doc.createElementNS(ns, 'v');
    v.appendChild(doc.createTextNode(String(value)));
    cell.appendChild(v);
    return;
  }
  if (typeof value !== 'string') throw new TypeError(`${cell.getAttribute('r')}: 숫자나 문자열이어야 합니다.`);
  cell.setAttribute('t', 'inlineStr');
  const is = doc.createElementNS(ns, 'is');
  const t = doc.createElementNS(ns, 't');
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  t.appendChild(doc.createTextNode(stripXmlForbidden(value)));
  is.appendChild(t);
  cell.appendChild(is);
}

// cells: { 'E16': 1.5, 'D2': '회사', 'B3': null }
// null이면 칸 값을 비운다 (칸이 없으면 만들지 않음). 바꾼 행의 spans는 지운다
export function setCells(doc, cells) {
  const sheetData = doc.getElementsByTagName('sheetData')[0];
  const ns = doc.documentElement.namespaceURI;
  const rowEls = new Map(children(sheetData, 'row').map((r) => [Number(r.getAttribute('r')), r]));

  const byRow = new Map();
  for (const [ref, value] of Object.entries(cells)) {
    const { col, row } = splitRef(ref);
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push({ ref, col, value });
  }

  for (const rowNum of [...byRow.keys()].sort((a, b) => a - b)) {
    const items = byRow.get(rowNum).sort((a, b) => a.col - b.col);
    let rowEl = rowEls.get(rowNum);
    if (!rowEl) {
      if (items.every((i) => i.value === null || i.value === '')) continue;
      rowEl = doc.createElementNS(ns, 'row');
      rowEl.setAttribute('r', String(rowNum));
      const next = [...rowEls.entries()].filter(([n]) => n > rowNum).sort((a, b) => a[0] - b[0])[0];
      sheetData.insertBefore(rowEl, next ? next[1] : null);
      rowEls.set(rowNum, rowEl);
    }
    rowEl.removeAttribute('spans');
    const cellEls = new Map(children(rowEl, 'c').map((c) => [splitRef(c.getAttribute('r')).col, c]));
    for (const { ref, col, value } of items) {
      let cell = cellEls.get(col);
      if (!cell) {
        if (value === null || value === '') continue;
        cell = doc.createElementNS(ns, 'c');
        cell.setAttribute('r', ref);
        const next = [...cellEls.entries()].filter(([n]) => n > col).sort((a, b) => a[0] - b[0])[0];
        rowEl.insertBefore(cell, next ? next[1] : null);
        cellEls.set(col, cell);
      }
      writeValue(doc, cell, value);
    }
  }
  updateDimension(doc);
}

// 값이 들어갈 수 있는 셀 범위에 맞춰 <dimension>을 다시 쓴다
export function updateDimension(doc) {
  const dim = doc.getElementsByTagName('dimension')[0];
  if (!dim) return;
  let minC = Infinity;
  let maxC = 0;
  let minR = Infinity;
  let maxR = 0;
  for (const c of [...doc.getElementsByTagName('c')]) {
    const { col, row } = splitRef(c.getAttribute('r'));
    minC = Math.min(minC, col);
    maxC = Math.max(maxC, col);
    minR = Math.min(minR, row);
    maxR = Math.max(maxR, row);
  }
  if (maxC === 0) return;
  dim.setAttribute('ref', `${numToCol(minC)}${minR}:${numToCol(maxC)}${maxR}`);
}

// 셀 값을 읽는다 (테스트와 검사용). 공유 문자열은 sst 배열로 풀어 준다
export function readCell(cell, sst = []) {
  const t = cell.getAttribute('t');
  if (t === 'inlineStr') return children(cell, 'is').flatMap((is) => [...is.getElementsByTagName('t')]).map((x) => x.textContent).join('');
  const v = children(cell, 'v')[0];
  if (!v) return null;
  if (t === 's') return sst[Number(v.textContent)];
  if (t === 'str') return v.textContent;
  return Number(v.textContent);
}
