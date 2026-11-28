// 저장 화면의 「접수번호 · 회사명 확인 (필수)」 칸. CSV 1행에서 나눈 값을 미리 넣고, 꼴이 다르거나 붙어 있으면 사람이 확인해야 저장된다 (#23)
import { h, clear } from './dom.js';
import { isReceiptNo } from '../core/receipt.js';

const PROBLEM_TEXT = {
  glued: '접수번호와 회사명 사이에 공백이 없습니다.',
  format: '접수번호가 NN-NNNNNN-NN(-N|-NN) 꼴이 아닙니다.',
};
const RECEIPT_HELP = '접수번호는 25-123456-01-1처럼 NN-NNNNNN-NN(-N|-NN) 꼴로 넣으세요.';

// box: 칸을 그릴 요소 / onChange(): 값이 바뀔 때 부름. 반환: { load, values, valid, firstInvalid, problem }
export function createReceiptForm(box, onChange) {
  let problem = null;
  let receipt;
  let company;
  let confirm;
  let receiptErr;
  let lastRaw = null; // 지금 칸에 채운 CSV 1행 원문

  function check() {
    const bad = !isReceiptNo(receipt.value);
    const msg = bad ? RECEIPT_HELP : '';
    if (receiptErr.textContent !== msg) receiptErr.textContent = msg;
    if (bad) receipt.setAttribute('aria-invalid', 'true');
    else receipt.removeAttribute('aria-invalid');
  }

  // eq: 결과의 equipment (없으면 칸을 비운다). 새 CSV면 다시 채우고 확인 체크를 푼다.
  // keep: 같은 CSV로 칸만 다시 고른 경우. 1행 원문이 같으면 사람이 고친 값과 체크를 그대로 둔다
  function load(eq, { keep = false } = {}) {
    if (keep && receipt && lastRaw !== null && (!eq || eq.requester_raw === lastRaw)) return; // 고르는 중에 잠깐 오류(결과 없음)가 나도 남긴다
    lastRaw = eq?.requester_raw ?? null;
    clear(box);
    problem = eq?.receipt_problem ?? null;
    receipt = h('input', { id: 'rc-receipt', name: 'receiptNo', type: 'text', autocomplete: 'off', 'aria-required': 'true', 'aria-describedby': eq?.receipt_problem ? 'rc-warn rc-receipt-err' : 'rc-receipt-err' });
    company = h('input', { id: 'rc-company', name: 'company', type: 'text', autocomplete: 'off' });
    receiptErr = h('p', { class: 'err-text', id: 'rc-receipt-err', 'aria-live': 'polite' });
    receipt.value = eq?.receipt_no ?? '';
    company.value = eq?.company ?? '';
    for (const input of [receipt, company]) input.addEventListener('input', () => (check(), onChange()));
    confirm = null;
    if (problem) {
      confirm = h('input', { id: 'rc-confirm', type: 'checkbox', 'aria-describedby': 'rc-warn', 'aria-invalid': 'true' });
      confirm.addEventListener('change', () => {
        if (confirm.checked) confirm.removeAttribute('aria-invalid');
        else confirm.setAttribute('aria-invalid', 'true');
        onChange();
      });
      box.append(
        h(
          'div',
          { class: 'receipt-warn', id: 'rc-warn' },
          h('strong', {}, `CSV 1행 「${eq.requester_raw}」에서 접수번호와 회사명을 확실히 나눌 수 없습니다. `),
          `${PROBLEM_TEXT[problem]} 아래 값이 맞는지 확인하고 체크하세요.`,
        ),
      );
    } else if (eq) {
      box.append(h('p', { class: 'hint' }, `CSV 1행: 「${eq.requester_raw}」`));
    }
    if (eq) box.append(h('p', { class: 'hint device', id: 'rc-device' }, `저장할 기기: 기기 번호 ${eq.serial || '-'} · 모델 ${eq.model || '-'}`)); // 어느 기기를 저장하는지 (#23)
    box.append(
      h(
        'div',
        { class: 'fields receipt-fields' },
        h('div', { class: 'field' }, h('label', { for: 'rc-receipt' }, '접수번호'), receipt, receiptErr),
        h('div', { class: 'field' }, h('label', { for: 'rc-company' }, '회사명 (의뢰기관)'), company, h('p', { class: 'err-text', 'aria-hidden': 'true' })), // 빈 줄: 옆 칸과 높이를 맞춘다
      ),
    );
    if (confirm) box.append(h('label', { class: 'receipt-confirm', for: 'rc-confirm' }, confirm, ' 접수번호와 회사명을 확인했습니다'));
    if (eq) check();
  }

  return {
    load,
    problem: () => problem,
    values: () => ({ receipt_no: receipt.value.trim(), company: company.value.trim() }),
    valid: () => isReceiptNo(receipt.value) && (!confirm || confirm.checked),
    // 저장이 막혔을 때 초점을 보낼 칸
    firstInvalid: () => (!isReceiptNo(receipt.value) ? receipt : confirm && !confirm.checked ? confirm : null),
  };
}
