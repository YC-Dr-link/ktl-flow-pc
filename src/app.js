/* M4·M5의 한 화면 작업대를 따르는 실행 뼈대. 견본·계산·템플릿은 포함하지 않는다. */
'use strict';
const byId = id => document.getElementById(id);
const app = byId('app');
const rail = document.querySelector('.rail');
const results = byId('results');
const drop = byId('drop');
const fileInput = byId('fileInput');
const reset = byId('resetBtn');
const slotLabels = ['반복성 결과', '반복성 source', '직선성 결과', '직선성 source', '설치방향 민감도 결과', '설치방향 민감도 source'];
const state = { files: [] };
for (const label of slotLabels) {
  const slot = document.createElement('details');
  slot.className = 'slot';
  const summary = document.createElement('summary');
  const title = document.createElement('span');
  title.className = 'slot-label';
  title.textContent = label;
  const status = document.createElement('span');
  status.className = 'slot-file';
  status.textContent = '미배정 · 내용 판별 연결 전';
  const detail = document.createElement('p');
  detail.className = 'slot-body why';
  detail.textContent = '파일명으로 배정하지 않습니다. 후속 판별 기능에서 내용과 근거를 표시합니다.';
  summary.append(title, status);
  slot.append(summary, detail);
  byId('slots').append(slot);
}
function updateLayout() {
  /* 좁은 화면의 시각적 순서와 Tab 순서를 원본처럼 결과 → 파일 패널로 맞춘다. */
  const active = document.activeElement;
  const restoreFocus = rail.contains(active) || results.contains(active);
  const narrow = matchMedia('(max-width: 1100px)').matches;
  if (narrow && app.firstElementChild !== results) app.prepend(results);
  if (!narrow && app.firstElementChild !== rail) app.prepend(rail);
  if (restoreFocus && document.activeElement !== active) active.focus();
}
function selectFiles(files) {
  state.files = Array.from(files);
  byId('fileList').replaceChildren();
  for (const file of state.files) {
    const row = document.createElement('li');
    row.textContent = `${file.name} · ${file.size.toLocaleString('ko-KR')} 바이트 · 판별 대기`;
    byId('fileList').append(row);
  }
  const count = state.files.length;
  app.classList.toggle('empty', count === 0);
  results.hidden = count === 0;
  reset.disabled = count === 0;
  byId('h-rail').textContent = count ? '넣은 파일' : '풍동 프로그램의 CSV 6개를 넣으세요';
  byId('fileCount').textContent = count ? `선택 ${count}개 / 필요 6개 · 내용 판별 전` : '넣은 파일이 없습니다.';
  byId('status').textContent = count ? `${count}개 파일을 선택했습니다. 내용 판별과 계산은 연결 전입니다.` : '파일 선택을 초기화했습니다.';
  updateLayout();
}
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) selectFiles(fileInput.files);
  fileInput.value = '';
});
for (const event of ['dragenter', 'dragover']) drop.addEventListener(event, e => {
  e.preventDefault();
  drop.classList.add('over');
});
for (const event of ['dragleave', 'drop']) drop.addEventListener(event, () => drop.classList.remove('over'));
drop.addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer.files.length) selectFiles(e.dataTransfer.files);
});
for (const event of ['dragover', 'drop']) window.addEventListener(event, e => e.preventDefault());
reset.addEventListener('click', () => {
  selectFiles([]);
  fileInput.focus();
});
matchMedia('(max-width: 1100px)').addEventListener('change', updateLayout);
updateLayout();
/* TODO(확인 필요): 원본 프로토타입의 계산·Excel 계약 차이를 검토한 후 해당 이슈에서 연결한다. */
