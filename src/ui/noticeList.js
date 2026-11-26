// 오류·경고·알림 묶음 하나를 그리는 공용 함수 (1단계 메시지와 2단계 결과 화면이 함께 씀)
import { h } from './dom.js';

// 코드별 "다음에 할 일" (#23). 메시지가 이미 할 일을 말하는 코드(PAIR_TIME · DATA_AFTER_BLANK)와 내부 코드(CONFIG_INVALID · COMPUTE_FAILED)는 덧붙이지 않는다
export const NEXT_STEP = {
  FILE_MISSING: '빠진 CSV를 더 넣으세요.',
  MISSING_KIND: '빠진 CSV를 더 넣으세요.',
  DUPLICATE_KIND: '같은 종류 파일 중 하나를 빼고 다시 넣거나, 「넣은 파일」 칸에서 직접 고르세요.',
  UNCLASSIFIED: '풍동 프로그램이 저장한 CSV가 맞는지 확인하세요.',
  HEADER_MISMATCH: '같은 기기 · 같은 날 시험한 CSV 6개인지 확인하세요.',
  VALUE_INVALID: '풍동 프로그램에서 CSV를 다시 저장하거나, 해당 칸을 확인하세요.',
  ROW_COUNT: '시험을 끝까지 마친 CSV인지 확인하세요.',
  SLOT_FORMAT: '「넣은 파일」 칸에서 맞는 파일을 다시 고르세요.',
  SLOT_MISMATCH: '「넣은 파일」 칸에서 맞는 파일을 다시 고르세요.',
  SOURCE_MISMATCH: '요약과 source가 같은 시험의 파일인지 확인하세요.',
};

// cls: 'err' | 'warn' | '' / items: [{ code?, message }]. 항목이 없으면 null.
// 영문 코드는 화면 글자에 보이지 않게 li[data-code]와 접힌 「근거」 안에만 둔다 (03 공통 규칙, #23)
export function noticeList(cls, title, items, note = '') {
  if (!items.length) return null;
  return h(
    'div',
    { class: `notice ${cls}`, role: 'group', 'aria-label': title },
    h('h3', {}, `${title} ${items.length}건${note}`),
    h(
      'ul',
      {},
      items.map((m) =>
        h(
          'li',
          { 'data-code': m.code || null },
          m.message,
          NEXT_STEP[m.code] ? h('span', { class: 'next-step' }, ` ${NEXT_STEP[m.code]}`) : null,
          m.code ? h('details', { class: 'why' }, h('summary', {}, '근거'), h('code', {}, m.code)) : null,
        ),
      ),
    ),
  );
}
