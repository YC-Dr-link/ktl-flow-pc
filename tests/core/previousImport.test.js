import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import { createPreviousImport } from '../../src/ui/previousImport.js';
import { parseXml, setCells, toXml } from '../../src/excel/sheetXml.js';
import { SERIAL, SYNTHETIC_TEMPLATE_PATH } from '../helpers/fixture.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
async function workbook(maker, serial = SERIAL) {
  const zip = await JSZip.loadAsync(fs.readFileSync(SYNTHETIC_TEMPLATE_PATH));
  const doc = parseXml(await zip.file('xl/worksheets/sheet1.xml').async('string'));
  setCells(doc, { D8: serial, G7: maker });
  zip.file('xl/worksheets/sheet1.xml', toXml(doc));
  return zip.generateAsync({ type: 'uint8array' });
}
const oldBytes = workbook('SYNTH old maker'), newBytes = workbook('SYNTH new maker');
const file = (name, bytes, gate) => ({ name, size: bytes.length, arrayBuffer: async () => { if (gate) await gate.promise; return bytes; } });
function setup() {
  const state = { serial: SERIAL, busy: false, values: {}, status: '', bad: false, applied: 0, pending: [] };
  const importer = createPreviousImport({
    currentSerial: () => state.serial,
    isBusy: () => state.busy,
    onPendingChange: () => state.pending.push(importer.pending),
    fill: values => { let n = 0; for (const [key, value] of Object.entries(values)) { if (!state.values[key]) { state.values[key] = value; n++; } } return n; },
    onApplied: () => state.applied++,
    show: (text, bad = false) => { state.status = text; state.bad = bad; },
  });
  return { state, importer };
}

test('작년 Excel은 마지막 선택이 끝날 때까지 대기하고 앞선 파일은 채우지 않는다', async () => {
  const { state, importer } = setup(), oldGate = deferred(), newGate = deferred();
  const old = importer.select(file('SYNTH-old.xlsx', await oldBytes, oldGate));
  const latest = importer.select(file('SYNTH-new.xlsx', await newBytes, newGate));
  assert.equal(importer.pending, true);
  oldGate.resolve(); await old;
  assert.equal(state.values.maker, undefined);
  assert.equal(importer.pending, true);
  newGate.resolve(); await latest;
  assert.equal(state.values.maker, 'SYNTH new maker');
  assert.equal(state.applied, 1);
  assert.deepEqual(state.pending, [true, false]);
});
test('작년 Excel의 오래된 읽기 실패는 마지막 성공 안내를 덮어쓰지 않는다', async () => {
  const { state, importer } = setup(), gate = deferred();
  const old = importer.select({ name: 'SYNTH-error.xlsx', size: 1, arrayBuffer: () => gate.promise });
  await importer.select(file('SYNTH-new.xlsx', await newBytes));
  const message = state.status;
  gate.reject(new DOMException('SYNTH unreadable', 'NotReadableError')); await old;
  assert.equal(state.status, message); assert.equal(state.bad, false);
});
test('마지막 작년 파일이 거부되면 앞선 늦은 성공으로 바꾸지 않는다', async () => {
  const { state, importer } = setup(), gate = deferred();
  const old = importer.select(file('SYNTH-old.xlsx', await oldBytes, gate));
  await importer.select(file('SYNTH-invalid.xlsx', new TextEncoder().encode('SYNTH not an Excel file')));
  const message = state.status;
  gate.resolve(); await old;
  assert.equal(state.bad, true); assert.match(message, /Excel 파일/);
  assert.equal(state.status, message); assert.equal(state.applied, 0);
  assert.deepEqual(state.values, {});
});
test('CSV를 바꿨다가 같은 기기로 돌아와도 취소된 작년 파일은 채우지 않는다', async () => {
  const { state, importer } = setup(), gate = deferred();
  const old = importer.select(file('SYNTH-old.xlsx', await oldBytes, gate));
  importer.cancel(); state.serial = 'SYNTH-0002'; state.serial = SERIAL;
  gate.resolve(); await old;
  assert.equal(state.applied, 0); assert.deepEqual(state.values, {});
  assert.equal(importer.pending, false); assert.equal(state.status, '');
});
test('저장 또는 CSV 읽기 중 작년 파일 선택은 실행하지 않는다', async () => {
  const { state, importer } = setup(); state.busy = true;
  await importer.select({ name: 'SYNTH-ignored.xlsx', size: 1, arrayBuffer: () => { throw new Error('should not read'); } });
  assert.equal(importer.pending, false); assert.equal(state.applied, 0);
  assert.equal(state.status, '');
});
test('작년 값을 읽어도 사람이 이미 쓴 일반사항은 보존한다', async () => {
  const { state, importer } = setup(); state.values.maker = 'SYNTH manual maker';
  await importer.select(file('SYNTH-new.xlsx', await newBytes));
  assert.equal(state.values.maker, 'SYNTH manual maker');
  assert.equal(state.bad, false); assert.equal(state.applied, 1);
});
test('다른 기기·없는 기기 번호는 일반사항에 반영하지 않는다', async () => {
  for (const serial of ['SYNTH-0002', '']) {
    const { state, importer } = setup();
    await importer.select(file('SYNTH-other.xlsx', await workbook('SYNTH maker', serial)));
    assert.equal(state.bad, true); assert.equal(state.applied, 0);
    assert.deepEqual(state.values, {});
  }
});
test('현재 결과가 사라지면 작년 파일은 반영하지 않는다', async () => {
  const { state, importer } = setup(), gate = deferred();
  const old = importer.select(file('SYNTH-old.xlsx', await oldBytes, gate));
  state.serial = null; gate.resolve(); await old;
  assert.equal(state.bad, true); assert.equal(state.applied, 0);
});
test('최신 작년 파일 읽기 실패는 한국어 안내 후 대기를 해제한다', async () => {
  const { state, importer } = setup();
  await importer.select({ name: 'SYNTH-error.xlsx', size: 1, arrayBuffer: async () => { throw new DOMException('SYNTH unreadable', 'NotReadableError'); } });
  assert.match(state.status, /접근 권한/); assert.equal(state.bad, true);
  assert.equal(importer.pending, false); assert.equal(state.applied, 0);
});
