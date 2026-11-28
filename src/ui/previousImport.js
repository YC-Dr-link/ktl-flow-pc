// 작년 파일을 연속 선택해도 마지막 선택만 채운다. CSV가 바뀌면 cancel()로 이전 읽기를 무효화한다.
import { readPreviousGeneral } from '../excel/readPrevious.js';
import { WORKBOOK_LIMITS } from '../excel/workbookSafety.js';
import { createLatestSelection } from './latestSelection.js';

export function createPreviousImport({ onPendingChange, currentSerial, isBusy, fill, onApplied, show }) {
  const selection = createLatestSelection(onPendingChange);
  return {
    get pending() { return selection.pending; },
    cancel() { selection.cancel(); show(''); },
    async select(file) {
      if (!file || isBusy()) return;
      show('작년 파일을 읽고 있습니다…');
      await selection.run(async () => {
        if (file.size > WORKBOOK_LIMITS.compressed) throw new Error('작년 파일은 25 MB 이하여야 합니다.');
        return readPreviousGeneral(new Uint8Array(await file.arrayBuffer()));
      }, prev => {
        const now = currentSerial();
        if (!now) {
          show('지금 결과의 기기 번호가 없어 작년 파일과 비교할 수 없습니다. CSV 6개로 결과를 낸 뒤 고르세요.', true);
          return;
        }
        if (!prev.serial) {
          show('작년 파일의 기기 번호(일반사항 D8)를 읽을 수 없어 채우지 않았습니다. 같은 기기의 파일인지 확인하세요.', true);
          return;
        }
        if (prev.serial !== now) {
          show(`작년 파일의 기기 번호(${prev.serial})가 지금 기기(${now})와 다릅니다. 같은 기기의 파일을 고르세요.`, true);
          return;
        }
        const n = fill(prev.values);
        onApplied(now);
        show(n ? `작년 파일 ${file.name}에서 ${n}칸을 채웠습니다 (이미 넣은 칸은 그대로).` : `작년 파일 ${file.name}에서 채울 빈 칸이 없습니다.`);
      }, error => {
        show(error instanceof DOMException ? '작년 파일을 읽지 못했습니다. 접근 권한을 확인하고 다시 선택하세요.' : error.message, true);
      });
    },
  };
}
