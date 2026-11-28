// 장비 출력 폴더를 1초마다 살펴 바뀐 CSV를 기기별로 묶는다. 첫 6개는 「반영」, 같은 기기 재측정은 「교체할까요?」, 다른 기기는 지금 기기를 저장한 뒤 넘어간다 (PR #22 · #23)
import { planFolder, touchesCurrent } from '../core/batch.js';

const $ = (id) => document.getElementById(id);
const SLOT_NAMES = { rep_summary: '반복성 요약', rep_source: '반복성 source', lin_summary: '직선성 요약', lin_source: '직선성 source', sen_summary: '민감도 요약', sen_source: '민감도 source' };
const STABLE_MS = 3000; // 파일 쓰기가 끝났다고 볼 때까지 그대로 있어야 하는 시간
const HOLD_TEXT = '폴더에 같은 기기의 새 CSV가 들어와 확인하는 중입니다. 잠시 뒤 다시 저장하세요.'; // 안정화 동안 저장 보류 (PR #28 리뷰)
const RETRY_ERRORS = ['NotReadableError', 'NotFoundError']; // 장비가 쓰는 중이거나 지운 파일. 다음 검사에서 다시 본다

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

// 누른 버튼이 숨을 때 초점을 옮긴다. 저장 버튼이 꺼져 있으면 focus()가 듣지 않으므로 본문(main, tabindex=-1)으로
export function focusAfter() {
  const btn = $('saveBtn');
  (btn.disabled ? $('main') : btn).focus();
}

// 같은 글을 다시 쓰면 role=status가 다시 읽으므로, 바뀔 때만 쓴다
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

const deviceText = (n) => (n.unknown ? `기기 번호를 읽을 수 없음 · 접수번호 ${n.receipt_no || '?'}` : `기기 번호 ${n.serial} · 접수번호 ${n.receipt_no}`);

