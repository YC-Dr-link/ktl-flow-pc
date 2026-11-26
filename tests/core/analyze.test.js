// analyze 진입점: 합성 CSV 정답 일치(소수 셋째 자리), 오류 5종과 추가 케이스, 경고, 설정을 바꿨을 때의 결과 변화를 확인하는 테스트
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyze } from '../../src/core/analyze.js';
import defaultConfig from '../../src/config.js';
import { SERIAL, SLOT_IDS, TOL, diffSynthetic, loadExpected, loadSample, replaceInLine, editLines, toList, withFile, without } from '../helpers/fixture.js';

const expected = loadExpected('set_a');
const sample = loadSample('set_a');
const BAD_SERIAL = 'SYNTH-0002';
const codes = (list) => list.map((e) => e.code);
const run = (s, options) => analyze(toList(s), options);

for (const set of ['set_a', 'set_b']) {
  describe(`합성 CSV ${set} 정답 (NFR-02, 소수 셋째 자리)`, () => {
    const s = loadSample(set);
    const r = run(s);

    it('오류 · 경고 없이 계산하고 반복성 · 직선성 · 민감도가 정답과 0.0005 안에서 같다', () => {
      assert.deepEqual(r.errors, []);
      assert.deepEqual(r.warnings, []);
      assert.deepEqual(diffSynthetic(loadExpected(set), r.result), []);
    });
  });
}

// 환경 대푯값: 합성 CSV는 대기압 · 온도 · 습도가 한 값뿐이라, 요약 행 몇 개를 서로 다른 값으로 바꾸고 손으로 계산한 값과 비교한다
// 지금 정의는 「요약 CSV 세 개의 모든 행, 대기압 kPa × 10 = hPa」이다. TODO(확인 필요): source CSV도 넣는지, 반올림 자릿수
describe('환경 대푯값 (최소 · 최대 · 중간)', () => {
  const setCell = (file, dataRow, col, value) =>
    editLines(file, (lines) => {
      const cells = lines[13 + dataRow - 1].split(',');
      cells[col] = value;
      lines[13 + dataRow - 1] = cells.join(',');
    });
  const P = 3; const T = 6; const H = 7; // 요약 CSV 열: D 대기압(kPa), G 온도, H 상대습도
  const s = {
    ...sample,
    rep_summary: setCell(setCell(sample.rep_summary, 1, P, '99.500000'), 4, T, '23.000000'),
    lin_summary: setCell(setCell(sample.lin_summary, 2, P, '100.700000'), 5, H, '40.000000'),
    sen_summary: setCell(setCell(sample.sen_summary, 3, T, '18.000000'), 30, H, '60.000000'),
    rep_source: setCell(sample.rep_source, 1, 5, '90.000000'), // source의 대기압(F열)은 쓰지 않는다
  };
  const env = run(s).result.environment;
  const near = (got, want, label) => assert.ok(Math.abs(got - want) < 1e-9, `${label}: ${got}, 기대 ${want}`);

  it('대기압은 kPa × 10 = hPa, 요약 CSV 세 개의 최소 · 최대 · 중간', () => {
    near(env.pressure_hpa.min, 995, '최소');
    near(env.pressure_hpa.max, 1007, '최대');
    near(env.pressure_hpa.mid, 1001, '중간');
  });

  it('온도 · 습도도 요약 CSV 세 개에서 최소 · 최대 · 중간', () => {
    near(env.temperature_c.min, 18, '온도 최소');
    near(env.temperature_c.max, 23, '온도 최대');
    near(env.temperature_c.mid, 20.5, '온도 중간');
    near(env.humidity_pct.min, 40, '습도 최소');
    near(env.humidity_pct.max, 60, '습도 최대');
    near(env.humidity_pct.mid, 50, '습도 중간');
  });
});

