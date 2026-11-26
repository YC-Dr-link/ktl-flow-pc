// 검증을 통과한 요약 파일 3개에서 반복성·직선성·민감도·환경 조건·장비 정보를 계산한다 (CALCULATION 4절)
import { headerValue, parseNumber } from './csv.js';
import { formatRounded } from './round.js';
import { judge, overallJudgement } from './judge.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => sum(a) / a.length;
// 표본표준편차 (n-1로 나눔, Excel STDEV)
const sampleStd = (a) => {
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
};

// 요약 파일의 열 번호(0부터)
const COL = { ref: 1, measured: 2, pressure: 3, temperature: 6, humidity: 7, error: 8 };

const column = (file, idx) => file.data.map((d) => parseNumber(d.cells[idx]));
// 1부터 센 데이터 행 번호 목록으로 값을 고른다
const pick = (values, rows) => rows.map((r) => values[r - 1]);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// 표시값(소수 첫째 자리)과 상세값(소수 넷째 자리)을 붙인다
function withDisplay(obj, config) {
  return {
    ...obj,
    display: formatRounded(obj.value_pct, config.displayDecimals),
    detail: formatRounded(obj.value_pct, config.detailDecimals),
  };
}

function equipment(file, config) {
  const b1 = headerValue(file, 1);
  const space = b1.search(/\s/);
  const receiptNo = config.receiptNoMode === 'left15' ? b1.slice(0, 15) : space < 0 ? b1 : b1.slice(0, space);
  const company = space < 0 ? '' : b1.slice(space).trim();
  const [y, m, d] = headerValue(file, 10).match(/\d+/g);
  return {
    receipt_no: receiptNo,
    company,
    address: headerValue(file, 2),
    instrument_kind: headerValue(file, 3),
    model: headerValue(file, 4),
    serial: headerValue(file, 5),
    max_velocity: parseNumber(headerValue(file, 6)),
    test_date: `${y}년 ${m.padStart(2, '0')}월 ${d.padStart(2, '0')}일`,
    velocity_unit: config.velocityUnitLabel,
  };
}

function repeatability(file, maxVelocity, config) {
  const meas = column(file, COL.measured);
  const { zeroRows, spanRows } = config.repeatabilityOrder;
  const zero = pick(meas, zeroRows);
  const span = pick(meas, spanRows);
  const zeroPct = (sampleStd(zero) / maxVelocity) * 100;
  const spanPct = (sampleStd(span) / maxVelocity) * 100;
  const value = Math.max(zeroPct, spanPct);
  return withDisplay(
    {
      zero_pct: zeroPct,
      span_pct: spanPct,
      value_pct: value,
      criterion_pct: config.criteria.repeatability,
      judgement: judge(value, config.criteria.repeatability, config),
      rows: { zero: zeroRows, span: spanRows },
    },
    config,
  );
}

function linearity(file, config) {
  const ref = column(file, COL.ref);
  const meas = column(file, COL.measured);
  const err = ref.map((r, i) => (Math.abs(r - meas[i]) / r) * 100);
  const { p30, p70 } = config.linearitySplit;
  const r30 = range(...p30);
  const r70 = range(...p70);
  // 평균 오차 (반복·직선성 J20·J25): (평균 측정 - 평균 기준) / 평균 기준 × 100
  const avg = (rows) => ((mean(pick(meas, rows)) - mean(pick(ref, rows))) / mean(pick(ref, rows))) * 100;
  const avgError = { p30: avg(r30), p70: avg(r70) };
  const isMean = config.linearityMethod === 'mean';
  const v30 = isMean ? Math.abs(avgError.p30) : Math.max(...pick(err, r30));
  const v70 = isMean ? Math.abs(avgError.p70) : Math.max(...pick(err, r70));
  const value = Math.max(v30, v70);
  return withDisplay(
    {
      method: config.linearityMethod,
      p30_pct: v30,
      p70_pct: v70,
      value_pct: value,
      criterion_pct: config.criteria.linearity,
      judgement: judge(value, config.criteria.linearity, config),
      avg_error_pct: avgError,
      rows: { p30: r30, p70: r70 },
    },
    config,
  );
}

function sensitivity(file, config) {
  const ref = column(file, COL.ref);
  const meas = column(file, COL.measured);
  const err =
    config.sensitivityErrorSource === 'recompute'
      ? ref.map((r, i) => ((meas[i] - r) / r) * 100)
      : column(file, COL.error);
  const n = config.sensitivityRowsPerGroup;
  const byAngle = config.sensitivityGroups.map((g, i) => {
    const rows = [i * n + 1, i * n + n];
    return { angle: g.angle, point: g.point, rows, value_pct: Math.abs(mean(pick(err, range(...rows)))) };
  });
  let max = byAngle[0];
  for (const g of byAngle) if (g.value_pct > max.value_pct) max = g;
  // 그래프 제목용: 지점별 그룹 전체 행의 기준유속 평균
  const velocity = (point) =>
    mean(
      byAngle.filter((g) => g.point === point).flatMap((g) => pick(ref, range(...g.rows))),
    );
  return withDisplay(
    {
      by_angle: byAngle,
      value_pct: max.value_pct,
      max_group: { angle: max.angle, point: max.point },
      criterion_pct: config.criteria.sensitivity,
      judgement: judge(max.value_pct, config.criteria.sensitivity, config),
      velocity_30: velocity('30%'),
      velocity_70: velocity('70%'),
    },
    config,
  );
}

// 요약 50행 전체의 최소·최대·중간값
function environment(files, config) {
  const all = (idx, factor = 1) => files.flatMap((f) => column(f, idx)).map((v) => v * factor);
  const stat = (a) => {
    const min = Math.min(...a);
    const max = Math.max(...a);
    return { min, max, mid: (min + max) / 2 };
  };
  return {
    pressure_hpa: stat(all(COL.pressure, config.pressureKpaToHpa)),
    temperature_c: stat(all(COL.temperature)),
    humidity_pct: stat(all(COL.humidity)),
  };
}

// summaries: { repeatability, linearity, sensitivity } 각각 파싱된 요약 파일
export function compute(summaries, config) {
  const eq = equipment(summaries.repeatability, config);
  const rep = repeatability(summaries.repeatability, eq.max_velocity, config);
  const lin = linearity(summaries.linearity, config);
  const sen = sensitivity(summaries.sensitivity, config);
  return {
    equipment: eq,
    repeatability: rep,
    linearity: lin,
    sensitivity: sen,
    field_coefficient: '해당없음',
    overall: overallJudgement([rep.judgement, lin.judgement, sen.judgement]),
    environment: environment([summaries.repeatability, summaries.linearity, summaries.sensitivity], config),
  };
}
