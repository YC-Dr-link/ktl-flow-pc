// 행 수와 행 매핑 설정이 서로 맞는지 analyze 첫머리에서 확인한다 (설정을 바꿨을 때 조용히 틀리지 않게)

const isPosInt = (n) => Number.isInteger(n) && n > 0;

// 어긋난 곳마다 한국어 문장 하나. 모두 맞으면 빈 배열
export function checkConfig(config) {
  const problems = [];
  const { rep, lin, sen } = config.rowCounts;
  for (const [k, v] of Object.entries({ rep, lin, sen })) {
    if (!isPosInt(v)) problems.push(`설정 rowCounts.${k}는 1 이상의 정수여야 합니다 (현재: ${v}).`);
  }
  if (problems.length) return problems;

  const groups = config.sensitivityGroups.length * config.sensitivityRowsPerGroup;
  if (sen !== groups) {
    problems.push(`설정이 맞지 않습니다: 민감도 행 수 ${sen}과 그룹 ${config.sensitivityGroups.length}개 × ${config.sensitivityRowsPerGroup}행 = ${groups}가 다릅니다.`);
  }

  const { zeroRows, spanRows } = config.repeatabilityOrder;
  const repRows = [...zeroRows, ...spanRows];
  if (!zeroRows.length || !spanRows.length || zeroRows.length < 2 || spanRows.length < 2) {
    problems.push('설정이 맞지 않습니다: 반복성 ZERO·SPAN 행은 각각 2개 이상이어야 합니다 (표본표준편차).');
  }
  if (repRows.some((r) => !Number.isInteger(r) || r < 1 || r > rep) || new Set(repRows).size !== repRows.length) {
    problems.push(`설정이 맞지 않습니다: 반복성 ZERO·SPAN 행은 겹치지 않고 1~${rep}행 안이어야 합니다.`);
  }

  const { p30, p70 } = config.linearitySplit;
  const okRange = ([from, to]) => Number.isInteger(from) && Number.isInteger(to) && from >= 1 && from <= to && to <= lin;
  if (!okRange(p30) || !okRange(p70) || !(p30[1] < p70[0] || p70[1] < p30[0])) {
    problems.push(`설정이 맞지 않습니다: 직선성 30 %·70 % 행 범위는 겹치지 않고 1~${lin}행 안이어야 합니다.`);
  }
  return problems;
}
