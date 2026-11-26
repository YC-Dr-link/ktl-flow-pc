// CSV 파일들을 받아 판별 → 배정 → 검증 → 계산·판정까지 묶는 진입점
import defaultConfig from '../config.js';
import { readCsvFile } from './csv.js';
import { classifyFile } from './classify.js';
import { SLOTS, assignSlots } from './assign.js';
import { validate } from './validate.js';
import { compute } from './compute.js';
import { checkConfig } from './configCheck.js';

// files: [{ name, bytes: Uint8Array }]
// options: { config, assignment: { 칸id: 파일 번호 | null } } (assignment는 사용자가 직접 고른 칸만)
// 반환: { files, slots, notices, errors, warnings, result, summaries }
// 오류가 하나라도 있으면 result와 summaries는 null. summaries는 Excel(M5)이 CSV 원문 행을 넣을 때 쓰는 요약 파일 3개
export function analyze(files, options = {}) {
  const config = options.config || defaultConfig;
  const items = files.map((f) => {
    const file = readCsvFile(f.name, f.bytes);
    return { name: f.name, file, classification: classifyFile(file, config) };
  });

  const { slots, notices } = assignSlots(items, options.assignment || {});
  const validated = validate(items, slots, config);
  const { warnings } = validated;
  const errors = [
    ...checkConfig(config).map((message) => ({ code: 'CONFIG_INVALID', severity: 'error', message })),
    ...validated.errors,
  ];

  let result = null;
  let summaries = null;
  if (errors.length === 0) {
    const summaryOf = (test) => items[slots[SLOTS.find((s) => s.test === test && s.format === 'summary').id]].file;
    const found = { repeatability: summaryOf('repeatability'), linearity: summaryOf('linearity'), sensitivity: summaryOf('sensitivity') };
    try {
      result = compute(found, config);
      summaries = found;
    } catch (e) {
      // 검증을 통과했는데도 계산이 실패하면 예외로 끝내지 않고 오류로 돌려준다 (결과 없음)
      errors.push({
        code: 'COMPUTE_FAILED',
        severity: 'error',
        message: '계산 중 문제가 생겨 결과를 만들 수 없습니다. 파일 내용을 확인해 주세요.',
        cause: String(e && e.message),
      });
    }
  }

  return {
    files: items.map((i) => ({
      name: i.name,
      encoding: i.file.encoding,
      format: i.classification.format,
      test: i.classification.test,
      evidence: i.classification.evidence,
    })),
    slots: Object.fromEntries(
      SLOTS.map((s) => [
        s.id,
        {
          ...s,
          fileIndex: slots[s.id] ?? null,
          fileName: items[slots[s.id]]?.name ?? null,
          manual: Object.hasOwn(options.assignment || {}, s.id),
          evidence: items[slots[s.id]]?.classification.evidence ?? null,
        },
      ]),
    ),
    notices,
    errors,
    warnings,
    result,
    summaries,
  };
}