describe('합성 CSV 판정 · 표시', () => {
  it('set_a는 모두 적합, set_b는 반복성 · 직선성 · 민감도 모두 부적합', () => {
    const a = run(sample).result;
    const b = run(loadSample('set_b')).result;
    assert.deepEqual([a.repeatability.judgement, a.linearity.judgement, a.sensitivity.judgement, a.overall], ['적합', '적합', '적합', '적합']);
    assert.deepEqual([b.repeatability.judgement, b.linearity.judgement, b.sensitivity.judgement, b.overall], ['부적합', '부적합', '부적합', '부적합']);
  });

  it('표시값은 소수 첫째 자리, 상세값은 소수 넷째 자리', () => {
    const { result } = run(sample);
    assert.deepEqual([result.repeatability.display, result.linearity.display, result.sensitivity.display], ['0.3', '2.0', '2.0']);
    assert.equal(result.repeatability.detail, '0.3162');
    assert.equal(result.sensitivity.detail, '2.0000');
    assert.deepEqual(result.sensitivity.max_group, { angle: 10, point: '70%' });
  });

  it('기기 정보는 CSV 1~10행에서 읽는다', () => {
    const { equipment } = run(sample).result;
    assert.deepEqual([equipment.receipt_no, equipment.company, equipment.serial, equipment.max_velocity], ['25-123456-01-1', 'SYNTH-CO', SERIAL, 20]);
  });

  it('UTF-8로 다시 저장한 파일도 같은 결과', () => {
    const utf8 = toList(sample).map((f) => ({
      name: f.name,
      bytes: new TextEncoder().encode(new TextDecoder('euc-kr').decode(f.bytes)),
    }));
    const r = analyze(utf8);
    assert.deepEqual(r.errors, []);
    assert.equal(r.files[0].encoding, 'utf-8');
    assert.deepEqual(diffSynthetic(expected, r.result), []);
  });

  it('교정 시간은 시험 종류마다 달라도 오류가 아니다 (요약과 source 짝만 같으면 된다)', () => {
    const later = (f) => replaceInLine(f, 11, '09:', '10:');
    const r = run({ ...sample, lin_summary: later(sample.lin_summary), lin_source: later(sample.lin_source) });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
    assert.equal(new Set(Object.values(r.slots).map((x) => x.evidence.calibrationTime)).size, 2);
  });
});

