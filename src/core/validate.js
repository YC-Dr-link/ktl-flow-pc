// 칸에 배정된 파일을 검증해 오류와 경고를 코드·파일·행·한국어 메시지로 만든다 (CALCULATION 3절: 오류 8종, 경고 3종. CONFIG_INVALID·COMPUTE_FAILED는 analyze.js에서, 나머지는 여기서 만든다)
import { COLUMN_NAME_ROW, collapseSpaces, headerValue, parseDate, parseNumber } from './csv.js';
import { FORMATS, FORMAT_NAMES, TEST_NAMES } from './classify.js';
import { SLOTS, slotLabel } from './assign.js';

const MIN_COLUMNS = { summary: 11, source: 10 };
// 숫자여야 하는 열 범위 (0부터, 끝 포함): 요약 B~I, source D~J
const NUMERIC_COLUMNS = { summary: [1, 8], source: [3, 9] };
const ROW_COUNT_KEY = { repeatability: 'rep', linearity: 'lin', sensitivity: 'sen' };
const HEADER_ITEM_NAMES = { 1: '의뢰 기관', 4: '모델명', 5: '기기 번호', 6: '최대 유속', 10: '교정일' };
const MAX_VALUE_ERRORS_PER_FILE = 20;

function err(code, message, extra = {}) {
  return { code, severity: 'error', message, ...extra };
}
function warn(code, message, extra = {}) {
  return { code, severity: 'warning', message, ...extra };
}

// 숫자 열 검사. 파일 하나의 VALUE_INVALID 오류 목록
function checkValues(item, slot) {
  const [from, to] = NUMERIC_COLUMNS[slot.format];
  const names = item.file.rows[COLUMN_NAME_ROW - 1];
  const errors = [];
  let total = 0;
  for (const { row, cells } of item.file.data) {
    const bad = [];
    for (let c = from; c <= to; c += 1) {
      const label = names[c] || `${c + 1}번째 열`;
      const v = parseNumber(cells[c] ?? '');
      if (!Number.isFinite(v)) bad.push(`${label}='${cells[c] ?? ''}'(숫자가 아님)`);
      // 요약 파일의 기준유속(B열)은 오차 계산의 분모라 0 이하이면 계산이 틀어진다
      else if (slot.format === 'summary' && c === 1 && v <= 0) bad.push(`${label}=${v}(0보다 커야 함)`);
    }
    if (!bad.length) continue;
    total += 1;
    if (total <= MAX_VALUE_ERRORS_PER_FILE) {
      errors.push(
        err('VALUE_INVALID', `'${item.name}' ${row}행에 사용할 수 없는 값이 있습니다: ${bad.join(', ')}.`, {
          slot: slot.id,
          file: item.name,
          row,
        }),
      );
    }
  }
  if (total > MAX_VALUE_ERRORS_PER_FILE) {
    errors.push(
      err('VALUE_INVALID', `'${item.name}'에 사용할 수 없는 값이 있는 행이 ${total}개입니다 (앞의 ${MAX_VALUE_ERRORS_PER_FILE}개만 표시).`, {
        slot: slot.id,
        file: item.name,
      }),
    );
  }
  return errors;
}

// 머리글 값 자체가 계산에 쓸 수 있는지: 의뢰기관(1행) 있음, 최대유속(6행) 양수, 교정일(10행)이 연도 4자리 · 월 1~12 · 일 1~31
function checkHeaderValues(item, slot) {
  const errors = [];
  const bad = (row, what) =>
    errors.push(err('VALUE_INVALID', `'${item.name}' ${row}행(${HEADER_ITEM_NAMES[row]})이 ${what}.`, { slot: slot.id, file: item.name, row }));
  if (!headerValue(item.file, 1)) bad(1, '비어 있습니다');
  const max = parseNumber(headerValue(item.file, 6));
  if (!(max > 0)) bad(6, '양수 숫자가 아닙니다');
  if (!parseDate(headerValue(item.file, 10))) bad(10, '날짜(연도 4자리 · 월 1~12 · 일 1~31)가 아닙니다');
  return errors;
}

// 칸별 파일 검사. SLOT_FORMAT → VALUE_INVALID → ROW_COUNT → SLOT_MISMATCH
function checkSlotFile(item, slot, config) {
  const names = item.file.rows[COLUMN_NAME_ROW - 1];
  const first = names ? names[0] : '';
  if (first !== FORMATS[slot.format] || names.length < MIN_COLUMNS[slot.format]) {
    return {
      ok: false,
      errors: [
        err(
          'SLOT_FORMAT',
          `'${item.name}' 파일이 ${slotLabel(slot)} 형식이 아닙니다. ${COLUMN_NAME_ROW}행 첫 칸이 '${FORMATS[slot.format]}'이고 ${MIN_COLUMNS[slot.format]}열 이상이어야 합니다 (현재: '${first}', ${names ? names.length : 0}열).`,
          { slot: slot.id, file: item.name, row: COLUMN_NAME_ROW },
        ),
      ],
    };
  }
  const errors = [...checkValues(item, slot), ...checkHeaderValues(item, slot)];
  const valueOk = errors.length === 0;
  if (slot.format === 'summary') {
    const expected = config.rowCounts[ROW_COUNT_KEY[slot.test]];
    if (item.file.data.length !== expected) {
      errors.push(
        err('ROW_COUNT', `'${item.name}' 파일의 데이터가 ${item.file.data.length}행입니다. ${slotLabel(slot)}은 ${expected}행이어야 합니다.`, {
          slot: slot.id,
          file: item.name,
        }),
      );
    }
  }
  const c = item.classification;
  if (valueOk && c.test !== slot.test) {
    errors.push(
      err(
        'SLOT_MISMATCH',
        c.test
          ? `'${item.name}' 파일은 내용상 ${TEST_NAMES[c.test]} ${FORMAT_NAMES[c.format]}인데 ${slotLabel(slot)} 칸에 들어 있습니다.`
          : `'${item.name}' 파일은 ${slotLabel(slot)}로 판별되지 않습니다. ${c.evidence.reason}`,
        { slot: slot.id, file: item.name },
      ),
    );
  }
  return { ok: errors.length === 0, errors };
}

