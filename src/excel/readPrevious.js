// 작년 Excel(이 도구가 만든 파일 또는 같은 양식의 xlsx · xlsm)의 일반사항 시트에서 저장 화면 입력 값을 읽는다 (#24)
// TODO(확인 필요): 연구원이 손으로 만든 실제 xlsm이 같은 셀 위치 · 날짜 표기인지 (Q13)
import JSZip from 'jszip';
import defaultConfig from '../config.js';
import { OPTIONAL_FIELDS } from './cellValues.js';
import { parseXml, readCell } from './sheetXml.js';
import { sheetPaths } from './buildXlsx.js';

// 작년 값을 불러오는 입력 키 (PM 목록). 접수일자(G3) · 참조 성적서 번호(G13)는 올해 값이라 뺀다
const CARRY_KEYS = ['representative', 'phone', 'maker', 'approvalNumber', 'approvalDate', 'firstInspectionDate', 'pitotType', 'pitotSerial'];
const DATE_KEYS = new Set(['approvalDate', 'firstInspectionDate', 'previousInspectionDate']);

// Excel 날짜 일련번호(1900 날짜 체계) → 「YYYY년 MM월 DD일». TODO(확인 필요): 양식 칸의 날짜 표기
export function excelDateText(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}년 ${pad(d.getUTCMonth() + 1)}월 ${pad(d.getUTCDate())}일`;
}

// bytes: 고른 파일. 반환: { serial(D8 기기 번호), values: { 입력 키: 글자 } }
export async function readPreviousGeneral(bytes, config = defaultConfig) {
  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('Excel 파일(.xlsx · .xlsm)이 아닙니다.');
  }
  const read = (p) => zip.file(p)?.async('string');
  const [workbook, rels] = await Promise.all([read('xl/workbook.xml'), read('xl/_rels/workbook.xml.rels')]);
  if (!workbook || !rels) throw new Error('Excel 파일(.xlsx · .xlsm)이 아닙니다.');
  const general = config.sheetNames[0];
  const path = sheetPaths(workbook, rels)[general];
  const sheetXml = path && (await read(path));
  if (!sheetXml) throw new Error(`작년 파일에 '${general}' 시트가 없습니다.`);
  const sstXml = await read('xl/sharedStrings.xml');
  const sst = sstXml ? [...parseXml(sstXml).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join('')) : [];
  const cells = new Map([...parseXml(sheetXml).getElementsByTagName('c')].map((c) => [c.getAttribute('r'), c]));
  const cell = (ref) => (cells.has(ref) ? readCell(cells.get(ref), sst) : null);

  // 칸 값 → 입력 글자. 「-」(빈칸 표시)와 빈 값은 없음으로 본다
  const asText = (key, v) => {
    if (v == null || (typeof v === 'number' && Number.isNaN(v))) return '';
    if (typeof v === 'number' && DATE_KEYS.has(key)) return excelDateText(v);
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
  // G6 「ST 2」 → 2 (config.unitNumberLabel의 앞뒤 글자를 뗀다)
  const [pre, post] = config.unitNumberLabel.split('{값}');
  const unit = asText('unitNumber', cell('G6'));
  if (unit) values.unitNumber = unit.startsWith(pre) && unit.endsWith(post) ? unit.slice(pre.length, unit.length - post.length).trim() : unit;
  // 작년 시험일(D11)은 올해의 직전 정도검사일
  const lastTest = asText('previousInspectionDate', cell('D11'));
  if (lastTest) values.previousInspectionDate = lastTest;
  return { serial: asText('', cell('D8')), values };
}
