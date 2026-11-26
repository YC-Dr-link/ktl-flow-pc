// 장비 출력 폴더를 1초마다 살펴 바뀐 CSV를 기기별로 묶는다. 첫 6개는 「반영」, 같은 기기 재측정은 「교체할까요?」, 다른 기기는 지금 기기를 저장한 뒤 넘어간다 (PR #22 · #23)
import { planFolder } from '../core/batch.js';

const $ = (id) => document.getElementById(id);
const SLOT_NAMES = { rep_summary: '반복성 요약', rep_source: '반복성 source', lin_summary: '직선성 요약', lin_source: '직선성 source', sen_summary: '민감도 요약', sen_source: '민감도 source' };
const STABLE_MS = 3000; // 파일 쓰기가 끝났다고 볼 때까지 그대로 있어야 하는 시간

async function readCsvFolder(directory) {
  const files = new Map();
  for await (const [name, entry] of directory.entries()) {
    if (entry.kind === 'file' && /\.csv$/i.test(name)) {
      try {
        files.set(name, await entry.getFile());
      } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
      }
    }
  }
  return files;
}

function fileStamp(file) {
  return file ? JSON.stringify([file.name, file.size, file.lastModified]) : '';
}

const deviceText = (n) => `기기 번호 ${n.serial || '?'} · 접수번호 ${n.receipt_no || '?'}`;

