// CSV에 없는 일반사항 값을 받는 선택 입력 폼 (FR-M5-05). 키는 excel/cellValues.js의 선택 입력 키와 같다
import { h, clear } from './dom.js';
import { parseNumber } from '../core/csv.js';

// date: 날짜 칸(꼴이 다르면 노란 안내, 저장은 막지 않음), hint: 칸 아래 늘 보이는 도움말 (#24)
const FIELDS = [
  { key: 'receiptDate', label: '접수일자', placeholder: '예: 2025년 10월 17일', date: true },
  { key: 'unitNumber', label: '호기 (ST 뒤 값)', placeholder: '예: 2' },
  { key: 'representative', label: '대표자' },
  { key: 'phone', label: '전화번호', placeholder: '예: 055-000-0000', inputmode: 'tel' },
  { key: 'previousInspectionDate', label: '직전 정도검사일', placeholder: '예: 2024년 10월 20일', date: true },
  { key: 'firstInspectionDate', label: '최초 정도검사일', placeholder: '예: 2019년 05월 01일', date: true },
  { key: 'maker', label: '제작회사' },
  { key: 'approvalNumber', label: '형식승인번호' },
  { key: 'approvalDate', label: '형식승인일자', placeholder: '예: 2013년 08월 30일', date: true, hint: '변경표에서 최대범위가 같은 행의 날짜' },
  { key: 'pitotCoefficient', label: '피토계수', numeric: true, placeholder: '예: 1.0' },
  { key: 'pitotType', label: '피토관 형식' },
  { key: 'pitotSerial', label: '피토관 제작번호' },
  { key: 'referenceReportNo', label: '참조 성적서 번호' },
];

// 항목 이름 마지막 글자의 받침으로 은/는을 고른다. 한글이 아니면 '는'
export const eunNeun = (name) => {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '은' : '는';
};

// 날짜 칸이 받는 꼴: 「YYYY년 MM월 DD일」 또는 「YYYY.MM.DD」(월 · 일 두 자리). TODO(확인 필요): 양식 칸마다 어느 꼴인지 (Q13)
export const isDateText = (v) => /^\d{4}년 \d{2}월 \d{2}일$/.test(v) || /^\d{4}\.\d{2}\.\d{2}$/.test(v);
const DATE_HELP = '날짜는 2025년 10월 17일 또는 2025.10.17처럼 넣으세요. 맞으면 그대로 저장해도 됩니다.';
const FROM_LAST_YEAR = '작년 파일에서 불러옴';

// 클라이언트 검증: 숫자 칸만 확인한다(저장을 막음). 반환: 오류 문구 | ''
function check(field, value) {
  const v = value.trim();
  if (field.numeric && v && !Number.isFinite(parseNumber(v.replace(',', '.')))) return `${field.label}${eunNeun(field.label)} 숫자로 입력하세요.`; // 저장(cellValues.js)과 같은 숫자 판정
  return '';
}
// 날짜 꼴 안내: 저장은 막지 않는다 (#24)
const warnOf = (field, value) => (field.date && value.trim() && !isDateText(value.trim()) ? DATE_HELP : '');

// form: <form> 요소 / onChange(): 값이 바뀔 때 부름. 반환: { values, valid, invalidCount, reset, fill, hasValues }
export function createOptionalForm(form, onChange) {
  clear(form);
  const inputs = {};
  const notes = {};
  const from = new Set(); // 작년 파일에서 채우고 아직 사람이 고치지 않은 칸

  // 칸 아래 한 줄: 오류(빨강) > 날짜 안내(노랑) > 작년 파일에서 불러옴(회색)
  function sync(field) {
    const input = inputs[field.key];
    const err = check(field, input.value);
    const warn = warnOf(field, input.value);
    // 작년 파일에서 온 칸은 날짜 안내가 있어도 어디서 왔는지 함께 보인다
    const fromText = from.has(field.key) ? FROM_LAST_YEAR : '';
    const msg = err || (warn ? (fromText ? `${fromText} · ${warn}` : warn) : fromText);
    const note = notes[field.key];
    if (note.textContent !== msg) note.textContent = msg; // 같은 문구를 다시 쓰면 키를 칠 때마다 다시 읽힌다
    note.className = `err-text${!err && warn ? ' warn' : ''}${!err && !warn && msg ? ' from' : ''}`;
    if (err) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  for (const field of FIELDS) {
    const id = `opt-${field.key}`;
    const input = h('input', {
      id,
      name: field.key,
      type: 'text',
      placeholder: field.placeholder,
      inputmode: field.inputmode ?? (field.numeric ? 'decimal' : null),
      'aria-describedby': field.hint ? `${id}-hint ${id}-err` : `${id}-err`,
    });
    // aria-live: 칸을 떠나지 않아도 오류가 낭독된다. role=alert는 타이핑 중 읽던 글자를 끊어서 쓰지 않는다
    const note = h('p', { class: 'err-text', id: `${id}-err`, 'aria-live': 'polite' });
    input.addEventListener('input', () => {
      from.delete(field.key); // 사람이 고치면 「불러옴」 표시를 뗀다
      sync(field);
      onChange();
    });
    inputs[field.key] = input;
    notes[field.key] = note;
    form.append(
      h(
        'div',
        { class: 'field' },
        h('label', { for: id }, field.label),
        input,
        field.hint ? h('p', { class: 'hint', id: `${id}-hint` }, field.hint) : null,
        note,
      ),
    );
  }
  return {
    values: () => Object.fromEntries(FIELDS.map((f) => [f.key, inputs[f.key].value.trim()]).filter(([, v]) => v)),
    valid: () => FIELDS.every((f) => !check(f, inputs[f.key].value)),
    invalidCount: () => FIELDS.filter((f) => check(f, inputs[f.key].value)).length,
    hasValues: () => FIELDS.some((f) => inputs[f.key].value.trim()),
    reset: () => {
      from.clear();
      for (const f of FIELDS) {
        inputs[f.key].value = '';
        sync(f);
      }
    },
    // 비어 있는 칸만 values로 채우고 「작년 파일에서 불러옴」을 단다. 반환: 채운 칸 수
    fill: (values) => {
      let n = 0;
      for (const f of FIELDS) {
        const v = values[f.key];
        if (!v || inputs[f.key].value.trim()) continue;
        inputs[f.key].value = v;
        from.add(f.key);
        sync(f);
        n += 1;
      }
      if (n) onChange();
      return n;
    },
  };
}
