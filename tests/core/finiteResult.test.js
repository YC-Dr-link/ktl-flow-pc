import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../src/core/analyze.js';
import { loadSample, toList, editLines } from '../helpers/fixture.js';

function environmentColumn(column, value) {
  const sample = loadSample();
  for (const key of ['rep_summary', 'lin_summary', 'sen_summary']) {
    sample[key] = editLines(sample[key], lines => {
      for (let i = 13; i < lines.length && lines[i].split(',')[0]; i++) {
        const cells = lines[i].split(','); cells[column] = value; lines[i] = cells.join(',');
      }
    });
  }
  return analyze(toList(sample));
}
for (const [column, label] of [[3, '대기압 단위 변환'], [7, '환경 중간값 합산']]) {
  test(`${label} 중 넘친 숫자는 정상 판정 결과로 확정하지 않는다`, () => {
    const a = environmentColumn(column, '1e308');
    assert.equal(a.result, null); assert.equal(a.summaries, null);
    const error = a.errors.find(e => e.code === 'COMPUTE_FAILED');
    assert.ok(error); assert.match(error.message, /파일/); assert.match(error.cause, /숫자 범위/);
  });
}
test('장비의 허용 범위를 추측하지 않고 유한한 계산은 유지한다', () => {
  const a = environmentColumn(7, '1e307');
  assert.deepEqual(a.errors, []); assert.ok(a.result);
  assert.ok(Number.isFinite(a.result.environment.humidity_pct.mid));
});
