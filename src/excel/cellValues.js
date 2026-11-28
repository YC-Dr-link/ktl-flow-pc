// 계산 결과와 요약 CSV 원문을 시트별 {셀: 값}으로 바꾼다. 셀 위치는 docs/EXCEL_MAPPING.md 3절 (미결정이 아닌 사실이라 설정이 아닌 이 표에 둔다)
import { parseNumber } from '../core/csv.js';
import { formatRounded } from '../core/round.js';
import { numToCol } from './sheetXml.js';

// 요약 CSV 열 번호(0부터) → 시트 열. 양식은 B 기준유속, C 대기압, D 차압, E 압력, F 온도, G 습도, H 측정 유속 순서
const DATA_COLUMNS = [
  { col: 'B', csv: 1 },
  { col: 'C', csv: 3 },
  { col: 'D', csv: 4 },
  { col: 'E', csv: 5 },
  { col: 'F', csv: 6 },
  { col: 'G', csv: 7 },
  { col: 'H', csv: 2 },
];

// 선택 입력 키 → 일반사항 셀. required는 비우면 '-'를 넣고, 아니면 입력했을 때만 덮어쓴다 (FR-M5-05)
export const OPTIONAL_FIELDS = {
  maker: { cell: 'G7', blank: true },
  approvalNumber: { cell: 'D9', blank: true },
  approvalDate: { cell: 'D10', blank: true },
  receiptDate: { cell: 'G3' },
  representative: { cell: 'D4' },
  phone: { cell: 'G4' },
  previousInspectionDate: { cell: 'D7' },
  firstInspectionDate: { cell: 'G9' },
  pitotType: { cell: 'G12' },
  pitotSerial: { cell: 'H12' },
  referenceReportNo: { cell: 'G13' },
};

const num = (s) => parseNumber(s);
const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

// 요약 파일 하나의 데이터 행 → 시트 행 번호부터 B~I (I는 sensitive에서만 CSV 오차 열, 반복·직선성에서는 |측정 − 기준|)
function dataRows(file, startRow, errorColumn) {
  const cells = {};
  file.data.forEach(({ cells: row }, i) => {
    const r = startRow + i;
    for (const { col, csv } of DATA_COLUMNS) cells[`${col}${r}`] = num(row[csv]);
    cells[`I${r}`] = errorColumn === 'csv' ? num(row[8]) : Math.abs(num(row[2]) - num(row[1]));
  });
  return cells;
}

// 단위 행 (CSV 13행) → B~H
function unitCells(file, row) {
  return Object.fromEntries(DATA_COLUMNS.map(({ col, csv }) => [`${col}${row}`, file.units[csv] || '']));
}

// raw data 시트: 요약 CSV의 1~13행을 A~K열에 그대로 (6~8행 B열은 숫자), 데이터는 숫자로 읽히면 숫자로
function rawRows(files) {
  const cells = {};
  const first = files[0];
  const put = (r, row, numeric) => {
    row.forEach((v, i) => {
      const ref = `${numToCol(i + 1)}${r}`;
      const n = numeric ? num(v) : NaN;
      cells[ref] = v === '' ? null : Number.isFinite(n) ? n : v;
    });
  };
  first.rows.slice(0, 13).forEach((row, i) => {
    const r = i + 1;
    const padded = Array.from({ length: 11 }, (_, c) => row[c] ?? '');
    padded.forEach((v, c) => {
      const ref = `${numToCol(c + 1)}${r}`;
      cells[ref] = v === '' ? null : r >= 6 && r <= 8 && c === 1 && Number.isFinite(num(v)) ? num(v) : v;
    });
  });
  let r = 14;
  for (const file of files) {
    for (const { cells: row } of file.data) {
      put(r, Array.from({ length: 11 }, (_, c) => row[c] ?? ''), true);
      r += 1;
    }
  }
  return cells;
}

