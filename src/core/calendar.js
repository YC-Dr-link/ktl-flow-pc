// JavaScript Date의 자동 이월(2월 30일 → 3월)을 쓰지 않고 실제 달력 날짜를 확인한다.
export function isCalendarDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger) || year < 1 || year > 9999 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

// 기존 장비·합성 형식: YYYY년 M월 D일, YYYY[-./]M[-./]D, M[-./]D[-./]YYYY.
export function parseCalendarDate(value) {
  const text = String(value).trim();
  let parts;
  const korean = /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일$/.exec(text);
  const first = /^(\d{4})([-./])(\d{1,2})\2(\d{1,2})$/.exec(text);
  const last = /^(\d{1,2})([-./])(\d{1,2})\2(\d{4})$/.exec(text);
  if (korean) parts = korean.slice(1);
  else if (first) parts = [first[1], first[3], first[4]];
  else if (last) parts = [last[4], last[1], last[3]];
  return parts && isCalendarDate(...parts.map(Number)) ? parts : null;
}
