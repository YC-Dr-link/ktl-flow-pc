// 작년 Excel(이 도구가 만든 파일 또는 같은 양식의 xlsx · xlsm)의 일반사항 시트에서 저장 화면 입력 값을 읽는다 (#24)
// TODO(확인 필요): 연구원이 손으로 만든 실제 xlsm이 같은 셀 위치 · 날짜 표기인지 (Q13)
import defaultConfig from '../config.js';
import { OPTIONAL_FIELDS } from './cellValues.js';
import { parseXml, readCell } from './sheetXml.js';
import { sheetPaths } from './buildXlsx.js';
import { loadWorkbook } from './workbookSafety.js';

// 작년 값을 불러오는 입력 키 (PM 목록). 접수일자(G3) · 참조 성적서 번호(G13)는 올해 값이라 뺀다
const CARRY_KEYS = ['representative', 'phone', 'maker', 'approvalNumber', 'approvalDate', 'firstInspectionDate', 'pitotType', 'pitotSerial'];
const DATE_KEYS = new Set(['approvalDate', 'firstInspectionDate', 'previousInspectionDate']);

// Excel 날짜 일련번호 → 「YYYY년 MM월 DD일」. 시각(소수)은 버린다. TODO(확인 필요): 양식 칸의 날짜 표기
// date1904: 통합 문서가 1904 날짜 체계(workbookPr date1904)면 0 = 1904-01-01 (PR #29 리뷰).
// 1900 체계는 Excel이 1900-02-29(60)를 있는 날로 세므로 60 미만은 하루를 당기고, 60은 없는 날이라 빈칸
export function excelDateText(serial, { date1904 = false } = {}) {
  if (!Number.isFinite(serial) || serial < (date1904 ? 0 : 1) || serial > 2958465) return ''; // 빈 칸을 가리키는 수식의 0 · 음수 · 9999-12-31 넘는 값은 빈칸
  const day = Math.floor(serial);
  let base;
  if (date1904) base = Date.UTC(1904, 0, 1);
  else if (day === 60) return '';
  else base = day < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const d = new Date(base + day * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}년 ${pad(d.getUTCMonth() + 1)}월 ${pad(d.getUTCDate())}일`;
}

// 공유 문자열 하나: 직계 <t>와 서식 조각 <r>/<t>만 잇는다. 윗주(<rPh>)의 <t>는 뺀다
const kids = (el, name) => [...el.childNodes].filter((n) => n.nodeType === 1 && (n.localName || n.nodeName) === name);
const siText = (si) => [...kids(si, 't'), ...kids(si, 'r').flatMap((r) => kids(r, 't'))].map((t) => t.textContent).join('');

const KNOWN_ERRORS = new Set();
const fail = (message) => {
  const e = new Error(message);
  KNOWN_ERRORS.add(e);
  return e;
};

// bytes: 고른 파일. 반환: { serial(D8 기기 번호, 못 읽으면 ''), values: { 입력 키: 글자 } }.
// 오류는 모두 화면에 보여 줄 한국어 문구로 던진다 (원문은 개발자 도구에만)
export async function readPreviousGeneral(bytes, config = defaultConfig) {
  try {
    return await readGeneral(bytes, config);
  } catch (e) {
    if (KNOWN_ERRORS.has(e)) throw e;
    console.error(e);
    throw new Error('작년 파일을 읽지 못했습니다. 파일이 손상되지 않았는지 확인하세요.');
  }
}

async function readGeneral(bytes, config) {
  let zip;
  try {
    zip = await loadWorkbook(bytes, { output: false });
  } catch (error) {
    if (error.message.startsWith('Excel 양식을 사용할 수 없습니다.')) throw fail(error.message);
    throw fail('Excel 파일(.xlsx · .xlsm)이 아닙니다.');
  }
  const read = (p) => zip.file(p)?.async('string');
  const [workbook, rels] = await Promise.all([read('xl/workbook.xml'), read('xl/_rels/workbook.xml.rels')]);
  if (!workbook || !rels) throw fail('Excel 파일(.xlsx · .xlsm)이 아닙니다.');
  // 통합 문서의 날짜 체계 (workbookPr date1904="1" 또는 "true")
  const pr = parseXml(workbook).getElementsByTagNameNS('*', 'workbookPr')[0]; // x: 같은 접두사가 붙어도 찾는다
  const date1904 = ['1', 'true'].includes(String(pr?.getAttribute('date1904') ?? '').toLowerCase());
  const general = config.sheetNames[0];
  const path = sheetPaths(workbook, rels)[general];
  const sheetXml = path && (await read(path));
  if (!sheetXml) throw fail(`작년 파일에 '${general}' 시트가 없습니다.`);
  const sstXml = await read('xl/sharedStrings.xml');
  const sst = sstXml ? [...parseXml(sstXml).getElementsByTagName('si')].map(siText) : [];
  const cells = new Map([...parseXml(sheetXml).getElementsByTagName('c')].map((c) => [c.getAttribute('r'), c]));
  const cell = (ref) => (cells.has(ref) ? readCell(cells.get(ref), sst) : null);

  // 칸 값 → 입력 글자. 「-」(빈칸 표시)와 빈 값은 없음으로 본다
  const asText = (key, v) => {
    if (v == null || (typeof v === 'number' && Number.isNaN(v))) return '';
    if (typeof v === 'number' && DATE_KEYS.has(key)) return excelDateText(v, { date1904 });
    const t = String(v).trim();
    return t === config.optionalBlank ? '' : t;
  };
  const values = {};
  for (const key of CARRY_KEYS) {
    const t = asText(key, cell(OPTIONAL_FIELDS[key].cell));
    if (t) values[key] = t;
  }
  const coef = asText('pitotCoefficient', cell('H11'));
  if (coef) values.pitotCoefficient = coef;
  // G6 「ST 2」 → 2. 손으로 쓴 「ST2」 · 「ST-2」도 앞 글자(config.unitNumberLabel의 {값} 앞)를 뗀다
  const pre = config.unitNumberLabel.split('{값}')[0].trim();
  const unit = asText('unitNumber', cell('G6'));
  if (unit) values.unitNumber = pre && unit.startsWith(pre) ? unit.slice(pre.length).replace(/^[\s-]+/, '').trim() : unit;
  // 작년 시험일(D11)은 올해의 직전 정도검사일
  const lastTest = asText('previousInspectionDate', cell('D11'));
  if (lastTest) values.previousInspectionDate = lastTest;
  return { serial: asText('', cell('D8')), values };
}
