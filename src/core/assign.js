// 판별 결과로 6칸에 자동 배정하고, 판별 불가·같은 종류 2개·빠진 종류를 알림으로 만든다
import { FORMAT_NAMES, TEST_NAMES } from './classify.js';

export const SLOTS = [
  { id: 'rep_summary', test: 'repeatability', format: 'summary' },
  { id: 'rep_source', test: 'repeatability', format: 'source' },
  { id: 'lin_summary', test: 'linearity', format: 'summary' },
  { id: 'lin_source', test: 'linearity', format: 'source' },
  { id: 'sen_summary', test: 'sensitivity', format: 'summary' },
  { id: 'sen_source', test: 'sensitivity', format: 'source' },
];

export function slotLabel(slot) {
  return `${TEST_NAMES[slot.test]} ${FORMAT_NAMES[slot.format]}`;
}

// files: [{ name, classification }] / manual: { 칸id: 파일 번호 | null } (사용자가 직접 고른 칸)
// 반환: { slots: { 칸id: 파일 번호 | null }, notices: [...] }
export function assignSlots(files, manual = {}) {
  const slots = {};
  const notices = [];

  files.forEach((f, i) => {
    if (!f.classification.test) {
      notices.push({
        code: 'UNCLASSIFIED',
        file: f.name,
        fileIndex: i,
        message: `'${f.name}' 파일의 종류를 판별할 수 없습니다. ${f.classification.evidence.reason}`,
      });
    }
  });

  for (const slot of SLOTS) {
    if (Object.hasOwn(manual, slot.id)) {
      slots[slot.id] = manual[slot.id];
      continue;
    }
    const candidates = files
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.classification.format === slot.format && f.classification.test === slot.test);
    if (candidates.length === 1) {
      slots[slot.id] = candidates[0].i;
    } else if (candidates.length === 0) {
      slots[slot.id] = null;
      notices.push({
        code: 'MISSING_KIND',
        slot: slot.id,
        message: `${slotLabel(slot)} 파일이 없습니다.`,
      });
    } else {
      slots[slot.id] = null;
      notices.push({
        code: 'DUPLICATE_KIND',
        slot: slot.id,
        files: candidates.map(({ f }) => f.name),
        message: `${slotLabel(slot)} 종류로 보이는 파일이 ${candidates.length}개입니다 (${candidates
          .map(({ f }) => `'${f.name}'`)
          .join(', ')}). 칸에 직접 골라 주세요.`,
      });
    }
  }
  return { slots, notices };
}
