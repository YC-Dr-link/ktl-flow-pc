// 6칸 배정 패널. 칸마다 이름·파일 이름이 늘 보이고, 펼치면 파일을 고르는 목록과 판별 근거가 나온다. 바꾸면 main에 알린다
import { h, clear } from './dom.js';

const KIND_NAMES = { repeatability: '반복성', linearity: '직선성', sensitivity: '설치방향 민감도' };
const FORMAT_NAMES = { summary: '요약', source: 'source' };

// 칸 이름 (예: 반복성 요약)
export const slotLabel = (slot) => `${KIND_NAMES[slot.test]} ${FORMAT_NAMES[slot.format]}`;

const kindText = (f) => (f.test && f.format ? `${KIND_NAMES[f.test]} ${FORMAT_NAMES[f.format]}` : '판별 불가');

// 사용자가 직접 펼치거나 접은 칸 (칸 id → 펼침 여부). 다시 그려도 그대로 두고, 새 파일을 넣으면 비운다
const userOpen = new Map();
export const resetSlotState = () => userOpen.clear();

// 배지: 비어 있거나 오류가 걸린 칸은 빨강, 직접 고른 칸·자동 배정된 칸은 연한 파랑
function badgeOf(slot, hasError) {
  if (slot.fileIndex === null) return h('span', { class: 'badge fill-bad' }, '비어 있음');
  if (hasError) return h('span', { class: 'badge fill-bad' }, '고칠 곳');
  return h('span', { class: 'badge weak' }, slot.manual ? '직접 고름' : '자동');
}

// analysis: analyze() 반환값 / onPick(slotId, 파일 번호 | null)
export function renderSlots(container, analysis, onPick) {
  const focusedId = document.activeElement && container.contains(document.activeElement) ? document.activeElement.id : null;
  // 오류가 걸린 칸: 오류가 칸을 가리키거나(slot), 그 칸에 들어간 파일을 가리키는(file) 경우
  const slotOfFile = new Map(Object.values(analysis.slots).filter((s) => s.fileName).map((s) => [s.fileName, s.id]));
  const withError = new Set(analysis.errors.map((e) => e.slot ?? slotOfFile.get(e.file)).filter(Boolean));
  clear(container);
  for (const slot of Object.values(analysis.slots)) {
    const id = `slot-${slot.id}`;
    const filled = slot.fileIndex !== null;
    const problem = !filled || withError.has(slot.id);
    const open = userOpen.has(slot.id) ? userOpen.get(slot.id) : problem; // 고칠 곳이 있는 칸은 처음부터 펼쳐 둔다
    const select = h(
      'select',
      {
        id,
        'aria-describedby': `${id}-why`,
        onChange: (e) => {
          userOpen.set(slot.id, true); // 목록을 쓰는 중이면 문제가 없어져도 칸을 접지 않는다 (접히면 초점을 잃는다)
          onPick(slot.id, e.target.value === '' ? null : Number(e.target.value));
        },
      },
      h('option', { value: '' }, '(비움)'),
      analysis.files.map((f, i) => h('option', { value: String(i), selected: slot.fileIndex === i }, `${f.name} — ${kindText(f)}`)),
    );
    const summary = h(
      'summary',
      { onClick: (e) => userOpen.set(slot.id, !e.currentTarget.parentElement.open) },
      h('span', { class: 'slot-label' }, slotLabel(slot), badgeOf(slot, withError.has(slot.id))),
      h('span', { class: 'slot-file' }, filled ? slot.fileName : '파일 없음'),
    );
    container.append(
      h(
        'details',
        { class: `slot ${filled ? 'filled' : 'empty'}`, open, dataset: { slot: slot.id } },
        summary,
        h(
          'div',
          { class: 'slot-body' },
          h('label', { for: id }, '이 칸에 넣을 파일 (바꾸기)'),
          select,
          h('p', { class: 'why', id: `${id}-why` }, filled ? `판별 근거: ${slot.evidence.reason}` : '이 칸에 맞는 파일이 아직 없습니다.'),
        ),
      ),
    );
  }
  if (focusedId) container.querySelector(`#${CSS.escape(focusedId)}`)?.focus();
}
