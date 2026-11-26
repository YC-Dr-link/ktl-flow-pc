// 한 화면 작업대(왼쪽 넣은 파일, 오른쪽 결과)를 묶는 화면 진입점. 판별·검증·계산은 core의 analyze, Excel은 excel의 buildXlsx를 부르기만 한다
import { analyze } from '../core/analyze.js';
import { buildXlsx, checkTemplate, outputFileName } from '../excel/buildXlsx.js';
import { h, clear } from './dom.js';
import { renderSlots, resetSlotState } from './slots.js';
import { renderResult, renderGraphEnv, renderUsedRows } from './results.js';
import { createModal } from './modal.js';
import { createOptionalForm } from './inputs.js';
import { renderMapPreview } from './mapPreview.js';
import { noticeList } from './noticeList.js';
import { safeDownloadName } from './fileName.js';
import { createFolderWatch } from './folderWatch.js';
import { createReceiptForm } from './receiptForm.js';

const $ = (id) => document.getElementById(id);
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toBase64 = (bytes) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));

const state = {
  files: [], // [{ name, bytes }]
  assignment: {}, // 사용자가 직접 고른 칸만
  analysis: null,
  template: null, // { name, bytes } — 사용자가 고른 Excel 양식. 빌드에는 양식을 넣지 않는다
  screen: 'result', // 'result'(CSV를 넣고 결과를 보는 화면, 처음) | 'save'(저장 화면, 패널·결과는 숨기기만 하고 상태는 그대로)
};

let excelSaving = false; // 저장 위치를 고르고 파일을 쓰는 동안 true. 그동안 저장 버튼과 폴더 「반영」을 막는다
let watchBlock = null; // 폴더 감시가 저장을 막는 이유 (재측정 CSV 교체를 묻는 동안, #23). 없으면 null

function onInputChange() {
  syncSaveBtn();
  syncSaveBlock();
  syncOptionalBadge();
}
const optionalForm = createOptionalForm($('optionalForm'), onInputChange);
const receiptForm = createReceiptForm($('receiptBox'), onInputChange); // 접수번호 · 회사명 확인 (#23)
const inputsValid = () => receiptForm.valid() && optionalForm.valid();

// 저장 화면에서 사람이 확인한 접수번호 · 회사명을 넣은 결과. Excel(D2 · D3 · 시트별 B1)과 파일 이름은 이 값을 쓴다
const confirmedResult = () => {
  const { result } = state.analysis;
  return { ...result, equipment: { ...result.equipment, ...receiptForm.values() } };
};

// 저장 화면의 선택 입력 제목 옆에 틀린 칸 수를 빨간 배지로 보인다 (AC-11)
function syncOptionalBadge() {
  const n = optionalForm.invalidCount();
  $('optionalBadge').hidden = n === 0;
  $('optionalBadge').textContent = n ? `고칠 곳 ${n}건` : '';
}

// 저장 상태 띠(#saveMsg)에 글을 쓴다. state는 어떤 안내인지 표시해 두어, 같은 안내를 다시 쓰지 않고 다른 안내를 지우지 않게 한다
function setMsg(state, cls, ...children) {
  const msg = $('saveMsg');
  msg.className = `msg${cls ? ` ${cls}` : ''}`;
  msg.dataset.state = state;
  msg.replaceChildren(...children);
}

