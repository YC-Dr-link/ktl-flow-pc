// 오류·경고·알림 묶음 하나를 그리는 공용 함수 (1단계 메시지와 2단계 결과 화면이 함께 씀)
import { h } from './dom.js';

// cls: 'err' | 'warn' | '' / items: [{ code?, message }]. 항목이 없으면 null
export function noticeList(cls, title, items, note = '') {
  if (!items.length) return null;
  return h(
    'div',
    { class: `notice ${cls}`, role: 'group', 'aria-label': title },
    h('h3', {}, `${title} ${items.length}건${note}`),
    h('ul', {}, items.map((m) => h('li', {}, m.code ? h('code', {}, m.code) : null, m.message))),
  );
}
