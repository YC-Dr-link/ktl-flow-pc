/* Offline calculation contract: ktl-hub docs/02 §5. No IO, DOM, or input mutation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KtlCalc = api;
})(globalThis, function () {
  'use strict';
  const METHODS = Object.freeze(['max_absolute', 'signed_mean']);
  class CalculationError extends Error {
    constructor(code, message) { super(message); this.name = 'CalculationError'; this.code = code; }
  }
  function fail(code, message) { throw new CalculationError(code, message); }
  function finite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_NUMBER', `${label}은 유한한 숫자여야 합니다.`);
    return value;
  }
  function checked(value) {
    if (!Number.isFinite(value)) fail('NON_FINITE_RESULT', '계산 범위를 초과했습니다. 입력값을 확인하세요.');
    return value;
  }
  function column(rows, count, key, label) {
    if (!Array.isArray(rows) || rows.length !== count) fail('ROW_COUNT', `${label} 결과는 ${count}행이어야 합니다.`);
    return Array.from(rows, (row, index) => finite(row?.[key], `${label} ${index + 1}행 ${key}`));
  }
  const average = values => checked(values.reduce((sum, value) => sum + value / values.length, 0));
  function repeatability(rows, maximum) {
    finite(maximum, '최대 유속');
    if (maximum <= 0) fail('INVALID_MAXIMUM', '최대 유속은 0보다 커야 합니다.');
    const measured = column(rows, 10, 'measured', '반복성');
    function group(offset) {
      const values = measured.filter((_, index) => index % 2 === offset);
      const mean = average(values);
      const stdev = checked(Math.hypot(...values.map(value => (value - mean) / Math.sqrt(values.length - 1))));
      return { mean, stdev, percent: checked(stdev / maximum * 100), count: values.length };
    }
    const zero = group(0), span = group(1);
    return { zero, span, percent: Math.max(zero.percent, span.percent) };
  }
  function linearity(rows, options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) fail('INVALID_METHOD', '직선성 설정을 확인하세요.');
    const method = options.linearityMethod ?? 'max_absolute';
    if (!METHODS.includes(method)) fail('INVALID_METHOD', '지원하지 않는 직선성 정의입니다.');
    const references = column(rows, 10, 'reference', '직선성');
    const measured = column(rows, 10, 'measured', '직선성');
    if (references.some(value => value <= 0)) fail('INVALID_REFERENCE', '직선성 기준유속은 0보다 커야 합니다.');
    function group(start) {
      const reference = references.slice(start, start + 5), actual = measured.slice(start, start + 5);
      const maxAbsolute = checked(Math.max(...reference.map((value, i) => Math.abs((value - actual[i]) / value) * 100)));
      const referenceMean = average(reference), measuredMean = average(actual);
      const signedMean = checked((measuredMean - referenceMean) / referenceMean * 100);
      return { referenceMean, measuredMean, max_absolute: maxAbsolute, signed_mean: signedMean,
               selected: method === 'max_absolute' ? maxAbsolute : signedMean, count: actual.length };
    }
    const low = group(0), high = group(5);
    /* TODO(확인 필요): 연구원 확인 전 기본 정의는 01 §9의 보수적 max_absolute를 사용한다. */
    return { method, low, high, percent: Math.max(Math.abs(low.selected), Math.abs(high.selected)) };
  }
  function sensitivity(rows) {
    const errors = column(rows, 30, 'errorPct', '민감도');
    const groups = [];
    for (let index = 0; index < 10; index++) {
      const values = errors.slice(index * 3, index * 3 + 3);
      const meanErrorPct = average(values);
      groups.push({ angleDeg: [0, -10, -5, 5, 10][Math.floor(index / 2)],
                    rangePct: index % 2 === 0 ? 30 : 70, meanErrorPct,
                    absoluteMeanPct: Math.abs(meanErrorPct), count: values.length });
    }
    return { groups, percent: Math.max(...groups.map(group => group.absoluteMeanPct)) };
  }
  function calculate(input, options = {}) {
    if (!input || typeof input !== 'object') fail('INVALID_INPUT', '계산 입력이 필요합니다.');
    return { repeatability: repeatability(input.repeatability, input.maximum),
             linearity: linearity(input.linearity, options), sensitivity: sensitivity(input.sensitivity) };
  }
  return Object.freeze({ METHODS, CalculationError, repeatability, linearity, sensitivity, calculate });
});
