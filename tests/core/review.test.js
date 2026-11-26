// 단계 1 코드 리뷰(planning/REVIEW_stage1.md) 지적을 막는 테스트: 기준유속 검증, 판정 잡음, 표시값 경로, 빠진 검증 분기, 설정 일관성
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../src/core/analyze.js';
import { checkConfig } from '../../src/core/configCheck.js';
import { judge } from '../../src/core/judge.js';
import defaultConfig from '../../src/config.js';
import { editLines, loadSample, replaceInLine, toList, withFile } from '../helpers/fixture.js';

const sample = loadSample();
const run = (s, options) => analyze(toList(s), options);

// 데이터 n번째 행(1부터)의 c번째 칸(0부터)을 바꾼다 (데이터는 14행부터)
const setCell = (file, dataRow, col, value) =>
  editLines(file, (lines) => {
    const cells = lines[13 + dataRow - 1].split(',');
    cells[col] = value;
    lines[13 + dataRow - 1] = cells.join(',');
  });

describe('차단 1: 요약 기준유속(B열)은 0보다 커야 한다', () => {
  for (const [label, value] of [['0', '0'], ['음수', '-6.000000000']]) {
    for (const slot of ['rep_summary', 'lin_summary', 'sen_summary']) {
      it(`${slot} 기준유속이 ${label}이면 VALUE_INVALID, 예외 없이 result null`, () => {
        const bad = setCell(sample[slot], 1, 1, value);
        const r = run(withFile(sample, slot, bad));
        assert.equal(r.result, null);
        assert.equal(r.summaries, null);
        const e = r.errors.find((x) => x.code === 'VALUE_INVALID');
        assert.ok(e, r.errors.map((x) => x.code).join());
        assert.equal(e.file, bad.name);
        assert.equal(e.row, 14);
        assert.match(e.message, /0보다 커야 함/);
        assert.match(e.message, /14행/);
      });
    }
  }

  it('계산이 예외를 던져도 analyze는 던지지 않고 COMPUTE_FAILED와 result null을 돌려준다', () => {
    const r = run(sample, { config: { ...defaultConfig, criteria: null } });
    assert.equal(r.result, null);
    assert.equal(r.summaries, null);
    const e = r.errors.find((x) => x.code === 'COMPUTE_FAILED');
    assert.ok(e);
    assert.match(e.message, /[가-힣]/);
    assert.ok(e.cause);
  });
});

describe('중요 2: 판정 직전 15유효자리 정리', () => {
  it('정확히 5.000 %여야 하는 직선성(기준 1.000, 측정 1.050)이 부동소수 잡음 때문에 부적합이 되지 않는다', () => {
    assert.ok((Math.abs(1 - 1.05) / 1) * 100 > 5.0); // 날것의 계산은 5.000000000000004
    const bad = setCell(setCell(sample.lin_summary, 1, 1, '1.000'), 1, 2, '1.050');
    const r = run(withFile(sample, 'lin_summary', bad));
    assert.deepEqual(r.errors, []);
    assert.equal(r.result.linearity.display, '5.0');
    assert.equal(r.result.linearity.judgement, '적합');
  });

  it('5.0000001은 여전히 부적합 (잡음만 걷고 값을 반올림하지 않는다)', () => {
    assert.equal(judge(5.000000000000004, 5.0, defaultConfig), '적합');
    assert.equal(judge(5.0000001, 5.0, defaultConfig), '부적합');
    assert.equal(judge(5.00001, 5.0, defaultConfig), '부적합');
  });

  it('자릿수는 설정이다: 17자리로 두면 잡음이 그대로 비교된다', () => {
    assert.equal(judge(5.000000000000004, 5.0, { ...defaultConfig, judgeSignificantDigits: 17 }), '부적합');
  });
});

