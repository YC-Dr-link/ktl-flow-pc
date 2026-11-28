// 교정일 글자를 「YYYY년 MM월 DD일」로 바꾸는 규칙을 본다. 연-월-일, 월-일-연도(합성 set_a), 실제 견본 꼴 「YYYY 년 MM 월 DD 일」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatTestDate } from '../../src/core/compute.js';
import { analyze } from '../../src/core/analyze.js';
import { isRealDate, parseDate } from '../../src/core/csv.js';
import { loadSample, replaceInLine, toList } from '../helpers/fixture.js';

test('연도가 앞에 오는 날짜', () => {
  assert.equal(formatTestDate('2024 년 3 월 9 일'), '2024년 03월 09일');
  assert.equal(formatTestDate('2026-11-03'), '2026년 11월 03일');
  assert.equal(formatTestDate('2026.1.5'), '2026년 01월 05일');
});

test('연도가 뒤에 오는 날짜는 월-일-연도로 읽는다', () => {
  assert.equal(formatTestDate('11-02-2026'), '2026년 11월 02일');
  assert.equal(formatTestDate('1/5/2026'), '2026년 01월 05일');
});

test('합성 set_a(MM-DD-YYYY) CSV의 시험일자', () => {
  const dir = new URL('../../synthetic/set_a/', import.meta.url);
  const files = fs.readdirSync(dir).filter((n) => n.endsWith('.csv')).map((name) => ({ name, bytes: new Uint8Array(fs.readFileSync(new URL(name, dir))) }));
  assert.equal(analyze(files).result.equipment.test_date, '2026년 11월 02일');
});

test('연도 4자리 · 월 1~12 · 일 1~31이 아니면 날짜로 읽지 않는다', () => {
  for (const bad of ['11-02-26', '2026-13-40', '2026-00-10', '2026-02-32', '2026-11', '']) assert.equal(parseDate(bad), null, bad);
  assert.deepEqual(parseDate('2026-11-03'), ['2026', '11', '03']);
});

test('교정일이 날짜가 아니면 VALUE_INVALID로 막고 결과를 내지 않는다', () => {
  const sample = loadSample('set_a');
  const bad = replaceInLine(sample.rep_summary, 10, '11-02-2026', '13-40-2026');
  const r = analyze(toList({ ...sample, rep_summary: bad }));
  assert.equal(r.result, null);
  assert.ok(r.errors.some((e) => e.code === 'VALUE_INVALID' && e.row === 10 && e.file === bad.name), JSON.stringify(r.errors));
});

test('있는 날짜만 받는다: 그달의 날 수 · 윤년 (PR #29 리뷰)', () => {
  assert.deepEqual(parseDate('2024-02-29'), ['2024', '02', '29']); // 윤년
  for (const bad of ['2025-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026.99.99']) assert.equal(parseDate(bad), null, bad);
  assert.equal(isRealDate(2000, 2, 29), true); // 400으로 나누어지면 윤년
  assert.equal(isRealDate(1900, 2, 29), false); // 100으로 나누어지면 평년
});