describe('오류 5종 — 결과와 Excel 입력(result)이 만들어지지 않는다 (NFR-05)', () => {
  it('HEADER_MISMATCH: 한 파일의 기기번호가 다르다', () => {
    const bad = replaceInLine(sample.sen_summary, 5, SERIAL, BAD_SERIAL);
    const r = run(withFile(sample, 'sen_summary', bad));
    assert.equal(r.result, null);
    const e = r.errors.find((x) => x.code === 'HEADER_MISMATCH');
    assert.ok(e, codes(r.errors).join());
    assert.equal(e.row, 5);
    assert.equal(e.file, bad.name);
    assert.match(e.message, /기기 번호/);
    assert.match(e.message, new RegExp(BAD_SERIAL));
  });

  it('ROW_COUNT: 반복성 요약 한 행 삭제 (칸에 직접 넣으면 ROW_COUNT)', () => {
    const bad = editLines(sample.rep_summary, (lines) => {
      lines.splice(14, 1);
    });
    const bad9 = withFile(sample, 'rep_summary', bad);
    const idx = toList(bad9).indexOf(bad);
    const r = run(bad9, { assignment: { rep_summary: idx } });
    assert.equal(r.result, null);
    const e = r.errors.find((x) => x.code === 'ROW_COUNT');
    assert.ok(e);
    assert.match(e.message, /9행/);
    assert.match(e.message, /10행/);
    assert.match(e.message, new RegExp(bad.name));
  });

  it('행이 모자란 요약 파일을 자동 배정하면 판별 불가 알림과 빈 칸 오류로 막힌다 (ROW_COUNT는 직접 배정 때)', () => {
    const bad = editLines(sample.rep_summary, (lines) => {
      lines.splice(14, 1);
    });
    const r = run(withFile(sample, 'rep_summary', bad));
    assert.equal(r.result, null);
    assert.ok(r.notices.some((n) => n.code === 'UNCLASSIFIED' && n.file === bad.name));
    assert.ok(r.errors.some((e) => e.code === 'FILE_MISSING' && e.slot === 'rep_summary'));
  });

  it('SLOT_MISMATCH: 반복성 요약을 직선성 칸에 수동 배정', () => {
    const list = toList(sample);
    const r = analyze(list, { assignment: { lin_summary: list.indexOf(sample.rep_summary) } });
    assert.equal(r.result, null);
    const e = r.errors.find((x) => x.code === 'SLOT_MISMATCH');
    assert.ok(e);
    assert.equal(e.slot, 'lin_summary');
    assert.equal(e.file, sample.rep_summary.name);
    assert.match(e.message, /반복성/);
    assert.match(e.message, /직선성/);
  });

  it('SLOT_FORMAT: 요약 칸에 source 파일', () => {
    const list = toList(sample);
    const r = analyze(list, { assignment: { rep_summary: list.indexOf(sample.rep_source) } });
    assert.equal(r.result, null);
    const e = r.errors.find((x) => x.code === 'SLOT_FORMAT');
    assert.ok(e && e.slot === 'rep_summary');
  });

  it('VALUE_INVALID: 요약 C열 한 칸이 abc — 파일과 행을 알려 준다', () => {
    // 15행 = 데이터 2번째 행. 측정 유속(C열)은 셋째 칸
    const line15 = Buffer.from(sample.rep_summary.bytes).toString('latin1').split('\r\n')[14];
    const c = line15.split(',')[2];
    const bad = replaceInLine(sample.rep_summary, 15, c, 'abc');
    const r = run(withFile(sample, 'rep_summary', bad));
    assert.equal(r.result, null);
    const e = r.errors.find((x) => x.code === 'VALUE_INVALID');
    assert.ok(e);
    assert.equal(e.file, bad.name);
    assert.equal(e.row, 15);
    assert.match(e.message, /15행/);
    assert.match(e.message, /abc/);
  });

  it('FILE_MISSING + 중복 알림: 반복성 요약을 두 번 넣고 직선성 요약이 없다', () => {
    const copy = { name: 'rep-copy.csv', bytes: sample.rep_summary.bytes };
    const r = analyze([sample.rep_summary, copy, sample.rep_source, sample.lin_source, sample.sen_summary, sample.sen_source]);
    assert.equal(r.result, null);
    assert.ok(r.notices.some((n) => n.code === 'DUPLICATE_KIND' && n.slot === 'rep_summary' && n.files.length === 2));
    assert.ok(r.notices.some((n) => n.code === 'MISSING_KIND' && n.slot === 'lin_summary'));
    assert.deepEqual(r.errors.filter((e) => e.code === 'FILE_MISSING').map((e) => e.slot).sort(), ['lin_summary', 'rep_summary']);
  });
});

