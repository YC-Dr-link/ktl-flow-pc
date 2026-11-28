// 저장 화면 날짜 칸이 받는 꼴(「YYYY년 MM월 DD일」 · 「YYYY.MM.DD」)을 가려내는지 본다 (#24). 꼴이 다르면 노란 안내만 하고 저장은 막지 않는다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateWarning, isDateText } from '../../src/ui/inputs.js';

test('받는 꼴', () => {
  for (const ok of ['2025년 10월 17일', '2013.08.30', '2019년 05월 01일']) assert.equal(isDateText(ok), true, ok);
});

test('안내를 띄우는 꼴', () => {
  for (const bad of ['2013.8.30', '8.30', '2025년 10월 7일', '2025-10-17', '25.10.17', '2025년10월17일', '']) assert.equal(isDateText(bad), false, bad);
});

test('꼴이 맞아도 없는 날짜면 안내를 띄운다 (PR #29 리뷰)', () => {
  for (const bad of ['2026.99.99', '2026.02.31', '2025.02.29', '2026년 02월 30일', '2026.00.10']) assert.equal(isDateText(bad), false, bad);
  for (const ok of ['2024.02.29', '2024년 02월 29일', '2026.12.31']) assert.equal(isDateText(ok), true, ok);
  assert.match(dateWarning('2026.02.31'), /있는 날짜가 아닙니다/);
  assert.match(dateWarning('2013.8.30'), /2025\.10\.17처럼/);
  assert.equal(dateWarning('2013.08.30'), '');
});
