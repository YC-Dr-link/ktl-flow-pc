// 사사오입(0.05 → 0.1) 표시 함수. 10진 문자열에서 올려 toFixed의 부동소수 오차를 피한다

// toPrecision이 지수 표기를 줄 때 일반 소수 문자열로 푼다 (양수만)
function expandExponent(s) {
  const m = /^(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
  if (!m) return s;
  const digits = m[1] + (m[2] || '');
  const pointAt = 1 + Number(m[3]); // digits 안에서 소수점이 놓일 위치
  if (pointAt <= 0) return '0.' + '0'.repeat(-pointAt) + digits;
  if (pointAt >= digits.length) return digits + '0'.repeat(pointAt - digits.length);
  return digits.slice(0, pointAt) + '.' + digits.slice(pointAt);
}

// 15자리 유효숫자로 부동소수 잡음을 걷은 뒤 소수 decimals자리로 사사오입한 문자열
export function formatRounded(value, decimals) {
  if (!Number.isFinite(value)) throw new RangeError('유한한 숫자가 아닙니다.');
  const negative = value < 0;
  const plain = expandExponent(Math.abs(value).toPrecision(15));
  const [intPart, fracPart = ''] = plain.split('.');
  const frac = fracPart.padEnd(decimals + 1, '0');
  let scaled = BigInt(intPart + frac.slice(0, decimals));
  if (frac[decimals] >= '5') scaled += 1n;
  const digits = scaled.toString().padStart(decimals + 1, '0');
  const body = decimals === 0 ? digits : digits.slice(0, -decimals) + '.' + digits.slice(-decimals);
  return (negative && /[1-9]/.test(body) ? '-' : '') + body;
}

// 사사오입한 숫자 값
export function roundHalfUp(value, decimals) {
  return Number(formatRounded(value, decimals));
}