describe('추가 케이스', () => {
  it('FILE_MISSING: 칸 하나가 비어 있다', () => {
    const r = run(without(sample, 'lin_source'));
    assert.equal(r.result, null);
    assert.deepEqual(codes(r.errors), ['FILE_MISSING']);
    assert.equal(r.errors[0].slot, 'lin_source');
    assert.match(r.errors[0].message, /직선성 source/);
  });

  it('SLOT_FORMAT: 12행이 다른 파일을 칸에 직접 넣었다', () => {
    const bad = editLines(sample.rep_summary, (lines) => {
      lines[11] = 'x,y,z';
    });
    const swapped = withFile(sample, 'rep_summary', bad);
    const r = run(swapped, { assignment: { rep_summary: toList(swapped).indexOf(bad) } });
    assert.equal(r.result, null);
    const e = r.errors.find((x) => x.code === 'SLOT_FORMAT');
    assert.ok(e && e.slot === 'rep_summary' && e.row === 12 && e.file === bad.name);
    // 자동 배정이면 판별 불가 알림 + 빈 칸 오류
    const auto = run(swapped);
    assert.ok(auto.notices.some((n) => n.code === 'UNCLASSIFIED'));
    assert.ok(auto.errors.some((x) => x.code === 'FILE_MISSING' && x.slot === 'rep_summary'));
  });

  it('PAIR_TIME 경고: 요약과 source 교정 시간이 다르면 계산은 하고 경고', () => {
    const bad = replaceInLine(sample.rep_source, 11, '09:', '10:');
    const r = run(withFile(sample, 'rep_source', bad));
    assert.deepEqual(r.errors, []);
    assert.ok(r.result);
    assert.deepEqual(codes(r.warnings), ['PAIR_TIME']);
    assert.equal(r.warnings[0].file, bad.name);
    assert.deepEqual(diffSynthetic(expected, r.result), []);
  });

  it('SOURCE_MISMATCH 경고: source 측정유속이 요약 평균과 다르면 계산은 하고 경고', () => {
    const line14 = Buffer.from(sample.rep_source.bytes).toString('latin1').split('\r\n')[13];
    const measured = line14.split(',')[4];
    const bad = replaceInLine(sample.rep_source, 14, `,${measured},`, `,${(Number(measured) + 0.01).toFixed(9)},`);
    const r = run(withFile(sample, 'rep_source', bad));
    assert.deepEqual(r.errors, []);
    assert.ok(r.result);
    assert.ok(r.warnings.length >= 1);
    assert.ok(r.warnings.every((w) => w.code === 'SOURCE_MISMATCH'));
    assert.match(r.warnings[0].message, /반복성/);
  });

  it('공백 차이는 오류가 아니다: 의뢰기관에 연속 공백', () => {
    const bad = replaceInLine(sample.sen_source, 1, '25-123456-01-1 ', '25-123456-01-1   ');
    const r = run(withFile(sample, 'sen_source', bad));
    assert.deepEqual(r.errors, []);
    assert.deepEqual(diffSynthetic(expected, r.result), []);
  });

  it('VALUE_INVALID: 최대 유속(6행)이 숫자가 아니면 모든 파일에서 막힌다', () => {
    const bad = replaceInLine(sample.rep_summary, 6, ',20,', ',abc,');
    const r = run(withFile(sample, 'rep_summary', bad));
    assert.equal(r.result, null);
    assert.ok(r.errors.some((e) => e.code === 'VALUE_INVALID' && e.row === 6 && e.file === bad.name));
  });

  it('오류가 있으면 일부만 계산한 값도 내놓지 않는다', () => {
    const bad = replaceInLine(sample.sen_summary, 5, SERIAL, BAD_SERIAL);
    const r = run(withFile(sample, 'sen_summary', bad));
    assert.equal(r.result, null);
  });

  it('모든 오류 메시지는 한국어이고 코드가 있다', () => {
    const bad = replaceInLine(sample.sen_summary, 5, SERIAL, BAD_SERIAL);
    const r = run(without(withFile(sample, 'sen_summary', bad), 'rep_source'));
    for (const e of r.errors) {
      assert.ok(e.code);
      assert.match(e.message, /[가-힣]/);
    }
  });
});

