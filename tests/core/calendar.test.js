import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCalendarDate } from '../../src/core/calendar.js';
import { parseDate } from '../../src/core/csv.js';
import { isDateText } from '../../src/ui/inputs.js';
import { analyze } from '../../src/core/analyze.js';
import { loadSample, replaceInLine, toList } from '../helpers/fixture.js';

for (const value of ['2026-02-29', '2026-02-30', '2026-04-31', '1900-02-29', '0000-01-01', '2026-01-01abc', 'abc2026-01-01', '2026-01-01 12:30']) {
  test(`달력에 없거나 다른 글자가 붙은 날짜 거부: ${value}`, () => assert.equal(parseDate(value), null));
}
test('윤년·세기 경계와 지원하는 날짜 꼴', () => {
  for (const value of ['2000-02-29', '2024년 02월 29일', '2024.2.29', '2/29/2024']) {
    assert.deepEqual(parseDate(value)?.map(Number), [value.startsWith('2000') ? 2000 : 2024, 2, 29]);
  }
  assert.equal(isCalendarDate(2026, 4, 30), true);
  assert.equal(isCalendarDate(2026, 4, 31), false);
});
test('일반사항은 실제 달력도 확인하지만 두 자리 표기 안내 규칙을 유지한다', () => {
  for (const value of ['2026년 02월 30일', '2026.04.31', '1900.02.29', '2013.8.30']) assert.equal(isDateText(value), false);
  for (const value of ['2024년 02월 29일', '2000.02.29']) assert.equal(isDateText(value), true);
});
test('잘못된 CSV 교정일을 자동 보정하지 않고 결과를 차단한다', () => {
  const sample = loadSample('set_a');
  const bad = replaceInLine(sample.rep_summary, 10, '11-02-2026', '02-30-2026');
  const a = analyze(toList({ ...sample, rep_summary: bad }));
  assert.equal(a.result, null);
  assert.ok(a.errors.some(e => e.code === 'VALUE_INVALID' && e.row === 10));
});
