// 기준값 이하이면 적합으로 판정하고 세 항목을 종합한다 (CALCULATION 5절)
import { roundHalfUp } from './round.js';

export const PASS = '적합';
export const FAIL = '부적합';

// 기본은 반올림 전 값으로 판정 (Q2). config.judgeOnRounded가 true면 표시 자릿수로 사사오입한 값으로 판정
// 비교 직전에 유효숫자 judgeSignificantDigits자리로 부동소수 잡음(5.000000000000004 등)만 걷는다. 값을 반올림하는 것이 아니다
export function judge(value, criterion, config) {
  const clean = Number(value.toPrecision(config.judgeSignificantDigits));
  const v = config.judgeOnRounded ? roundHalfUp(clean, config.displayDecimals) : clean;
  return v <= criterion ? PASS : FAIL;
}

// 세 항목 모두 적합이면 적합
export function overallJudgement(judgements) {
  return judgements.every((j) => j === PASS) ? PASS : FAIL;
}
