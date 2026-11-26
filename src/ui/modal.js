// 결과 화면의 모달(설치 방향 및 민감도 그래프·시험 환경 조건, CLAYDOX가 가져갈 주요 셀). 열 때 내용을 그리고 닫으면 비운다 (SPEC AC-18)
import { h, clear } from './dom.js';

const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
const visible = (el) => el.getClientRects().length > 0;

// title: 모달 제목 / render(body): 본문을 body 요소에 그린다. 반환: { open(trigger) }
export function createModal({ id, title, render }) {
  const heading = h('h2', { id: `${id}-title`, tabindex: '-1' }, title);
  const body = h('div', { class: 'modal-body' });
  const closeBtn = h('button', { type: 'button', class: 'btn weak' }, '닫기');
  const dialog = h(
    'dialog',
    { id, class: 'modal', 'aria-modal': 'true', 'aria-labelledby': heading.id },
    h('div', { class: 'modal-head' }, heading, closeBtn),
    body,
  );
  document.body.append(dialog);
  let trigger = null;

  closeBtn.addEventListener('click', () => dialog.close()); // 닫기 수단은 닫기 버튼과 Esc뿐이다. 배경을 눌러도 닫히지 않는다
  dialog.addEventListener('close', () => {
    clear(body);
    document.documentElement.classList.remove('modal-open');
    trigger?.focus(); // 연 버튼으로 초점 복귀
    trigger = null;
  });
  // 초점 가두기: Tab이 모달 밖(브라우저 화면 요소)으로 나가지 않고 처음과 끝을 돈다
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const stops = [...dialog.querySelectorAll(FOCUSABLE)].filter(visible);
    if (!stops.length) return;
    const [first, last] = [stops[0], stops.at(-1)];
    const inside = stops.includes(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
      e.preventDefault();
      first.focus();
    }
  });

  return {
    open(opener) {
      trigger = opener;
      render(body);
      document.documentElement.classList.add('modal-open'); // 뒤 화면 스크롤 잠금
      dialog.showModal(); // 뒤 화면은 조작·읽기에서 빠진다 (inert)
      heading.focus(); // 열면 초점은 제목으로
      body.scrollTop = 0;
    },
  };
}