describe('중요 3: 결과 객체의 표시값(display·detail)은 사사오입', () => {
  const cases = [
    [2.05, '2.1', '2.0500', '적합'],
    [1.95, '2.0', '1.9500', '적합'],
    [4.049, '4.0', '4.0490', '부적합'], // 표시는 4.0이어도 반올림 전 값이 4.0 초과라 부적합 (Q2 가정)
    [4.05, '4.1', '4.0500', '부적합'],
  ];
  for (const [x, display, detail, judgement] of cases) {
    it(`민감도 값 ${x} → 표시 ${display}, 상세 ${detail}, ${judgement}`, () => {
      let bad = sample.sen_summary;
      for (let row = 1; row <= 30; row += 1) bad = setCell(bad, row, 8, row <= 3 ? String(x) : '0.1'); // 첫 묶음 오차 3개 → |평균| = x, 나머지 묶음은 0.1
      const r = run(withFile(sample, 'sen_summary', bad));
      assert.deepEqual(r.errors, []);
      assert.equal(r.result.sensitivity.display, display);
      assert.equal(r.result.sensitivity.detail, detail);
      assert.equal(r.result.sensitivity.judgement, judgement);
    });
  }
});

describe('재확인 B: detail(소수 넷째 자리)도 사사오입', () => {
  // toFixed(4)는 2.00005를 2.0000, 0.45675 계열을 내림으로 틀린다 (0.12345 같은 값은 toFixed도 맞아 구별되지 않는다)
  it('민감도 값 2.00005 → detail 2.0001, display 2.0', () => {
    assert.equal((2.00005).toFixed(4), '2.0000');
    let bad = sample.sen_summary;
    for (const row of [1, 2, 3]) bad = setCell(bad, row, 8, '2.00005');
    const r = run(withFile(sample, 'sen_summary', bad));
    assert.deepEqual(r.errors, []);
    assert.equal(r.result.sensitivity.detail, '2.0001');
    assert.equal(r.result.sensitivity.display, '2.0');
  });
});

describe('중요 4: 빠져 있던 검증 분기', () => {
  // 한 파일만 다르게 → 어느 행이 다른지, 어느 파일이 다른지 알려 준다
  const mismatches = [
    [1, '25-123456-01-1 ', '25-123456-01-2 ', /의뢰 기관/],
    [4, 'SYNTH-MODEL', 'SYNTH-MODEX', /모델명/],
    [6, ',20,', ',21,', /최대 유속/],
    [10, '2026', '2027', /교정일/],
  ];
  for (const [row, from, to, label] of mismatches) {
    it(`HEADER_MISMATCH: ${row}행이 한 파일만 다르다`, () => {
      const bad = replaceInLine(sample.sen_source, row, from, to);
      const r = run(withFile(sample, 'sen_source', bad));
      assert.equal(r.result, null);
      const e = r.errors.find((x) => x.code === 'HEADER_MISMATCH');
      assert.ok(e, r.errors.map((x) => x.code).join());
      assert.equal(e.row, row);
      assert.equal(e.file, bad.name);
      assert.match(e.message, label);
    });
  }

  for (const col of [4, 5, 9]) {
    it(`VALUE_INVALID: source ${'DEFGHIJ'[col - 3]}열(${col + 1}번째)에 abc`, () => {
      const bad = setCell(sample.rep_source, 1, col, 'abc');
      const r = run(withFile(sample, 'rep_source', bad));
      assert.equal(r.result, null);
      const e = r.errors.find((x) => x.code === 'VALUE_INVALID');
      assert.ok(e && e.file === bad.name && e.row === 14 && /abc/.test(e.message));
    });
  }

  it('VALUE_INVALID: source D열(기준유속)에 abc — 자동 배정은 판별 불가로 막고, 직접 배정하면 VALUE_INVALID', () => {
    const bad = setCell(sample.rep_source, 1, 3, 'abc');
    const swapped = withFile(sample, 'rep_source', bad);
    const auto = run(swapped);
    assert.equal(auto.result, null);
    assert.ok(auto.notices.some((n) => n.code === 'UNCLASSIFIED' && n.file === bad.name));
    const manual = run(swapped, { assignment: { rep_source: toList(swapped).indexOf(bad) } });
    const e = manual.errors.find((x) => x.code === 'VALUE_INVALID');
    assert.ok(e && e.file === bad.name && e.row === 14 && /abc/.test(e.message));
  });

  it('SLOT_FORMAT: 요약 12행 열이 10개뿐이면 막힌다 (11열 미만)', () => {
    const bad = editLines(sample.rep_summary, (lines) => {
      lines[11] = lines[11].split(',').slice(0, 10).join(',');
    });
    const r = run(withFile(sample, 'rep_summary', bad));
    assert.equal(r.result, null);
    const e = r.errors.find((x) => x.code === 'SLOT_FORMAT');
    assert.ok(e && e.file === bad.name && /10열/.test(e.message));
  });

  it('SLOT_FORMAT: source 12행 열이 9개뿐이면 막힌다 (10열 미만)', () => {
    const bad = editLines(sample.lin_source, (lines) => {
      lines[11] = lines[11].split(',').slice(0, 9).join(',');
    });
    const r = run(withFile(sample, 'lin_source', bad));
    assert.equal(r.result, null);
    assert.ok(r.errors.some((x) => x.code === 'SLOT_FORMAT' && x.file === bad.name));
  });

  it('민감도 최댓값이 동률이면 앞 그룹을 고른다', () => {
    let bad = sample.sen_summary;
    for (const row of [1, 2, 3, 28, 29, 30]) bad = setCell(bad, row, 8, '5'); // 첫 그룹(0°, 30 %)과 마지막 그룹(+10°, 70 %)
    const r = run(withFile(sample, 'sen_summary', bad));
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.result.sensitivity.max_group, { angle: 0, point: '30%' });
    assert.equal(r.result.sensitivity.value_pct, 5);
    assert.equal(r.result.sensitivity.judgement, '부적합');
    assert.equal(r.result.overall, '부적합');
  });
});

