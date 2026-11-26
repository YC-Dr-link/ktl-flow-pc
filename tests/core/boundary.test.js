// 판정 기준 경계(반복성 2.0 · 직선성 5.0 · 민감도 4.0 %) 근처 값을 합성 CSV에 만들어 넣고, 표시값(반올림 후)과 판정(기본은 반올림 전 값)을 본다 (#25)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../src/core/analyze.js';
import defaultConfig from '../../src/config.js';
import { editLines, loadSample, toList, withFile } from '../helpers/fixture.js';

const sample = loadSample('set_a');
const MAX = 20; // set_a 최대 유속 (m/s)
const COL = { ref: 1, measured: 2, error: 8 }; // 요약 CSV 열: B 기준유속, C 측정 유속, I 오차

// 데이터 행(1부터)의 칸 하나를 바꾼다. 데이터는 14행부터
const setCell = (file, dataRow, col, value) =>
  editLines(file, (lines) => {
    const cells = lines[13 + dataRow - 1].split(',');
    cells[col] = value;
    lines[13 + dataRow - 1] = cells.join(',');
  });
const cellOf = (file, dataRow, col) => Number(Buffer.from(file.bytes).toString('latin1').split('\r\n')[13 + dataRow - 1].split(',')[col]);
const run = (s, config = defaultConfig) => analyze(toList(s), { config });

// 반복성 x %: d가 무리수라 십진으로 정확히 쓸 수 없으므로 전체 정밀도(String)로 쓴다. ZERO 행(1 · 3 · 5 · 7 · 9)을 a, a, a, a+d, a−d로 두면 표본표준편차 = d/√2. x = (d/√2) / 최대 유속 × 100. SPAN 행은 모두 같게 둬서 0 %
function repeatabilityAt(x) {
  const d = (x / 100) * MAX * Math.SQRT2;
  const zero = [0, 0, 0, d, -d];
  let f = sample.rep_summary;
  [1, 3, 5, 7, 9].forEach((row, i) => (f = setCell(f, row, COL.measured, String(2 + zero[i]))));
  for (const row of [2, 4, 6, 8, 10]) f = setCell(f, row, COL.measured, '16.000000');
  return withFile(sample, 'rep_summary', f);
}

// 직선성 x %: 1행의 측정값을 기준값 × (1 − x/100)로, 나머지 행은 측정값 = 기준값(오차 0)으로 둔다
function linearityAt(x) {
  let f = sample.lin_summary;
  for (let row = 1; row <= 10; row += 1) {
    const ref = cellOf(f, row, COL.ref);
    f = setCell(f, row, COL.measured, (row === 1 ? ref * (1 - x / 100) : ref).toFixed(9)); // 실제 CSV처럼 십진 9자리로 쓴다. 기준 6 m/s에서 경우마다 정확한 십진값이라 오차가 정확히 x가 된다
  }
  return withFile(sample, 'lin_summary', f);
}

// 민감도 x %: 첫 묶음(0° 30 %) 오차 3개를 x로, 나머지 묶음은 0.1로 둔다
function sensitivityAt(x) {
  let f = sample.sen_summary;
  for (let row = 1; row <= 30; row += 1) f = setCell(f, row, COL.error, row <= 3 ? String(x) : '0.1');
  return withFile(sample, 'sen_summary', f);
}

// [값, 표시, 판정(반올림 전 기준), 판정(judgeOnRounded)]
const cases = (c) => [
  [c - 0.05, c.toFixed(1), '적합', '적합'], // 사사오입으로 표시는 기준값과 같다
  [c, c.toFixed(1), '적합', '적합'],
  [c + 0.001, c.toFixed(1), '부적합', '적합'],
  [c + 0.049, c.toFixed(1), '부적합', '적합'],
  [c + 0.05, (c + 0.1).toFixed(1), '부적합', '부적합'],
];

for (const [name, key, criterion, make] of [
  ['반복성', 'repeatability', 2.0, repeatabilityAt],
  ['직선성', 'linearity', 5.0, linearityAt],
  ['민감도', 'sensitivity', 4.0, sensitivityAt],
]) {
  describe(`${name} 기준 ${criterion.toFixed(1)} % 경계`, () => {
    for (const [x, display, judged, judgedRounded] of cases(criterion)) {
      it(`${x.toFixed(3)} % → 표시 ${display}, 반올림 전 판정 ${judged}, 반올림 후 판정 ${judgedRounded}`, () => {
        const s = make(x);
        const r = run(s);
        assert.deepEqual(r.errors, []); // 요약만 바꾸고 source는 그대로라 SOURCE_MISMATCH 경고는 날 수 있다 (판정과 무관)
        const v = r.result[key];
        assert.ok(Math.abs(v.value_pct - x) < 1e-12, `값 ${v.value_pct}`);
        assert.equal(v.display, display);
        assert.equal(v.judgement, judged);
        assert.equal(run(s, { ...defaultConfig, judgeOnRounded: true }).result[key].judgement, judgedRounded);
      });
    }
  });
}
