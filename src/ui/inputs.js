// CSV에 없는 일반사항 값을 받는 선택 입력 폼 (FR-M5-05). 키는 excel/cellValues.js의 선택 입력 키와 같다
import { h, clear } from './dom.js';

const FIELDS = [
  { key: 'receiptDate', label: '접수일자', placeholder: '2025년 10월 17일' },
  { key: 'unitNumber', label: '호기 (ST 뒤 값)', placeholder: '2' },
  { key: 'representative', label: '대표자' },
  { key: 'phone', label: '전화번호', placeholder: '055-000-0000', inputmode: 'tel' },
  { key: 'previousInspectionDate', label: '직전 정도검사일' },
  { key: 'firstInspectionDate', label: '최초 정도검사일' },
  { key: 'maker', label: '제작회사' },
  { key: 'approvalNumber', label: '형식승인번호' },
  { key: 'approvalDate', label: '형식승인일자' },
  { key: 'pitotCoefficient', label: '피토계수', numeric: true, placeholder: '1.0' },
  { key: 'pitotType', label: '피토관 형식' },
  { key: 'pitotSerial', label: '피토관 제작번호' },
  { key: 'referenceReportNo', label: '참조 성적서 번호' },
];

// 항목 이름 마지막 글자의 받침으로 은/는을 고른다. 한글이 아니면 '는'
export const eunNeun = (name) => {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '은' : '는';
};

// 클라이언트 검증: 숫자 칸만 확인한다. 반환: 오류 문구 | ''
function check(field, value) {
  const v = value.trim();
  if (field.numeric && v && !Number.isFinite(Number(v.replace(',', '.')))) return `${field.label}${eunNeun(field.label)} 숫자로 입력하세요.`;
  return '';
}

// form: <form> 요소 / onChange(): 값이 바뀔 때 부름. 반환: { values, valid, reset }
export function createOptionalForm(form, onChange) {
  clear(form);
  const inputs = {};
  const errors = {};
  for (const field of FIELDS) {
    const id = `opt-${field.key}`;
    const input = h('input', {
      id,
      name: field.key,
      type: 'text',
      placeholder: field.placeholder,
      inputmode: field.inputmode ?? (field.numeric ? 'decimal' : null),
      'aria-describedby': `${id}-err`,
    });
    // aria-live: 칸을 떠나지 않아도 오류가 낭독된다. role=alert는 타이핑 중 읽던 글자를 끊어서 쓰지 않는다
    const err = h('p', { class: 'err-text', id: `${id}-err`, 'aria-live': 'polite' });
    input.addEventListener('input', () => {
      const msg = check(field, input.value);
      if (err.textContent !== msg) err.textContent = msg; // 같은 문구를 다시 쓰면 키를 칠 때마다 다시 읽힌다
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      onChange();
    });
    inputs[field.key] = input;
    errors[field.key] = err;
    form.append(h('div', { class: 'field' }, h('label', { for: id }, field.label), input, err));
  }
  return {
    values: () => Object.fromEntries(FIELDS.map((f) => [f.key, inputs[f.key].value.trim()]).filter(([, v]) => v)),
    valid: () => FIELDS.every((f) => !check(f, inputs[f.key].value)),
    invalidCount: () => FIELDS.filter((f) => check(f, inputs[f.key].value)).length,
    reset: () => {
      for (const f of FIELDS) {
        inputs[f.key].value = '';
        inputs[f.key].removeAttribute('aria-invalid');
        errors[f.key].textContent = '';
      }
    },
  };
}