describe('중요 5: 행 수·매핑 설정은 한 곳이고 서로 맞아야 한다', () => {
  it('기본 설정은 일관된다', () => assert.deepEqual(checkConfig(defaultConfig), []));

  const broken = {
    '민감도 행 수와 그룹 수 불일치': { rowCounts: { rep: 10, lin: 10, sen: 33 } },
    '반복성 행이 행 수를 넘음': { rowCounts: { rep: 9, lin: 10, sen: 30 } },
    '반복성 ZERO·SPAN 행 겹침': { repeatabilityOrder: { zeroRows: [1, 3, 5, 7, 9], spanRows: [2, 4, 6, 8, 9] } },
    '직선성 범위 겹침': { linearitySplit: { p30: [1, 6], p70: [6, 10] } },
    '직선성 범위가 행 수 밖': { linearitySplit: { p30: [1, 5], p70: [6, 11] } },
    '행 수가 정수 아님': { rowCounts: { rep: 10.5, lin: 10, sen: 30 } },
  };
  for (const [label, patch] of Object.entries(broken)) {
    it(`${label} → CONFIG_INVALID`, () => {
      const cfg = { ...defaultConfig, ...patch };
      assert.ok(checkConfig(cfg).length > 0);
      const r = run(sample, { config: cfg });
      assert.equal(r.result, null);
      assert.ok(r.errors.some((e) => e.code === 'CONFIG_INVALID' && /[가-힣]/.test(e.message)));
    });
  }

  it('판별도 같은 설정을 따른다: 직선성 행 범위를 바꿔도 합성 CSV가 그대로 판별된다', () => {
    const cfg = { ...defaultConfig, linearitySplit: { p30: [1, 4], p70: [6, 10] } };
    const r = run(sample, { config: cfg });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.result.linearity.rows.p30, [1, 2, 3, 4]);
    assert.match(r.slots.lin_summary.evidence.pattern, /1~4행 < 6~10행/);
  });

  it('하드코딩이면 결과가 달라지는 설정: 직선성 30 % 행을 1~6으로 늘리면 합성 CSV 직선성은 판별되지 않는다', () => {
    const cfg = { ...defaultConfig, linearitySplit: { p30: [1, 6], p70: [7, 10] } };
    assert.deepEqual(checkConfig(cfg), []);
    const r = run(sample, { config: cfg });
    assert.equal(r.result, null);
    assert.ok(r.notices.some((n) => n.code === 'UNCLASSIFIED' && n.file === sample.lin_summary.name));
  });

  // 반복성 요약·source를 12행으로 늘린다 (교대 패턴 유지, source 측정유속 = 요약 측정유속이라 경고 없음)
  const extend12 = (summary, source) => {
    // 합성 set_a와 같은 꼴의 가짜 행 (대기압 100 kPa, 온도 20 ℃, 습도 50 %, 교정일 11-02-2026)
    const extraSummary = ['11,1.800000,1.780000,100.000000,10.000000,0.000000,20.000000,50.000000,-1.111111,1.200000,5', '12,16.000000,15.960000,100.000000,10.000000,0.000000,20.000000,50.000000,-0.250000,1.200000,5'];
    const extraSource = [];
    for (const [id, ref, meas] of [[11, '1.800000', '1.780000'], [12, '16.000000', '15.960000']]) {
      for (let k = 0; k < 5; k += 1) extraSource.push(`${id},11-02-2026,09:00:0${k},${ref},${meas},100.000000,10.000000,0.000000,20.000000,50.000000`);
    }
    const append = (extra) => (lines) => {
      while (lines[lines.length - 1] === '') lines.pop();
      lines.push(...extra);
    };
    return [editLines(summary, append(extraSummary)), editLines(source, append(extraSource))];
  };
  const twelveConfig = {
    ...defaultConfig,
    rowCounts: { rep: 12, lin: 10, sen: 30 },
    repeatabilityOrder: { zeroRows: [1, 3, 5, 7, 9, 11], spanRows: [2, 4, 6, 8, 10, 12] },
  };

  it('하드코딩이면 결과가 달라지는 설정: rowCounts.rep 12면 12행 반복성이 판별·계산되고, 기본 설정에서는 판별되지 않는다', () => {
    const [summary, source] = extend12(sample.rep_summary, sample.rep_source);
    const files = withFile(withFile(sample, 'rep_summary', summary), 'rep_source', source);
    assert.deepEqual(checkConfig(twelveConfig), []);
    const ok = run(files, { config: twelveConfig });
    assert.deepEqual(ok.errors, []);
    assert.deepEqual(ok.warnings, []);
    assert.equal(ok.slots.rep_summary.evidence.points, 12);
    assert.equal(ok.result.repeatability.rows.zero.length, 6);
    const dflt = run(files);
    assert.equal(dflt.result, null);
    assert.ok(dflt.notices.some((n) => n.code === 'UNCLASSIFIED' && n.file === summary.name));
  });

  it('행 범위 설정을 바꾸면 직선성 값도 따라 바뀐다', () => {
    const setB = loadSample('set_b'); // set_a는 행마다 오차가 같아 범위를 바꿔도 값이 같다
    const base = run(setB).result.linearity;
    const cfg = { ...defaultConfig, linearitySplit: { p30: [1, 3], p70: [6, 10] } };
    const changed = run(setB, { config: cfg }).result.linearity;
    assert.notEqual(changed.p30_pct, base.p30_pct); // 4 · 5행이 빠짐
  });
});

