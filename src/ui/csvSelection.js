// 한 검사분의 6칸은 판별·배정에서 정한다. 추가 후보와 판별 불가 파일도 직접 선택할 수 있다.
import { WORKBOOK_LIMITS } from '../excel/workbookSafety.js';
export const CSV_SELECTION_LIMITS = { files: 30, total: 100 * 1024 * 1024 };
export class CsvSizeError extends Error {}
export function checkCsvSize(file, total = 0) {
  if (file.size > WORKBOOK_LIMITS.compressed) throw new CsvSizeError('CSV는 파일당 25 MB 이하여야 합니다.');
  const next = total + file.size;
  if (next > CSV_SELECTION_LIMITS.total) throw new CsvSizeError('미처리 CSV의 전체 용량은 100 MB 이하여야 합니다.');
  return next;
}

export async function readCsvSelection(picked) {
  if (picked.length > CSV_SELECTION_LIMITS.files) throw new Error('CSV는 한 번에 30개 이하로 선택하세요.');
  picked.reduce((sum, file) => checkCsvSize(file, sum), 0);
  return Promise.all(picked.map(async f => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
}
