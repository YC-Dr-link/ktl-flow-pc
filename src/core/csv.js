// 바이트를 문자열로 해독(UTF-8 후 CP949)하고 쉼표로 나눠 머리글·열 이름·데이터로 가른다

// CSV 형식 사실: 1~11행 장비 머리글, 12행 열 이름, 13행 단위, 14행부터 데이터
export const HEADER_ROWS = 11;
export const COLUMN_NAME_ROW = 12;
export const UNIT_ROW = 13;
export const FIRST_DATA_ROW = 14;

// UTF-8로 읽어 보고 실패하면 CP949(EUC-KR)로 읽는다 (FR-M4-02)
export function decodeBytes(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: text.replace(/^\uFEFF/, ''), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('euc-kr').decode(bytes), encoding: 'cp949' };
  }
}

// 줄 나누기와 쉼표 나누기. 따옴표로 감싼 칸은 없다 (CALCULATION 1절). 끝의 빈 줄은 버린다
export function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/);
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.map((line) => line.split(',').map((cell) => cell.trim()));
}

// 해독된 행 배열을 머리글 / 열 이름 / 단위 / 데이터로 가른다. 데이터는 첫 열이 빈 줄 앞까지
export function splitRows(rows) {
  const data = [];
  let i = FIRST_DATA_ROW - 1;
  for (; i < rows.length; i += 1) {
    if (!rows[i][0]) break;
    data.push({ row: i + 1, cells: rows[i] });
  }
  // 첫 빈 줄 뒤에 첫 열이 채워진 줄이 더 있으면 계산에는 쓰지 않으므로 알릴 수 있게 센다
  const ignoredAfterBlank = rows.slice(i + 1).filter((r) => r[0]).length;
  return {
    header: rows.slice(0, HEADER_ROWS),
    columnNames: rows[COLUMN_NAME_ROW - 1] || null,
    units: rows[UNIT_ROW - 1] || null,
    data,
    ignoredAfterBlank,
    blankRow: i < rows.length ? i + 1 : null,
  };
}

// 이름과 바이트로 파일 하나를 읽는다. 읽기 문제로 던지지 않는다
export function readCsvFile(name, bytes) {
  const { text, encoding } = decodeBytes(bytes);
  const rows = parseCsv(text);
  return { name, encoding, rows, ...splitRows(rows) };
}

// 머리글 값 (1부터 센 행 번호, B열). 없으면 빈 문자열
export function headerValue(file, row) {
  return (file.rows[row - 1] && file.rows[row - 1][1]) || '';
}

// 연속 공백을 하나로 본다 (HEADER_MISMATCH, PAIR_TIME 비교용)
export function collapseSpaces(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

// 엄격한 숫자 해석. 빈 칸, 공백, 0x10 같은 값은 NaN (Number('')는 0이라 그대로 쓰지 않는다)
export function parseNumber(s) {
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(String(s).trim()) ? Number(s) : NaN;
}

// 교정일 글자의 숫자 3개를 [연, 월, 일] 글자로. 4자리 수를 연도로 보고, 연도가 마지막이면 월-일-연도로 읽는다.
// 연도가 4자리가 아니거나 월 1~12 · 일 1~31을 벗어나면 null (검증에서 VALUE_INVALID로 막는다)
// TODO(확인 필요): 실제 장비 CSV가 MM-DD-YYYY를 내는지. 실제 견본 꼴은 「YYYY 년 MM 월 DD 일」, 합성 set_a는 11-02-2026
export function parseDate(text) {
  const nums = String(text).match(/\d+/g) || [];
  if (nums.length < 3) return null;
  const [y, m, d] = nums[2].length === 4 && nums[0].length !== 4 ? [nums[2], nums[0], nums[1]] : nums;
  const ok = y.length === 4 && Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31;
  return ok ? [y, m, d] : null;
}