// 저장 버튼이 입력 오류로 막힌 이유를 위 줄 바로 아래 띠에 알린다. 고치면 이 안내만 지운다 (접근성 A5)
const SAVE_BLOCKED = '입력 값에 고칠 곳이 있어 저장할 수 없습니다. 표시된 칸을 고치면 저장할 수 있습니다.';
const RECEIPT_BLOCKED = '접수번호 · 회사명을 확인해야 저장할 수 있습니다.';
function goToInvalid(e) {
  e.preventDefault();
  (receiptForm.firstInvalid() || document.querySelector('#optionalForm [aria-invalid="true"]'))?.focus(); // 첫 오류 칸으로
}
function syncSaveBlock() {
  const msg = $('saveMsg');
  const blocked = ['blocked', 'blockedReceipt', 'blockedWatch'].includes(msg.dataset.state);
  const link = () => h('a', { href: '#saveScreen', onClick: goToInvalid }, '고칠 칸으로');
  if (watchBlock && state.analysis?.result) {
    if (msg.dataset.state !== 'blockedWatch' || msg.textContent !== watchBlock) setMsg('blockedWatch', 'err', watchBlock);
  } else if (state.screen === 'save' && !receiptForm.valid()) {
    if (msg.dataset.state !== 'blockedReceipt') setMsg('blockedReceipt', 'err', `${RECEIPT_BLOCKED} `, link());
  } else if (state.screen === 'save' && !optionalForm.valid()) {
    if (msg.dataset.state !== 'blocked') setMsg('blocked', 'err', `${SAVE_BLOCKED} `, link()); // 같은 글을 다시 쓰면 role=status가 글자마다 다시 읽는다
  } else if (blocked) {
    setMsg('', '');
  }
}

const TEMPLATE_KEY = 'm4m5.template';
const NEED_TEMPLATE = '양식 파일을 먼저 선택하세요.';
// Excel 양식 상태 줄. 고른 파일이 양식이 아니면 이유를 보이고, 이전에 고른 양식은 그대로 둔다
function syncTemplate(error = '') {
  const current = state.template ? `선택한 양식: ${state.template.name}` : NEED_TEMPLATE;
  $('templateStatus').textContent = error ? `${error} ${state.template ? `지금 쓰는 양식: ${state.template.name}` : NEED_TEMPLATE}` : current;
  $('templateStatus').classList.toggle('bad', Boolean(error));
  $('templateStatus').classList.toggle('picked', !error && Boolean(state.template));
  $('templatePickText').textContent = state.template ? '다른 양식 고르기' : '양식 파일 고르기';
}
// 지난번에 고른 양식을 이 PC의 브라우저 저장소에서 되살린다
async function restoreTemplate() {
  try {
    const saved = JSON.parse(localStorage.getItem(TEMPLATE_KEY));
    if (saved) {
      const bytes = fromBase64(saved.base64);
      await checkTemplate(bytes);
      state.template = { name: String(saved.name), bytes };
    }
  } catch {
    // 저장소를 쓸 수 없거나 값이 깨졌으면 기억 없이 매번 고르게 둔다
  }
  syncTemplate();
}
async function onTemplate(file) {
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    await checkTemplate(bytes);
  } catch (e) {
    syncTemplate(e.message); // checkTemplate의 오류는 화면에 보여 줄 한국어 문구다
    return;
  }
  state.template = { name: file.name, bytes };
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify({ name: file.name, base64: toBase64(bytes) }));
  } catch {
    // 저장소가 막혀 있으면 이번 실행에서만 쓴다
  }
  syncTemplate();
  if ($('saveMsg').dataset.state === 'needTemplate') setMsg('', '');
}

// 위 줄의 주 버튼. 결과 화면에서는 「Excel 만들고 저장」(저장 화면으로 감), 저장 화면에서는 「Excel 저장」(저장 위치를 고르고 씀)
function syncSaveBtn() {
  const { screen } = state;
  $('saveBtn').textContent = screen === 'save' ? 'Excel 저장' : 'Excel 만들고 저장';
  $('saveBtn').disabled = excelSaving || Boolean(watchBlock) || (screen === 'save' ? !inputsValid() : !state.analysis?.result); // 저장 화면에서는 입력 오류가 있을 때만 꺼진다
}
// 상태 낭독. 같은 문구를 연달아 써도 다시 읽히도록 먼저 비우고 잠시 뒤에 쓴다 (스크린리더는 내용이 바뀌어야 읽는다)
let sayTimer = 0;
function say(text) {
  clearTimeout(sayTimer);
  $('status').textContent = '';
  sayTimer = setTimeout(() => ($('status').textContent = text), 60);
}