// 6개 파일의 머리글이 같은지. 연속 공백은 하나로 보고 비교
function checkHeaders(items, config) {
  const errors = [];
  for (const row of config.headerCheckRows) {
    const groups = new Map();
    for (const item of items) {
      const v = collapseSpaces(headerValue(item.file, row));
      groups.set(v, [...(groups.get(v) || []), item.name]);
    }
    if (groups.size <= 1) continue;
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const detail = sorted.map(([v, names]) => `'${v}' ← ${names.map((n) => `'${n}'`).join(', ')}`).join(' / ');
    errors.push(
      err('HEADER_MISMATCH', `${HEADER_ITEM_NAMES[row] || `${row}행`}(${row}행)이 파일마다 다릅니다: ${detail}.`, {
        file: sorted[sorted.length - 1][1][0],
        files: items.map((i) => i.name),
        row,
      }),
    );
  }
  return errors;
}

function pairOf(bySlot, test) {
  return [
    bySlot[SLOTS.find((x) => x.test === test && x.format === 'summary').id],
    bySlot[SLOTS.find((x) => x.test === test && x.format === 'source').id],
  ];
}

// 같은 시험의 요약·source 교정 시간(11행) 비교
function checkPairTimes(bySlot) {
  const warnings = [];
  for (const test of Object.keys(TEST_NAMES)) {
    const [s, r] = pairOf(bySlot, test);
    if (!s || !r) continue;
    const a = collapseSpaces(headerValue(s.file, 11));
    const b = collapseSpaces(headerValue(r.file, 11));
    if (a !== b) {
      warnings.push(
        warn('PAIR_TIME', `${TEST_NAMES[test]} 요약('${s.name}')과 source('${r.name}')의 교정 시간이 다릅니다: '${a}' / '${b}'. 같은 시험의 파일이 맞는지 확인하세요.`, {
          file: r.name,
          row: 11,
        }),
      );
    }
  }
  return warnings;
}

// 요약 측정유속(C열)과 source 같은 번호 측정유속(E열) 평균의 상대오차
function checkSourceMatch(bySlot, config) {
  const warnings = [];
  for (const test of Object.keys(TEST_NAMES)) {
    const [s, r] = pairOf(bySlot, test);
    if (!s || !r) continue;
    const groups = new Map();
    for (const { cells } of r.file.data) groups.set(cells[0], [...(groups.get(cells[0]) || []), parseNumber(cells[4])]);
    for (const { row, cells } of s.file.data) {
      const g = groups.get(cells[0]);
      const a = parseNumber(cells[2]);
      if (!g) {
        warnings.push(warn('SOURCE_MISMATCH', `${TEST_NAMES[test]} 요약 '${s.name}' ${row}행(저장번호 ${cells[0]})에 맞는 번호가 source '${r.name}'에 없습니다.`, { file: s.name, row }));
        continue;
      }
      const b = g.reduce((x, y) => x + y, 0) / g.length;
      const rel = Math.abs(a - b) / Math.max(Math.abs(b), Number.MIN_VALUE);
      if (rel > config.sourceTolerance) {
        warnings.push(
          warn('SOURCE_MISMATCH', `${TEST_NAMES[test]} 요약 '${s.name}' ${row}행의 측정유속(${a})이 source '${r.name}' 번호 ${cells[0]}의 평균(${b})과 다릅니다 (상대오차 ${rel.toExponential(2)}).`, {
            file: s.name,
            row,
          }),
        );
      }
    }
  }
  return warnings;
}

// 첫 빈 줄 뒤에 데이터가 더 있으면 계산에 쓰이지 않으므로 알린다 (조용히 버리지 않기)
function checkIgnoredRows(bySlot) {
  return Object.values(bySlot)
    .filter((item) => item.file.ignoredAfterBlank > 0)
    .map((item) =>
      warn(
        'DATA_AFTER_BLANK',
        `'${item.name}' ${item.file.blankRow}행의 번호 칸이 비어 있어 그 아래 ${item.file.ignoredAfterBlank}행은 계산에 쓰지 않았습니다. 파일을 확인하세요.`,
        { file: item.name, row: item.file.blankRow },
      ),
    );
}

// items: [{ name, file, classification }] / slots: { 칸id: 파일 번호 | null }
export function validate(items, slots, config) {
  const errors = [];
  const bySlot = {};
  const checked = {};
  for (const slot of SLOTS) {
    const idx = slots[slot.id];
    if (idx === null || idx === undefined || !items[idx]) {
      errors.push(err('FILE_MISSING', `${slotLabel(slot)} 칸이 비어 있습니다.`, { slot: slot.id }));
      continue;
    }
    bySlot[slot.id] = items[idx];
    const res = checkSlotFile(items[idx], slot, config);
    checked[slot.id] = res.ok;
    errors.push(...res.errors);
  }
  errors.push(...checkHeaders(Object.values(bySlot), config));

  // 경고는 형식·값 검사를 통과한 파일 쌍에 대해서만 낸다
  const clean = Object.fromEntries(Object.entries(bySlot).filter(([id]) => checked[id]));
  const warnings = [...checkPairTimes(clean), ...checkSourceMatch(clean, config), ...checkIgnoredRows(bySlot)];
  return { errors, warnings };
}
