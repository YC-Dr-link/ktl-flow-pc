// CSV 1행 「의뢰 기관」(접수번호-세부 + 공백 + 회사명)을 나누고, 접수번호 꼴(NN-NNNNNN-NN(-N|-NN))을 검사한다 (#23)
const RECEIPT = /^(\d{2}-\d{6}-\d{2}(?:-\d{1,2})?)(?![\d-])(.*)$/; // 뒤에 숫자나 '-'가 이어지면(세부 3자리, 하이픈 더) 꼴이 아니다

// problem: null(정상) | 'glued'(접수번호 뒤에 공백 없이 글자가 붙음, 나눈 값은 제안) | 'format'(접수번호 꼴이 아님, 첫 공백 앞을 그대로 씀)
export function splitRequester(text) {
  const value = String(text ?? '').trim();
  const m = RECEIPT.exec(value);
  if (m) {
    const rest = m[2];
    return { receipt_no: m[1], company: rest.trim(), problem: rest && !/^\s/.test(rest) ? 'glued' : null };
  }
  const space = value.search(/\s/);
  return space < 0
    ? { receipt_no: value, company: '', problem: 'format' }
    : { receipt_no: value.slice(0, space), company: value.slice(space).trim(), problem: 'format' };
}

// 사람이 저장 화면에서 고친 접수번호가 꼴에 맞는지
export const isReceiptNo = (text) => /^\d{2}-\d{6}-\d{2}(?:-\d{1,2})?$/.test(String(text ?? '').trim());