// 오류·경고·판별 알림 목록. 결과가 있으면 경고·알림은 종합판정 아래(결과 화면)에서 보여 준다
function renderMessages(a) {
  const box = clear($('messages'));
  if (!state.files.length) return;
  box.append(
    ...[noticeList('err', '오류', a.errors), a.result ? null : noticeList('warn', '경고', a.warnings), a.result ? null : noticeList('', '알림', a.notices)].filter(Boolean),
  );
}

// keepReceipt: 칸만 다시 고른 경우(onPick). CSV 1행이 같으면 사람이 고친 접수번호 · 회사명과 확인 체크를 남긴다
function refresh({ keepReceipt = false } = {}) {
  const t0 = performance.now();
  const a = analyze(state.files, { assignment: state.assignment });
  state.analysis = a;
  const ms = Math.round(performance.now() - t0);
  document.body.dataset.analyzeMs = String(ms);

  const hasFiles = state.files.length > 0;
  $('app').classList.toggle('empty', !hasFiles);
  $('results').hidden = !hasFiles;
  $('h-rail').textContent = hasFiles ? '넣은 파일' : '풍동 프로그램의 CSV 6개를 넣으세요';
  $('railLead').textContent = `파일 이름이 아니라 내용을 보고 6칸에 알아서 나눕니다. 검증을 통과하면 결과가 ${hasFiles ? '' : '이 화면에 '}바로 나타납니다.`;
  $('fileCount').textContent = hasFiles ? `넣은 파일 ${state.files.length}개` : '넣은 파일이 없습니다.';
  if (hasFiles) renderSlots($('slots'), a, onPick);
  else clear($('slots'));
  renderMessages(a);

  const ok = Boolean(a.result);
  const blocked = $('resultBlocked');
  blocked.hidden = ok || !hasFiles;
  blocked.textContent = blocked.hidden ? '' : '검증을 통과하지 못해 결과와 Excel을 만들 수 없습니다. 「넣은 파일」 칸에서 오류를 고쳐 주세요.';
  $('resultBody').hidden = !ok;
  if (!ok) clear($('resultBody')); // 이전 결과가 숨은 채로 남지 않게
  if (ok) {
    renderResult($('resultBody'), a);
    $('saveName').textContent = '';
  }
  receiptForm.load(ok ? a.result.equipment : null, { keep: keepReceipt }); // 새 CSV면 1행 값으로 다시 채우고 확인 체크를 푼다
  syncSaveBtn();
  setMsg('', '');
  syncSaveBlock();
  return ok;
}

function onPick(slotId, fileIndex) {
  state.assignment = { ...state.assignment, [slotId]: fileIndex };
  const ok = refresh({ keepReceipt: true });
  say(ok ? announce() : `오류 ${state.analysis.errors.length}건이 있습니다. 오류 내용을 확인하세요.`);
}

// 결과가 나타났을 때 낭독할 문장 (SPEC FR-M4-11 AC-7). 경고나 알림이 있으면 건수를 덧붙인다
function announce() {
  const { warnings, notices } = state.analysis;
  const parts = [warnings.length && `경고 ${warnings.length}건`, notices.length && `알림 ${notices.length}건`].filter(Boolean); // 0건은 말하지 않는다 (SPEC AC-7)
  const extra = parts.length ? ` ${parts.join(', ')}이 있습니다.` : '';
  return `6개 파일을 칸에 배정하고 검증을 통과해 결과를 표시했습니다.${extra}`;
}