describe('설정을 바꾸면 결과가 바뀐다 (NFR-09)', () => {
  const base = run(sample).result;

  it('기준값을 바꾸면 판정과 종합판정이 바뀐다', () => {
    const cfg = { ...defaultConfig, criteria: { ...defaultConfig.criteria, repeatability: 0.1 } };
    const r = run(sample, { config: cfg }).result;
    assert.equal(r.repeatability.judgement, '부적합');
    assert.equal(r.overall, '부적합');
    assert.equal(r.repeatability.value_pct, base.repeatability.value_pct);
    assert.equal(base.repeatability.judgement, '적합');
  });

  it('직선성 방식을 mean으로 바꾸면 평균 오차 절댓값을 쓴다 (Q1)', () => {
    const r = run(sample, { config: { ...defaultConfig, linearityMethod: 'mean' } }).result;
    assert.ok(Math.abs(r.linearity.value_pct - Math.abs(expected.expected.linearity_pct['30'].signed_mean_relative_pct)) <= TOL);
    assert.ok(r.linearity.value_pct < base.linearity.value_pct);
    assert.equal(r.linearity.display, '0.0'); // set_a는 양 · 음 오차가 상쇄돼 평균 오차가 0
    // set_b는 30 % 평균 오차 +7, 70 % 평균 오차 −6 → 절댓값 중 큰 쪽 7
    const b = run(loadSample('set_b'), { config: { ...defaultConfig, linearityMethod: 'mean' } }).result.linearity;
    const e = loadExpected('set_b').expected.linearity_pct;
    assert.ok(Math.abs(b.value_pct - Math.max(Math.abs(e['30'].signed_mean_relative_pct), Math.abs(e['70'].signed_mean_relative_pct))) <= TOL);
  });

  it('judgeOnRounded를 켜면 경계값 판정이 바뀐다 (Q2)', () => {
    // 반복성 기준을 0.31로 두면 값 0.3162는 반올림 전 부적합, 반올림(0.3) 후 적합
    const crit = { ...defaultConfig.criteria, repeatability: 0.31 };
    assert.equal(run(sample, { config: { ...defaultConfig, criteria: crit } }).result.repeatability.judgement, '부적합');
    assert.equal(
      run(sample, { config: { ...defaultConfig, criteria: crit, judgeOnRounded: true } }).result.repeatability.judgement,
      '적합',
    );
  });

  it('민감도 그룹 순서를 바꾸면 각도 표시가 바뀐다 (Q3)', () => {
    const groups = [...defaultConfig.sensitivityGroups].reverse();
    const r = run(sample, { config: { ...defaultConfig, sensitivityGroups: groups } }).result;
    assert.notDeepEqual(r.sensitivity.max_group, base.sensitivity.max_group);
  });

  it('행 수 설정만 바꾸면 매핑과 어긋나 CONFIG_INVALID로 막힌다 (Q3)', () => {
    const r = run(sample, { config: { ...defaultConfig, rowCounts: { rep: 9, lin: 10, sen: 30 } } });
    assert.equal(r.result, null);
    assert.ok(r.errors.some((e) => e.code === 'CONFIG_INVALID' && /반복성/.test(e.message)));
  });

  it('대기압 배수와 접수번호 방식 설정 (S3, S1)', () => {
    const r = run(sample, { config: { ...defaultConfig, pressureKpaToHpa: 20, receiptNoMode: 'left15' } }).result;
    assert.ok(Math.abs(r.environment.pressure_hpa.max - 2 * base.environment.pressure_hpa.max) < 1e-9);
    assert.equal(r.equipment.receipt_no, '25-123456-01-1 '); // 15글자라 뒤 공백이 붙는다 (원본 수식과 같음)
  });

  it('S9: 민감도 오차를 다시 계산해도 정답과 0.0005 안에서 같다', () => {
    const r = run(sample, { config: { ...defaultConfig, sensitivityErrorSource: 'recompute' } }).result;
    assert.ok(Math.abs(r.sensitivity.value_pct - expected.expected.sensitivity_pct) <= TOL);
  });

  it('설정 객체를 바꾸지 않는다', () => {
    const before = JSON.stringify(defaultConfig);
    run(sample);
    assert.equal(JSON.stringify(defaultConfig), before);
  });

  it('칸 목록은 6개', () => assert.equal(SLOT_IDS.length, 6));
});
