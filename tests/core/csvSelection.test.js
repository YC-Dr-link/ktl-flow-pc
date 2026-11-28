import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCsvSelection, CSV_SELECTION_LIMITS } from '../../src/ui/csvSelection.js';
import { WORKBOOK_LIMITS } from '../../src/excel/workbookSafety.js';
import { analyze } from '../../src/core/analyze.js';
import { loadSample, toList } from '../helpers/fixture.js';

const base = toList(loadSample());
const file = f => ({ name: f.name, size: f.bytes.length, arrayBuffer: async () => f.bytes });
test('7번째 판별 불가 파일이 있어도 정상 6칸의 결과를 만든다', async () => {
  const picked = [...base, { name: 'SYNTH-unknown.csv', bytes: new TextEncoder().encode('SYNTH unknown') }].map(file);
  const files = await readCsvSelection(picked), result = analyze(files);
  assert.equal(files.length, 7); assert.ok(result.result);
  assert.ok(result.notices.length);
});
test('같은 종류가 둘이면 수동 선택으로 7번째 파일을 고를 수 있다', async () => {
  const files = await readCsvSelection([...base, { ...base[0], name: 'SYNTH-choice.csv' }].map(file));
  assert.equal(analyze(files).result, null);
  const chosen = analyze(files, { assignment: { rep_summary: 6 } });
  assert.ok(chosen.result); assert.equal(chosen.slots.rep_summary.fileIndex, 6);
});
test('파일 개수·개별 용량·총 용량 초과는 읽기 전에 거부한다', async () => {
  const blocked = size => ({ name: 'SYNTH-large.csv', size, arrayBuffer: () => assert.fail('읽으면 안 됨') });
  await assert.rejects(readCsvSelection(Array.from({ length: CSV_SELECTION_LIMITS.files + 1 }, () => blocked(1))), /30개/);
  await assert.rejects(readCsvSelection([blocked(WORKBOOK_LIMITS.compressed + 1)]), /25 MB/);
  await assert.rejects(readCsvSelection(Array.from({ length: 5 }, () => blocked(WORKBOOK_LIMITS.compressed))), /100 MB/);
});
