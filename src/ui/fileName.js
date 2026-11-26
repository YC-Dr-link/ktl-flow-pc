// 내려받을 파일 이름을 안전하게 다듬는 순수 함수 (경로 문자·방향 제어·폭 없는 문자 제거, 길이 상한, Windows 예약어 피하기)
export const MAX_BASE_LENGTH = 120;

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i; // Windows 장치 이름 (확장자가 붙어도 예약어)

// 이름을 다듬고 확장자는 항상 소문자 .xlsx로 붙인다. 한글 기본 이름은 그대로 남는다
export function safeDownloadName(name) {
  const clean = String(name)
    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '') // 제어 문자, Windows 경로 문자
    .replace(/[؜​-‏‪-‮⁠⁦-⁩﻿]/g, '') // 방향 제어·폭 없는 문자
    .replace(/\s+/g, ' ')
    .trim(); // 확장자 판별 전에 끝 공백을 없애 '.xlsx '도 확장자로 알아본다
  const base = clean.replace(/\.xlsx$/i, '').trim();
  let cut = [...base].slice(0, MAX_BASE_LENGTH).join('').replace(/[. ]+$/, '');
  if (!cut) cut = 'CLAYDOX';
  if (RESERVED.test(cut)) cut = `${cut}_`;
  return `${cut}.xlsx`;
}