describe('사소: 판별 숫자 해석, 빈 줄 뒤 데이터', () => {
  it('판별도 엄격한 숫자 해석을 쓴다: 기준유속이 0x10이면 판별 불가', () => {
    const bad = setCell(sample.rep_summary, 1, 1, '0x10');
    const r = run(withFile(sample, 'rep_summary', bad));
    assert.equal(r.result, null);
    assert.ok(r.notices.some((n) => n.code === 'UNCLASSIFIED' && /숫자가 아닌/.test(n.message)));
  });

  it('빈 줄 뒤에 데이터가 더 있으면 DATA_AFTER_BLANK 경고 (계산은 함)', () => {
    const bad = editLines(sample.rep_summary, (lines) => {
      while (lines[lines.length - 1] === '') lines.pop();
      lines.push(',,,,,,,,,,', '99,1,2,3,4,5,6,7,8,9,10', '98,1,2,3,4,5,6,7,8,9,10');
    });
    const r = run(withFile(sample, 'rep_summary', bad));
    assert.deepEqual(r.errors, []);
    assert.ok(r.result);
    const w = r.warnings.find((x) => x.code === 'DATA_AFTER_BLANK');
    assert.ok(w && w.file === bad.name && w.row === 24 && /2행/.test(w.message));
  });

  it('합성 CSV에는 DATA_AFTER_BLANK 경고가 없다', () => {
    assert.deepEqual(run(sample).warnings, []);
  });
});