// 새 파일 목록으로 바꾸고 처음부터 다시 분석한다. 선택 입력 값도 비운다 (다른 접수 건의 값이 남지 않게)
function load(files) {
  state.files = files;
  state.assignment = {};
  optionalForm.reset();
  syncOptionalBadge();
  resetSlotState();
  const ok = refresh();
  say(ok ? announce() : `오류 ${state.analysis.errors.length}건이 있습니다. 오류 내용을 확인하세요.`);
}

async function onFiles(fileList) {
  const picked = [...fileList];
  if (!picked.length) return;
  const files = await Promise.all(picked.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  load(files);
}

// 결과 화면 → 저장 화면 (FR-M5-08). 패널·결과는 숨기기만 하고 상태는 그대로 둔다. 내려받기는 하지 않는다
function goSave() {
  if (!state.analysis?.result) return;
  state.screen = 'save';
  $('app').hidden = true;
  $('saveScreen').hidden = false;
  syncSaveBtn();
  syncSaveBlock();
  syncOptionalBadge();
  window.scrollTo(0, 0);
  $('saveTitle').focus();
  say(
    receiptForm.problem()
      ? 'Excel 저장 화면입니다. CSV 1행의 접수번호를 확실히 나눌 수 없어 확인이 필요합니다.'
      : 'Excel 저장 화면입니다. 일반사항 값은 모두 선택이며 비워도 저장할 수 있습니다.',
  );
}

// 저장 화면 → 결과 화면. 입력값은 남고, 초점은 「Excel 만들고 저장」 버튼으로 간다
function goBack() {
  state.screen = 'result';
  $('saveScreen').hidden = true;
  $('app').hidden = false;
  setMsg('', '');
  syncSaveBtn();
  $('saveBtn').focus();
  say('결과 화면으로 돌아왔습니다.');
}

// 저장 위치와 파일 이름을 고르게 한 뒤 Excel을 만들어 쓴다 (PR #22). 고르는 창이 없는 브라우저는 안내만 한다
async function save() {
  if (excelSaving || watchBlock || !state.analysis?.result || !inputsValid()) {
    syncSaveBlock();
    return;
  }
  if (!state.template) {
    setMsg('needTemplate', 'err', NEED_TEMPLATE);
    $('templateInput').focus();
    return;
  }
  if (!window.showSaveFilePicker) {
    setMsg('failed', 'err', '저장 위치를 선택하려면 Edge 또는 Chrome에서 열어 주세요.');
    return;
  }
  const { summaries } = state.analysis;
  const result = confirmedResult();
  const template = state.template.bytes;
  const values = optionalForm.values();
  excelSaving = true;
  syncSaveBtn();
  let writer;
  try {
    const target = await window.showSaveFilePicker({
      suggestedName: safeDownloadName(outputFileName(result)), // 접수번호_유속계.xlsx. 길이 상한·방향 제어 문자 제거 (보안 L2)
      types: [{ description: 'Excel 통합 문서', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      excludeAcceptAllOption: true,
    });
    setMsg('saving', '', 'Excel을 만드는 중입니다…');
    const t0 = performance.now();
    const { bytes } = await buildXlsx(template, result, summaries, values);
    document.body.dataset.excelMs = String(Math.round(performance.now() - t0)); // 성능 시험용 (화면에는 보이지 않음)
    writer = await target.createWritable();
    await writer.write(bytes);
    await writer.close();
    writer = null;
    setMsg('saved', 'ok', `저장했습니다: ${target.name}`);
    $('saveName').textContent = target.name;
    say('Excel을 저장했습니다.');
    folderWatch.notifySaved(); // 다음 기기가 기다리고 있으면 넘어간다 (#23 B안)
  } catch (error) {
    if (writer) await writer.abort().catch(() => {});
    if (error.name === 'AbortError') setMsg('cancelled', '', 'Excel 저장을 취소했습니다.');
    else {
      console.error(error); // 원문은 개발자 도구에만 남긴다 (라이브러리 오류는 영문일 수 있음)
      setMsg('failed', 'err', 'Excel을 저장하지 못했습니다. 파일과 폴더 권한을 확인해 주세요.');
    }
  } finally {
    excelSaving = false;
    syncSaveBtn();
    // 저장 중에 버튼이 꺼지면 초점이 사라지므로 되돌려 준다. 그 사이 사용자가 다른 곳으로 옮겼으면 빼앗지 않는다 (접근성 A4)
    if (!$('saveBtn').disabled && document.activeElement === document.body) $('saveBtn').focus();
  }
}

// 이벤트 연결
const drop = $('drop');
$('fileInput').addEventListener('change', (e) => {
  onFiles(e.target.files);
  e.target.value = '';
});
$('templateInput').addEventListener('change', async (e) => {
  await onTemplate(e.target.files[0]);
  e.target.value = '';
});
for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
}
for (const type of ['dragleave', 'drop']) drop.addEventListener(type, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  onFiles(e.dataTransfer.files);
});
// 칸 밖에 놓은 파일을 브라우저가 열어 버리지 않게 막는다
for (const type of ['dragover', 'drop']) window.addEventListener(type, (e) => e.preventDefault());

$('saveBtn').addEventListener('click', () => (state.screen === 'save' ? save : goSave)());
$('backBtn').addEventListener('click', goBack);

// 모달 세 개 (주요 셀 버튼은 결과 화면과 저장 화면에 하나씩 있고 같은 모달을 연다). 열 때 현재 결과(주요 셀은 현재 선택 입력값)로 본문을 그린다
const modals = {
  graph: createModal({ id: 'graphModal', title: '설치 방향 및 민감도 그래프, 시험 환경 조건', render: (body) => renderGraphEnv(body, state.analysis) }),
  rows: createModal({ id: 'rowsModal', title: '계산에 쓴 행', render: (body) => renderUsedRows(body, state.analysis) }),
  cells: createModal({
    id: 'cellsModal',
    title: 'CLAYDOX가 가져갈 주요 셀',
    render: (body) => {
      const table = h('div');
      body.append(table);
      renderMapPreview(table, { ...state.analysis, result: confirmedResult() }, optionalForm.values());
    },
  }),
};
for (const area of [$('resultBody'), $('saveScreen')]) {
  area.addEventListener('click', (e) => {
    const button = e.target.closest('[data-modal]');
    if (button) modals[button.dataset.modal].open(button);
  });
}

// 1100px 이하에서는 결과가 위, 「넣은 파일」 패널이 아래로 쌓인다. Tab·화면낭독 순서가 화면 순서와 같도록 DOM 순서도 함께 옮긴다 (UIPRO UP-1)
const narrow = matchMedia('(max-width: 1100px)');
function placeRail() {
  const [rail, results] = [document.querySelector('.rail'), $('results')];
  const railFirst = Boolean(rail.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (railFirst !== narrow.matches) return; // 이미 맞는 순서
  const focused = rail.contains(document.activeElement) ? document.activeElement : null;
  if (narrow.matches) results.after(rail);
  else results.before(rail);
  focused?.focus(); // 옮기면 초점이 빠지므로 되돌린다
}
narrow.addEventListener('change', placeRail);
placeRail();

// 폴더 감시 (#23). 다른 기기는 지금 결과를 저장할 때까지 기다리고, 넘어갈 때는 저장 화면에서 결과 화면으로 돌아간다
const folderWatch = createFolderWatch({
  analyze,
  load: (files) => {
    if (state.screen === 'save') goBack();
    load(files);
  },
  isSaving: () => excelSaving,
  getFiles: () => state.files,
  hasResult: () => Boolean(state.analysis?.result),
  currentDevice: () => state.analysis?.result?.equipment.serial || '?',
  onBlock: (reason) => {
    if (reason === watchBlock) return;
    watchBlock = reason;
    syncSaveBtn();
    syncSaveBlock();
  },
});

refresh();
restoreTemplate();
document.body.dataset.ready = 'true';