// analyze · isSaving: 화면 함수, load(files, note): 묶음을 화면에 넣는다, getFiles(): 지금 화면의 CSV, hasResult(): 지금 결과가 있는지,
// getSlots(): 지금 칸 배정 { 칸 id: 파일 번호 }, currentDevice(): 지금 기기 번호, onBlock(이유 | null): 교체를 정하기 전 저장을 막는다, say(글): 화면 낭독.
// 반환: { notifySaved(files) } — 저장을 마치면 저장을 시작할 때의 파일 목록으로 부른다
export function createFolderWatch({ analyze, load, isSaving, getFiles, getSlots, hasResult, currentDevice, onBlock, say }) {
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

  // 1초마다 render가 pending을 새로 만들므로, 같은 선택인지는 종류와 파일 이름으로 본다
  const samePending = (a, b) => Boolean(a && b) && a.kind === b.kind && a.names.join('|') === b.names.join('|');
  const replan = (session) => {
    session.plan = planFolder({ current: getFiles(), incoming: session.batch, currentSlots: getSlots() });
    session.planFiles = getFiles();
    session.validCache = new Map();
  };

  const changedFiles = (session, files) => [...files.values()].filter((file) => fileStamp(file) !== fileStamp(session.baseline.get(file.name)));

  function showBanner(text, { replace = false, keep = replace, next = false } = {}) {
    const fresh = text && text !== bannerText.textContent;
    banner.hidden = !text;
    setText(bannerText, text);
    btnReplace.hidden = !replace;
    btnKeep.hidden = !keep;
    btnNext.hidden = !next;
    if (fresh) say(text); // 숨어 있던 띠가 나타날 때는 라이브 영역이 첫 글을 못 읽을 수 있어 낭독으로도 알린다
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

  // 파일 이름들을 기준에 넣는다 (다시 「바뀐 파일」로 잡지 않게)
  function settle(session, names) {
    for (const name of names) if (session.incoming.has(name)) session.baseline.set(name, session.incoming.get(name));
  }

  // 묶음을 화면에 넣고, 그 파일들과 같은 칸에서 진 파일을 기준에 넣는다
  // afterSave: 지금 기기를 저장한 뒤 자동으로 넘어가는 경우 (저장 안내를 남길지 화면이 정한다)
  function take(session, pending, note, { afterSave = false } = {}) {
    settle(session, [...pending.names, ...pending.superseded]);
    session.savedFiles = null;
    clearPending(session);
    session.plan = null;
    session.signature = '';
    session.note = note;
    setText(folderStatus, note);
    load(pending.batch.map(({ name, bytes }) => ({ name, bytes })), note, { afterSave });
  }

  // 같은 묶음의 검증 결과는 바뀌지 않으므로 계획마다 한 번만 계산한다
  function valid(session, batch) {
    const key = batch.map((f) => f.name).join('\n');
    if (!session.validCache.has(key)) session.validCache.set(key, Boolean(analyze(batch, { assignment: {} }).result));
    return session.validCache.get(key);
  }

  function render(session) {
    const { plan } = session;
    if (plan.unchanged.length) settle(session, plan.unchanged); // 지금 화면과 같은 파일은 묻지 않고 기준에 넣는다
    const empties = session.empties.length ? ` 빈 CSV ${session.empties.length}개는 뺐습니다.` : '';
    const ignoredNote = `${plan.ignored.length ? ` CSV ${plan.ignored.length}개는 종류를 판별할 수 없어 뺐습니다.` : ''}${empties}`;
    // 1) 같은 기기 재측정 → 교체를 묻고, 정하기 전에는 저장을 막는다. 아직 짝이 덜 와서 검증을 못 통과해도 막는다
    if (plan.replace) {
      const what = plan.replace.slots.map((s) => SLOT_NAMES[s.slot]).join(' · ');
      const times = [...new Set(plan.replace.slots.map((s) => (s.oldTime ? `${s.oldTime} → ${s.newTime}` : `새 칸 ${s.newTime}`)))].join(', ');
      const verb = plan.replace.slots.every((s) => !s.oldTime) ? '들어왔습니다' : '다시 저장됐습니다';
      const names = plan.replace.slots.map((s) => s.name);
      folderApply.hidden = true;
      const head = `기기 번호 ${plan.replace.serial}의 ${what}가 ${verb} (교정 ${times}).`;
      if (valid(session, plan.replace.batch)) {
        session.pending = { kind: 'replace', batch: plan.replace.batch, names, superseded: plan.replace.superseded };
        showBanner(`${head} 교체할까요?`, { replace: true });
      } else {
        session.pending = { kind: 'replace-wait', batch: null, names, superseded: plan.replace.superseded };
        showBanner(`${head} 아직 짝이 맞는 CSV가 다 오지 않아 검증을 통과하지 못했습니다. 기다리거나 지금 결과를 그대로 두세요.`, { keep: true });
      }
      onBlock('재측정한 CSV가 들어왔습니다. 위 띠에서 교체할지 정하면 저장할 수 있습니다.');
      setText(folderStatus, `장비 폴더 감시 중 · 다시 저장된 CSV ${names.length}개${ignoredNote}`);
      return;
    }
    onBlock(null);
    const waiting = plan.next.find((n) => n.ready && valid(session, n.batch)) ?? plan.next[0];
    const ready = Boolean(waiting?.ready && valid(session, waiting.batch));
    const pendingOf = (kind) => ({ kind, batch: waiting.batch, names: waiting.batch.map((f) => f.name), superseded: waiting.superseded });
    // 2) 지금 결과가 없으면(처음) 준비된 첫 기기를 「반영」으로 넣는다
    if (!hasResult()) {
      showBanner('');
      session.pending = ready ? pendingOf('first') : null;
      folderApply.hidden = !ready;
      setText(
        folderStatus,
        ready
          ? `새 검사 데이터 6개가 준비됐습니다. 반영을 누르면 결과를 갱신합니다. 파일: ${session.pending.names.join(', ')}${ignoredNote}`
          : waiting?.ready
            ? `CSV 6개가 모였지만 검증을 통과하지 못했습니다. 넣은 파일을 확인하세요.${ignoredNote}`
            : `장비 폴더 감시 중 · 새로 저장되거나 변경된 CSV ${waiting ? waiting.count : 0}/6개${ignoredNote}`,
      );
      return;
    }
    // 3) 지금 결과가 있으면 다른 기기는 기다린다. 지금 기기를 저장했으면 준비되는 대로 넘어간다 (B안)
    folderApply.hidden = true;
    if (!waiting) {
      session.pending = null;
      showBanner('');
      setText(folderStatus, session.note || `장비 폴더 감시 중${ignoredNote}`);
      return;
    }
    session.pending = ready ? pendingOf('next') : null;
    session.autoNext = ready && Boolean(session.savedFiles) && session.savedFiles === getFiles(); // 다음 검사에서 다시 확인하고 넘어간다
    const now = `지금 화면은 기기 번호 ${currentDevice()} 결과입니다.`;
    showBanner(
      ready
        ? `다음 기기(${deviceText(waiting)}) CSV 6개가 준비됐습니다. ${now} 저장하면 다음 기기로 넘어갑니다.`
        : waiting.ready
          ? `다음 기기(${deviceText(waiting)}) CSV 6개가 모였지만 검증을 통과하지 못했습니다. 그 CSV를 확인하세요. ${now}`
          : `다음 기기(${deviceText(waiting)}) CSV ${waiting.count}/6개 대기 중. ${now}`,
      { next: ready },
    );
    setText(folderStatus, `장비 폴더 감시 중 · 다음 기기 CSV ${waiting.count}/6개${ignoredNote}`);
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
        session.holdChecked = false; // 바뀐 파일이 달라졌으니 보류할지 다시 본다
      }
      // 손으로 CSV를 넣어 지금 화면의 파일이 바뀌었으면 계획을 다시 세운다
      if (session.plan && session.planFiles !== getFiles()) replan(session);
      const nonEmpty = changed.filter((f) => f.size > 0); // 빈 CSV 하나 때문에 감시 전체가 멈추지 않게 뺀다
      if (!changed.length) {
        if (session.pending || session.holding) clearPending(session);
        session.holding = false;
        setText(folderStatus, session.note || '장비 폴더 감시 중 · 새로 저장되거나 변경된 CSV 0/6개');
      } else if (!session.plan && performance.now() - session.stableSince >= STABLE_MS) {
        session.holding = false; // 확인이 끝났다. 아래 render가 교체 묻기(막음) 또는 해제로 바꾼다
        const batch = await Promise.all(nonEmpty.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), lastModified: file.lastModified })));
        if (watchSession !== session) return;
        session.incoming = new Map(changed.map((f) => [f.name, f]));
        session.empties = changed.filter((f) => f.size === 0).map((f) => f.name);
        session.batch = batch;
        replan(session);
        session.note = '';
        render(session);
      } else if (session.plan) {
        render(session); // 저장 · 손으로 넣기 같은 화면 변화에 맞춰 띠를 다시 그린다
      } else {
        // 3초 안정화를 기다리는 동안: 지금 기기의 파일(또는 아직 머리글을 못 읽는 파일)이 있으면 확인이 끝날 때까지 저장을 보류한다
        if (!session.holdChecked) {
          const peek = await Promise.all(changed.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
          if (watchSession !== session) return;
          session.holdChecked = true;
          session.holding = hasResult() && touchesCurrent(getFiles(), peek);
          if (session.holding) {
            onBlock(HOLD_TEXT);
            if (!session.pending) showBanner('같은 기기의 새 CSV를 확인하는 중입니다. 확인이 끝날 때까지 저장을 잠시 막습니다.');
          }
        }
        setText(folderStatus, `장비 폴더 감시 중 · 새로 저장되거나 변경된 CSV ${changed.length}개 확인 중`);
      }
      if (session.autoNext && session.pending?.kind === 'next' && !isSaving()) {
        session.autoNext = false;
        const pending = session.pending;
        const same = await stillSame(session, pending.names);
        const stillSaved = session.savedFiles && session.savedFiles === getFiles() && session.planFiles === getFiles();
        if (watchSession === session && same && stillSaved && !isSaving() && samePending(session.pending, pending)) {
          take(session, session.pending, '다음 기기 결과를 불러왔습니다. 같은 폴더에서 다음 CSV를 기다립니다.', { afterSave: true });
        }
      }
    } catch (error) {
      if (watchSession !== session) return;
      if (!RETRY_ERRORS.includes(error.name)) {
        stopFolderWatch();
        setText(folderStatus, '폴더를 읽을 수 없습니다. 폴더 접근 권한을 확인하고 다시 선택해 주세요.');
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
      watchSession = {
        directory,
        baseline,
        incoming: new Map(),
        holding: false,
        holdChecked: false,
        batch: [],
        empties: [],
        signature: '',
        stableSince: performance.now(),
        plan: null,
        planFiles: null,
        validCache: new Map(),
        pending: null,
        note: '',
        savedFiles: null,
        autoNext: false,
      };
      folderStop.disabled = false;
      scanFolder(watchSession);
    } catch (error) {
      stopFolderWatch();
      setText(folderStatus, error.name === 'AbortError' ? '폴더 선택을 취소했습니다.' : '폴더를 열 수 없습니다. Edge 또는 Chrome에서 폴더 접근을 허용해 주세요.');
    }
  });

  // 「반영」(처음) · 「교체」 · 「저장하지 않고 다음 기기로」는 같은 길을 쓴다
  async function apply(kind, note) {
    const session = watchSession;
    const pending = session?.pending;
    if (!pending || pending.kind !== kind || isSaving()) return;
    for (const b of [folderApply, btnReplace, btnNext]) b.disabled = true;
    let same = false;
    try {
      same = await stillSame(session, pending.names);
    } catch (error) {
      if (!RETRY_ERRORS.includes(error.name)) {
        stopFolderWatch();
        setText(folderStatus, '폴더를 읽을 수 없습니다. 접근 권한을 확인하고 다시 선택해 주세요.');
        return;
      }
    } finally {
      for (const b of [folderApply, btnReplace, btnNext]) b.disabled = false;
    }
    // 폴더를 다시 읽는 사이 저장이 시작됐거나 감시를 멈췄거나 계획이 바뀌었으면 넣지 않는다
    if (watchSession !== session || isSaving() || !samePending(session.pending, pending)) return;
    // 계획을 세운 뒤 손으로 CSV를 넣었으면 그 파일을 덮어쓰지 않도록 다시 계획한다
    if (!same || session.planFiles !== getFiles()) {
      clearPending(session);
      session.plan = null;
      session.signature = '';
      const msg = !same ? '파일이 다시 바뀌어 다시 확인합니다.' : '화면의 CSV가 바뀌어 다시 확인합니다.';
      setText(folderStatus, msg);
      say(msg);
      return;
    }
    take(session, session.pending, note);
  }

  folderApply.addEventListener('click', () => apply('first', '새 검사 결과를 반영했습니다. 같은 폴더에서 다음 CSV 6개를 기다립니다.'));
  btnReplace.addEventListener('click', () => apply('replace', '다시 저장된 CSV로 교체해 다시 계산했습니다.'));
  btnNext.addEventListener('click', () => apply('next', '지금 결과를 저장하지 않고 다음 기기로 넘어갔습니다.'));
  btnKeep.addEventListener('click', () => {
    const session = watchSession;
    if (!session || !['replace', 'replace-wait'].includes(session.pending?.kind)) return;
    settle(session, [...session.pending.names, ...session.pending.superseded]); // 다시 묻지 않는다
    clearPending(session);
    session.plan = null;
    session.signature = '';
    session.note = '다시 저장된 CSV를 쓰지 않고 지금 결과를 그대로 둡니다.';
    setText(folderStatus, session.note);
    say(session.note);
    focusAfter(); // 누른 버튼이 숨으므로
  });

  folderStop.addEventListener('click', () => {
    stopFolderWatch();
    setText(folderStatus, '장비 폴더 감시를 중지했습니다.');
  });

  if (typeof window.showDirectoryPicker !== 'function') {
    folderStart.disabled = true;
    setText(folderStatus, '장비 폴더 감시는 Windows의 Edge 또는 Chrome에서 사용해 주세요.');
  }

  return {
    // files: 저장을 시작할 때 화면에 있던 CSV. 저장하는 사이 화면이 바뀌었으면 「저장함」으로 치지 않는다
    notifySaved(files) {
      if (!watchSession || files !== getFiles()) return;
      watchSession.savedFiles = files;
      if (watchSession.plan) render(watchSession);
    },
  };
}
