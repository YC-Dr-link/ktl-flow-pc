// 장비 출력 폴더를 1초마다 살펴, 새로 저장되거나 바뀐 CSV 6개가 검증을 통과하면 「반영」 버튼을 띄운다 (PR #22 영진 님 작업을 원본으로 옮김)
const $ = (id) => document.getElementById(id);

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

// analyze: CSV 묶음을 검사하는 함수, load: 묶음을 화면에 넣는 함수, isSaving: Excel 저장 중인지
export function createFolderWatch({ analyze, load, isSaving }) {
  const folderStart = $('csvFolderStart');
  const folderStop = $('csvFolderStop');
  const folderStatus = $('csvFolderStatus');
  const folderApply = $('csvFolderApply');
  let watchSession = null;

  const changedFiles = (session, files) => [...files.values()].filter((file) => fileStamp(file) !== fileStamp(session.baseline.get(file.name)));

  function stopFolderWatch() {
    if (watchSession) clearTimeout(watchSession.timer);
    watchSession = null;
    folderStart.disabled = false;
    folderStop.disabled = true;
    folderApply.hidden = true;
  }

  async function scanFolder(session) {
    try {
      const files = await readCsvFolder(session.directory);
      if (watchSession !== session) return;
      const incoming = changedFiles(session, files);
      const signature = JSON.stringify(incoming.map(fileStamp).sort());
      if (signature !== session.signature) {
        session.signature = signature;
        session.stableSince = performance.now();
      }
      folderStatus.textContent =
        incoming.length > 6
          ? '변경된 CSV가 6개보다 많습니다. 한 검사분만 구분해서 직접 넣어 주세요.'
          : `장비 폴더 감시 중 · 새로 저장되거나 변경된 CSV ${incoming.length}/6개`;
      if (incoming.length === 6 && incoming.every((file) => file.size > 0) && performance.now() - session.stableSince >= 3000) {
        const batch = await Promise.all(incoming.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
        const latest = await readCsvFolder(session.directory);
        if (watchSession !== session) return;
        const latestSignature = JSON.stringify(changedFiles(session, latest).map(fileStamp).sort());
        if (signature === latestSignature && analyze(batch, { assignment: {} }).result) {
          session.pending = { batch, files: incoming };
          folderApply.hidden = false;
          folderStatus.textContent = `새 검사 데이터 6개가 준비됐습니다. 반영을 누르면 결과를 갱신합니다. 파일: ${batch.map((file) => file.name).join(', ')}`;
          return;
        }
        folderStatus.textContent = 'CSV 6개를 찾았습니다. 저장이 끝나고 기존 검사 도구의 검증을 통과할 때까지 기다립니다.';
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
      watchSession = { directory, baseline, signature: '', stableSince: performance.now() };
      folderStop.disabled = false;
      scanFolder(watchSession);
    } catch (error) {
      stopFolderWatch();
      folderStatus.textContent =
        error.name === 'AbortError' ? '폴더 선택을 취소했습니다.' : '폴더를 열 수 없습니다. Edge 또는 Chrome에서 폴더 접근을 허용해 주세요.';
    }
  });

  folderApply.addEventListener('click', async () => {
    const session = watchSession;
    const pending = session?.pending;
    if (!pending || isSaving()) return;
    folderApply.disabled = true;
    try {
      const current = await readCsvFolder(session.directory);
      if (watchSession !== session) return;
      const changed = changedFiles(session, current);
      if (JSON.stringify(changed.map(fileStamp).sort()) !== JSON.stringify(pending.files.map(fileStamp).sort())) {
        session.pending = null;
        folderApply.hidden = true;
        session.signature = '';
        scanFolder(session);
        return;
      }
      if (isSaving()) return;
    } catch {
      stopFolderWatch();
      folderStatus.textContent = '폴더를 읽을 수 없습니다. 접근 권한을 확인하고 다시 선택해 주세요.';
      return;
    } finally {
      folderApply.disabled = false;
    }
    for (const file of pending.files) session.baseline.set(file.name, file);
    session.pending = null;
    session.signature = '';
    folderApply.hidden = true;
    load(pending.batch);
    folderStatus.textContent = '새 검사 결과를 반영했습니다. 같은 폴더에서 다음 CSV 6개를 기다립니다.';
    scanFolder(session);
  });

  folderStop.addEventListener('click', () => {
    stopFolderWatch();
    folderStatus.textContent = '장비 폴더 감시를 중지했습니다.';
  });

  if (typeof window.showDirectoryPicker !== 'function') {
    folderStart.disabled = true;
    folderStatus.textContent = '장비 폴더 감시는 Windows의 Edge 또는 Chrome에서 사용해 주세요.';
  }
}
