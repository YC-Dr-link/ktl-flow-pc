import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excelDateText } from '../../src/excel/readPrevious.js';

test('1900·1904 날짜 체계의 마지막 날짜와 시각·범위 밖 숫자를 구분한다', () => {
  for (const [date1904, last] of [[false, 2958465], [true, 2957003]]) {
    assert.equal(excelDateText(last, { date1904 }), '9999년 12월 31일');
    assert.equal(excelDateText(last + 0.75, { date1904 }), '9999년 12월 31일');
    for (const bad of [last + 1, -1, Infinity, NaN]) assert.equal(excelDateText(bad, { date1904 }), '');
  }
});