function generalSheet(result, summaries, optional, config) {
  const { equipment: eq, repeatability: rep, linearity: lin, sensitivity: sen } = result;
  const cells = {
    D2: eq.company,
    D3: eq.receipt_no,
    D5: eq.address,
    D8: eq.serial,
    G8: eq.model,
    G10: eq.max_velocity,
    H10: eq.velocity_unit,
    D11: eq.test_date,
    D12: result.overall === '적합' ? config.overallLabels.pass : config.overallLabels.fail,
    E21: rep.zero_pct,
    G21: rep.span_pct,
    I21: rep.value_pct, // TODO(확인 필요): PM #7 임시 최종값 위치, 실제 CLAYDOX 매핑 Q14
    E30: lin.p30_pct,
    G30: lin.p70_pct,
    I30: lin.value_pct, // TODO(확인 필요): 실제 CLAYDOX 매핑 Q14
    C35: sen.velocity_30,
    C39: sen.velocity_70,
  };

  // 반복성 ZERO / SPAN 측정 유속 5개씩
  const measured = (data, rows) => rows.map((r) => num(data[r - 1].cells[2]));
  const zero = measured(summaries.repeatability.data, rep.rows.zero);
  const span = measured(summaries.repeatability.data, rep.rows.span);
  zero.forEach((v, i) => (cells[`E${16 + i}`] = v));
  span.forEach((v, i) => (cells[`G${16 + i}`] = v));

  // 직선성 30 % / 70 % 기준유속·측정 유속
  const lin30 = lin.rows.p30;
  const lin70 = lin.rows.p70;
  const linData = summaries.linearity.data;
  lin30.forEach((r, i) => {
    cells[`E${25 + i}`] = num(linData[r - 1].cells[1]);
    cells[`F${25 + i}`] = num(linData[r - 1].cells[2]);
  });
  lin70.forEach((r, i) => {
    cells[`G${25 + i}`] = num(linData[r - 1].cells[1]);
    cells[`H${25 + i}`] = num(linData[r - 1].cells[2]);
  });

  // 민감도: 열 = 각도, 30 % 34~36행(+평균 37행), 70 % 38~40행(+평균 41행)
  const senData = summaries.sensitivity.data;
  config.chartAngleOrder.forEach((angle, c) => {
    const col = numToCol(4 + c);
    for (const [point, top] of [['30%', 34], ['70%', 38]]) {
      const g = sen.by_angle.find((x) => x.angle === angle && x.point === point);
      for (let k = 0; k < 3; k += 1) cells[`${col}${top + k}`] = num(senData[g.rows[0] - 1 + k].cells[8]);
      cells[`${col}${top + 3}`] = g.value_pct;
    }
  });

  // 선택 입력
  const blank = config.optionalBlank;
  for (const [key, { cell, blank: required }] of Object.entries(OPTIONAL_FIELDS)) {
    const v = text(optional[key]);
    if (v) cells[cell] = v;
    else if (required) cells[cell] = blank;
  }
  const unit = text(optional.unitNumber);
  if (unit) cells.G6 = config.unitNumberLabel.replace('{값}', () => unit);
  const coef = text(optional.pitotCoefficient);
  const coefNum = num(coef.replace(',', '.')); // 0,826처럼 쉼표 소수점도 숫자로 (#24)
  cells.H11 = coef ? (Number.isFinite(coefNum) ? coefNum : coef) : blank; // 양식 자리표시 123을 반드시 덮어씀

  return cells;
}

function repeatLinSheet(result, summaries) {
  const rep = summaries.repeatability;
  const cells = {
    B1: result.equipment.receipt_no,
    ...unitCells(rep, 4),
    ...dataRows(rep, 5),
    ...unitCells(rep, 19),
    ...dataRows(summaries.linearity, 20),
    I19: 'm/s',
    J20: result.linearity.avg_error_pct.p30,
    J25: result.linearity.avg_error_pct.p70,
  };
  const { pressure_hpa: p, temperature_c: t, humidity_pct: h } = result.environment;
  [['30', 'min'], ['31', 'max'], ['32', 'mid']].forEach(([row, k]) => {
    cells[`C${row}`] = p[k];
    cells[`F${row}`] = t[k];
    cells[`G${row}`] = h[k];
  });
  return cells;
}

function sensitiveSheet(result, summaries) {
  const sen = summaries.sensitivity;
  const cells = { B1: result.equipment.receipt_no, ...unitCells(sen, 4), ...dataRows(sen, 5, 'csv') };
  // 그룹 값은 그룹 첫 행에 (J5, J8, …). 시트 행 = 데이터 행 + 4
  for (const g of result.sensitivity.by_angle) cells[`J${g.rows[0] + 4}`] = g.value_pct;
  cells.J36 = result.sensitivity.value_pct;
  cells.AC1 = `${formatRounded(result.sensitivity.velocity_30, 2)} m/s`;
  cells.AD1 = `${formatRounded(result.sensitivity.velocity_70, 2)} m/s`;
  return cells;
}

// 반환: { [시트 이름]: { [셀]: 값 } }. 값은 숫자 | 문자열 | null(비움)
// optional: OPTIONAL_FIELDS의 키들과 unitNumber(호기), pitotCoefficient(피토계수)
export function cellValues(result, summaries, optional, config) {
  const names = config.sheetNames;
  return {
    [names[0]]: generalSheet(result, summaries, optional || {}, config),
    [names[1]]: repeatLinSheet(result, summaries),
    [names[2]]: sensitiveSheet(result, summaries),
    [names[3]]: { B1: result.equipment.receipt_no },
    [names[4]]: rawRows([summaries.repeatability, summaries.linearity]),
    [names[5]]: rawRows([summaries.sensitivity]),
  };
}

// 차트 갱신 값 (EXCEL_MAPPING 4절). 제목은 평균 유속 소수 둘째 자리, Y는 chartAngleOrder 순서 그룹 값
export function chartValues(result, config) {
  const series = (point, velocity) => ({
    title: `${formatRounded(velocity, 2)} m/s`,
    yValues: config.chartAngleOrder.map((angle) => result.sensitivity.by_angle.find((g) => g.angle === angle && g.point === point).value_pct),
  });
  return [series('30%', result.sensitivity.velocity_30), series('70%', result.sensitivity.velocity_70)];
}
