// 사사오입 표시 함수와 판정의 반올림 전/후 기준을 경계값으로 확인하는 테스트
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatRounded, roundHalfUp } from '../../src/core/round.js';
import { judge, overallJudgement } from '../../src/core/judge.js';
import config from '../../src/config.js';

describe('사사오입 (소수 첫째 자리)', () => {
  const cases = [
    [0.05, '0.1'],
    [0.15, '0.2'],
    [0.25, '0.3'],
    [1.95, '2.0'],
    [2.05, '2.1'],
    [4.049, '4.0'],
    [4.05, '4.1'],
    [0.04999, '0.0'],
    [-0.05, '-0.1'],
    [0, '0.0'],
  ];
  for (const [value, expected] of cases) {
    it(`${value} → ${expected}`, () => assert.equal(formatRounded(value, 1), expected));
  }

  it('toFixed가 틀리는 값을 바로잡는다 (1.005 → 소수 둘째 자리 1.01)', () => {
    assert.equal((1.005).toFixed(2), '1.00'); // 부동소수 때문에 toFixed는 틀림
    assert.equal(formatRounded(1.005, 2), '1.01');
  });

  it('자릿수 0과 4, 작은 값(지수 표기), 음의 영 처리', () => {
    assert.equal(formatRounded(2.5, 0), '3');
    assert.equal(formatRounded(0.31622776601683794, 4), '0.3162'); // 합성 set_a 반복성
    assert.equal(formatRounded(1e-7, 4), '0.0000');
    assert.equal(formatRounded(1.5e-7, 6), '0.000000');
    assert.equal(formatRounded(-0.04, 1), '0.0');
    assert.equal(formatRounded(9.95, 1), '10.0');
  });

  it('숫자 값 반환과 유한하지 않은 값 거부', () => {
    assert.equal(roundHalfUp(2.05, 1), 2.1);
    assert.throws(() => formatRounded(NaN, 1), RangeError);
    assert.throws(() => formatRounded(Infinity, 1), RangeError);
  });
});

describe('판정은 반올림 전 값 (Q2 가정)', () => {
  it('2.0 적합, 2.0000001 부적합, 2.04(표시 2.0)도 부적합', () => {
    assert.equal(judge(2.0, 2.0, config), '적합');
    assert.equal(judge(2.0000001, 2.0, config), '부적합');
    assert.equal(judge(2.04, 2.0, config), '부적합');
    assert.equal(formatRounded(2.04, 1), '2.0');
  });

  it('judgeOnRounded=true로 바꾸면 2.04가 적합이 된다', () => {
    assert.equal(judge(2.04, 2.0, { ...config, judgeOnRounded: true }), '적합');
    assert.equal(judge(2.05, 2.0, { ...config, judgeOnRounded: true }), '부적합'); // 2.05 → 2.1
  });

  it('기준값을 바꾸면 판정이 바뀐다', () => {
    assert.equal(judge(0.5, 0.4, config), '부적합');
    assert.equal(judge(0.5, 0.6, config), '적합');
  });

  it('종합은 세 항목이 모두 적합일 때만 적합', () => {
    assert.equal(overallJudgement(['적합', '적합', '적합']), '적합');
    assert.equal(overallJudgement(['적합', '부적합', '적합']), '부적합');
  });
});
