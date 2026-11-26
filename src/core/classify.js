// CSV 내용만 보고 요약/source 형식과 시험 종류(반복성·직선성·민감도)를 판별하고 판별 근거를 만든다 (CALCULATION 2절)
import { COLUMN_NAME_ROW, headerValue, parseNumber } from './csv.js';

export const FORMATS = { summary: '저장번호', source: '시험번호' };
export const TEST_NAMES = { repeatability: '반복성', linearity: '직선성', sensitivity: '설치방향 민감도' };
export const FORMAT_NAMES = { summary: '요약', source: 'source' };

// 기준유속 열 위치 (0부터): 요약 B열, source D열
const REF_COLUMN = { summary: 1, source: 3 };

// 첫 열(번호) 값으로 데이터를 묶어 묶음별 기준유속 평균을 만든다. 숫자가 아니면 null
export function measurementPoints(file, format) {
  const groups = new Map();
  for (const { cells } of file.data) {
    const v = parseNumber(cells[REF_COLUMN[format]] ?? '');
    if (!Number.isFinite(v)) return null;
    const g = groups.get(cells[0]) || [];
    g.push(v);
    groups.set(cells[0], g);
  }
  return [...groups.values()].map((vals) => vals.reduce((a, b) => a + b, 0) / vals.length);
}

// 낮음·높음을 번갈아 감: p[i] < p[i+1] 이 짝수 i에서 참, 홀수 i에서 거짓
function isAlternating(p) {
  return p.every((_, i) => i === p.length - 1 || (p[i] < p[i + 1]) === (i % 2 === 0));
}

// 30 % 행들의 최댓값이 70 % 행들의 최솟값보다 작음 (행 범위는 config.linearitySplit)
function isSplit(p, split) {
  const pick = ([from, to]) => p.slice(from - 1, to);
  return Math.max(...pick(split.p30)) < Math.min(...pick(split.p70));
}

const rangeText = ([from, to]) => `${from}~${to}행`;

// 파일 하나를 판별한다. 결과: { format, test, evidence }. 판별 못 하면 해당 값이 null이고 evidence.reason에 이유
// 측정점 수는 config.rowCounts, 행 구분은 config.linearitySplit을 따른다 (설정 한 곳)
export function classifyFile(file, config) {
  const first = file.rows[COLUMN_NAME_ROW - 1] ? file.rows[COLUMN_NAME_ROW - 1][0] : '';
  const calibrationTime = headerValue(file, 11);
  const evidence = { rowCount: file.data.length, points: null, pattern: null, calibrationTime, reason: '' };
  const format = Object.keys(FORMATS).find((k) => FORMATS[k] === first) || null;
  if (!format) {
    evidence.reason = `12행 첫 칸이 '저장번호'나 '시험번호'가 아닙니다 (현재: '${first}').`;
    return { format: null, test: null, evidence };
  }
  const p = measurementPoints(file, format);
  if (!p) {
    evidence.reason = `${FORMAT_NAMES[format]} 파일의 기준유속에 숫자가 아닌 값이 있어 시험 종류를 판별할 수 없습니다.`;
    return { format, test: null, evidence };
  }
  evidence.points = p.length;

  const counts = config.rowCounts;
  const { p30, p70 } = config.linearitySplit;
  const alternating = p.length === counts.rep && isAlternating(p);
  const split = p.length === counts.lin && p.length >= Math.max(p30[1], p70[1]) && isSplit(p, config.linearitySplit);
  const fits = {
    sensitivity: p.length === counts.sen,
    repeatability: alternating,
    linearity: split,
  };
  const hits = Object.keys(fits).filter((t) => fits[t]);

  let test = null;
  if (hits.length === 1) {
    test = hits[0];
    evidence.pattern = { sensitivity: `${p.length}개 지점`, repeatability: '낮음·높음 교대', linearity: `${rangeText(p30)} < ${rangeText(p70)}` }[test];
    evidence.reason = `측정점 ${p.length}개${test === 'sensitivity' ? '' : `, ${evidence.pattern}`} → ${TEST_NAMES[test]}`;
  } else if (hits.length > 1) {
    evidence.pattern = hits.map((t) => TEST_NAMES[t]).join('·') + ' 패턴이 모두 맞음';
    evidence.reason = `측정점 ${p.length}개이지만 ${evidence.pattern}`;
  } else if (p.length === counts.rep || p.length === counts.lin) {
    evidence.pattern = '교대 패턴도 앞뒤 분리 패턴도 아님';
    evidence.reason = `측정점 ${p.length}개이지만 ${evidence.pattern}`;
  } else {
    evidence.reason = `측정점 ${p.length}개는 ${[...new Set(Object.values(counts))].join('·')}개가 아닙니다.`;
  }
  return { format, test, evidence };
}