// analyze · load · isSaving: 화면 함수, getFiles(): 지금 화면의 CSV, hasResult(): 지금 결과가 있는지, currentDevice(): 지금 기기 번호,
// onBlock(이유 | null): 교체를 묻는 동안 저장을 막는다. 반환: { notifySaved() } — 저장을 마치면 부른다
export function createFolderWatch({ analyze, load, isSaving, getFiles, hasResult, currentDevice, onBlock }) {
  const folderStart = $('csvFolderStart');
  const folderStop = $('csvFolderStop');
  const folderStatus = $('csvFolderStatus');
  const folderApply = $('csvFolderApply');
  const banner = $('watchBanner');
  const bannerText = $('watchText');
  const btnReplace = $('watchReplace');
  const btnKeep = $('watchKeep');
  const btnNext = $('watchNext');
  let watchSession = null;

  const changedFiles = (session, files) => [...files.values()].filter((file) => fileStamp(file) !== fileStamp(session.baseline.get(file.name)));

  function showBanner(text, { replace = false, next = false } = {}) {
    banner.hidden = !text;
    bannerText.textContent = text;
    btnReplace.hidden = !replace;
    btnKeep.hidden = !replace;
    btnNext.hidden = !next;
  }

  function clearPending(session) {
    session.pending = null;
    folderApply.hidden = true;
    showBanner('');
    onBlock(null);
  }

  function stopFolderWatch() {
    if (watchSession) clearTimeout(watchSession.timer);
    watchSession = null;
    folderStart.disabled = false;
    folderStop.disabled = true;
    folderApply.hidden = true;
    showBanner('');
    onBlock(null);
  }

  // 반영 · 교체 직전에 폴더를 다시 읽어, 고른 파일이 그사이 또 바뀌지 않았는지 본다
  async function stillSame(session, names) {
    const latest = await readCsvFolder(session.directory);
    return names.every((name) => fileStamp(latest.get(name)) === fileStamp(session.incoming.get(name)));
  }

  // 묶음을 화면에 넣고, 그 파일들을 기준에 넣는다
  function take(session, batch, note) {
    for (const f of batch) if (session.incoming.has(f.name)) session.baseline.set(f.name, session.incoming.get(f.name));
    session.savedFiles = null;
    clearPending(session);
    load(batch.map(({ name, bytes }) => ({ name, bytes })));
    session.note = note;
    folderStatus.textContent = note;
    session.signature = '';
  }

  function render(session) {
    const { plan } = session;
    const hasNow = hasResult();
    const ignoredNote = plan.ignored.length ? ` CSV ${plan.ignored.length}개는 종류를 판별할 수 없어 뺐습니다.` : '';
    const waiting = plan.next[0];
    // 1) 같은 기기 재측정 → 교체를 묻고, 답하기 전에는 저장을 막는다
    if (plan.replace && analyze(plan.replace.batch, { assignment: {} }).result) {
      const what = plan.replace.slots.map((s) => SLOT_NAMES[s.slot]).join(' · ');
      const times = [...new Set(plan.replace.slots.map((s) => `${s.oldTime} → ${s.newTime}`))].join(', ');
      session.pending = { kind: 'replace', batch: plan.replace.batch, names: plan.replace.slots.map((s) => s.name) };
      folderApply.hidden = true;
      showBanner(`${what}가 다시 저장됐습니다 (교정 ${times}). 교체할까요?`, { replace: true });
      onBlock('재측정한 CSV가 들어왔습니다. 위 띠에서 교체할지 정하면 저장할 수 있습니다.');
      folderStatus.textContent = `장비 폴더 감시 중 · 다시 저장된 CSV ${plan.replace.slots.length}개${ignoredNote}`;
      return;
    }
    onBlock(null);
    // 2) 지금 결과가 없으면(처음) 준비된 첫 기기를 「반영」으로 넣는다
    if (!hasNow) {
      const ready = plan.next.find((n) => n.ready && analyze(n.batch, { assignment: {} }).result);
      showBanner('');
      if (ready) {
        session.pending = { kind: 'first', batch: ready.batch, names: ready.batch.map((f) => f.name) };
        folderApply.hidden = false;
        folderStatus.textContent = `새 검사 데이터 6개가 준비됐습니다. 반영을 누르면 결과를 갱신합니다. 파일: ${ready.batch.map((f) => f.name).join(', ')}${ignoredNote}`;
      } else {
        session.pending = null;
        folderApply.hidden = true;
        folderStatus.textContent = `장비 폴더 감시 중 · 새로 저장되거나 변경된 CSV ${waiting ? waiting.count : 0}/6개${ignoredNote}`;
      }
      return;
    }
    // 3) 지금 결과가 있으면 다른 기기는 기다린다. 지금 기기를 저장했으면 준비되는 대로 넘어간다 (B안)
    folderApply.hidden = true;
    if (!waiting) {
      session.pending = null;
      showBanner('');
      folderStatus.textContent = session.note || `장비 폴더 감시 중${ignoredNote}`;
      return;
    }
    const nextOk = waiting.ready && analyze(waiting.batch, { assignment: {} }).result;
    session.pending = nextOk ? { kind: 'next', batch: waiting.batch, names: waiting.batch.map((f) => f.name), device: waiting } : null;
    const saved = session.savedFiles && session.savedFiles === getFiles();
    if (nextOk && saved) {
      session.autoNext = true; // 다음 검사에서 다시 확인하고 넘어간다
    }
    const now = currentDevice();
    showBanner(
      nextOk
        ? `다음 기기(${deviceText(waiting)}) CSV 6개가 준비됐습니다. 지금 화면은 기기 번호 ${now} 결과입니다. 저장하면 다음 기기로 넘어갑니다.`
        : `다음 기기(${deviceText(waiting)}) CSV ${waiting.count}/6개 대기 중. 지금 화면은 기기 번호 ${now} 결과입니다.`,
      { next: Boolean(nextOk) },
    );
    folderStatus.textContent = `장비 폴더 감시 중 · 다음 기기 CSV ${waiting.count}/6개${ignoredNote}`;
  }

  async function scanFolder(session) {
    try {
      const files = await readCsvFolder(session.directory);
      if (watchSession !== session) return;
      const changed = changedFiles(session, files);
      const signature = JSON.stringify(changed.map(fileStamp).sort());
      if (signature !== session.signature) {
        session.signature = signature;
        session.stableSince = performance.now();
        session.plan = null;
      }
      if (!changed.length) {
        if (session.pending) clearPending(session);
        folderStatus.textContent = session.note || '장비 폴더 감시 중 · 새로 저장되거나 변경된 CSV 0/6개';
      } else if (!session.plan && changed.every((f) => f.size > 0) && performance.now() - session.stableSince >= STABLE_MS) {
        const batch = await Promise.all(changed.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), lastModified: file.lastModified })));
        if (watchSession !== session) return;
        session.incoming = new Map(changed.map((f) => [f.name, f]));
        session.plan = planFolder({ current: getFiles(), incoming: batch });
        session.note = '';
        render(session);
      } else if (session.plan) {
        render(session); // 저장 · 다른 화면 변화에 맞춰 띠를 다시 그린다
      } else {
        folderStatus.textContent = `장비 폴더 감시 중 · 새로 저장되거나 변경된 CSV ${changed.length}개 확인 중`;
      }
      if (session.autoNext && session.pending?.kind === 'next' && !isSaving()) {
        session.autoNext = false;
        if (await stillSame(session, session.pending.names)) take(session, session.pending.batch, '다음 기기 결과를 불러왔습니다. 같은 폴더에서 다음 CSV를 기다립니다.');
      }
    } catch (error) {
      if (watchSession !== session) return;
      if (error.name !== 'NotReadableError' && error.name !== 'NotFoundError') {
        stopFolderWatch();
        folderStatus.textContent = '폴더를 읽을 수 없습니다. 폴더 접근 권한을 확인하고 다시 선택해 주세요.';
        return;
      }
      session.stableSince = performance.now();
    }
    if (watchSession === session) session.timer = setTimeout(() => scanFolder(session), 1000);
  }

  folderStart.addEventListener('click', async () => {
    folderStart.disabled = true;
    try {
      const directory = await window.showDirectoryPicker({ mode: 'read' });
      const baseline = await readCsvFolder(directory);
      watchSession = { directory, baseline, incoming: new Map(), signature: '', stableSince: performance.now(), plan: null, pending: null, note: '', savedFiles: null, autoNext: false };
      folderStop.disabled = false;
      scanFolder(watchSession);
    } catch (error) {
      stopFolderWatch();
      folderStatus.textContent =
        error.name === 'AbortError' ? '폴더 선택을 취소했습니다.' : '폴더를 열 수 없습니다. Edge 또는 Chrome에서 폴더 접근을 허용해 주세요.';
    }
  });

  // 「반영」(처음) · 「교체」 · 「저장하지 않고 다음 기기로」는 같은 길을 쓴다
  async function apply(kind, note) {
    const session = watchSession;
    const pending = session?.pending;
    if (!pending || pending.kind !== kind || isSaving()) return;
    for (const b of [folderApply, btnReplace, btnNext]) b.disabled = true;
    try {
      const same = await stillSame(session, pending.names);
      if (watchSession !== session) return;
      if (!same) {
        clearPending(session);
        session.plan = null;
        session.signature = '';
        return;
      }
    } catch {
      stopFolderWatch();
      folderStatus.textContent = '폴더를 읽을 수 없습니다. 접근 권한을 확인하고 다시 선택해 주세요.';
      return;
    } finally {
      for (const b of [folderApply, btnReplace, btnNext]) b.disabled = false;
    }
    take(session, pending.batch, note);
  }

  folderApply.addEventListener('click', () => apply('first', '새 검사 결과를 반영했습니다. 같은 폴더에서 다음 CSV 6개를 기다립니다.'));
  btnReplace.addEventListener('click', () => apply('replace', '다시 저장된 CSV로 교체해 다시 계산했습니다.'));
  btnNext.addEventListener('click', () => apply('next', '지금 결과를 저장하지 않고 다음 기기로 넘어갔습니다.'));
  btnKeep.addEventListener('click', () => {
    const session = watchSession;
    if (!session || session.pending?.kind !== 'replace') return;
    for (const name of session.pending.names) session.baseline.set(name, session.incoming.get(name)); // 다시 묻지 않는다
    clearPending(session);
    session.plan = null;
    session.signature = '';
    session.note = '다시 저장된 CSV를 쓰지 않고 지금 결과를 그대로 둡니다.';
    folderStatus.textContent = session.note;
  });

  folderStop.addEventListener('click', () => {
    stopFolderWatch();
    folderStatus.textContent = '장비 폴더 감시를 중지했습니다.';
  });

  if (typeof window.showDirectoryPicker !== 'function') {
    folderStart.disabled = true;
    folderStatus.textContent = '장비 폴더 감시는 Windows의 Edge 또는 Chrome에서 사용해 주세요.';
  }

  return {
    // 지금 화면의 결과를 저장했다. 다음 기기가 준비돼 있으면 다음 검사 때 넘어간다
    notifySaved() {
      if (!watchSession) return;
      watchSession.savedFiles = getFiles();
      if (watchSession.plan) render(watchSession);
      if (watchSession.pending?.kind === 'next') watchSession.autoNext = true;
      else if (watchSession.plan?.next.length) watchSession.note = '저장했습니다. 다음 기기 CSV를 기다립니다.';
    },
  };
}
