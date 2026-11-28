import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFolderWatch } from '../../src/ui/folderWatch.js';
import { analyze } from '../../src/core/analyze.js';
import { loadSample, toList, replaceInLine, SERIAL } from '../helpers/fixture.js';

const base = toList(loadSample());
const stamp = (files, n) => files.map(f => ({ name: f.name, size: f.bytes.length, lastModified: n, arrayBuffer: async () => f.bytes }));
const flush = () => new Promise(setImmediate);
function setup(t, hasResult = true) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', hidden: true, disabled: false, events: {}, focus() {}, addEventListener(type, fn) { this.events[type] = fn; } });
    return elements.get(id);
  };
  const state = { disk: stamp(base, 1), block: null, error: null, timers: [], clock: 0, current: hasResult ? base : [], hasResult, loads: 0 };
  t.mock.method(performance, 'now', () => state.clock);
  t.mock.method(globalThis, 'setTimeout', fn => { state.timers.push(fn); return state.timers.length; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const directory = { async *entries() { for (const f of state.disk) yield [f.name, { kind: 'file', getFile: async () => { if (state.error) throw state.error; return f; } }]; } };
  const originalDocument = globalThis.document, originalWindow = globalThis.window;
  globalThis.document = { getElementById: element };
  globalThis.window = { showDirectoryPicker: async () => directory };
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  });
  const watcher = createFolderWatch({ analyze, load(files) { state.current = files; state.hasResult = Boolean(analyze(files).result); state.loads++; }, isSaving: () => false,
    getFiles: () => state.current,
    getSlots: () => Object.fromEntries(Object.entries(analyze(state.current).slots).filter(([, slot]) => slot.fileIndex != null).map(([id, slot]) => [id, slot.fileIndex])),
    hasResult: () => state.hasResult, currentDevice: () => SERIAL,
    onBlock: reason => { state.block = reason; }, say() {},
  });
  const scan = async () => { assert.ok(state.timers.length); await state.timers.at(-1)(); await flush(); };
  const start = async () => {
    await element('csvFolderStart').events.click(); await flush();
    if (hasResult) { state.clock += 4000; await scan(); } // 처음부터 있던 현재 기기 파일도 먼저 안정화한다.
  };
  return { state, element, start, scan, watcher };
}

test('새 CSV 읽기가 일시 실패하면 저장을 보류하고 다른 기기로 확인되면 해제한다', async t => {
  const { state, start, scan, element } = setup(t);
  await start();
  state.disk.push({ name: 'SYNTH-writing.csv', size: 10, lastModified: 2,
    arrayBuffer: async () => { throw new DOMException('SYNTH writing', 'NotReadableError'); } });
  await scan();
  assert.match(state.block, /확인하는 중/);
  assert.equal(element('csvFolderStop').disabled, false);
  const other = base.map(f => ({ ...replaceInLine(f, 5, SERIAL, 'SYNTH-0002'), name: 'next-' + f.name }));
  state.disk = [...stamp(base, 1), ...stamp(other, 3)];
  await scan();
  assert.equal(state.block, null);
});
test('폴더 파일 읽기 재시도 오류도 저장을 보류하고 정상 재조회 후 해제한다', async t => {
  const { state, start, scan } = setup(t);
  await start(); state.error = new DOMException('SYNTH writing', 'NotReadableError');
  await scan(); assert.ok(state.block);
  state.error = null; await scan(); assert.equal(state.block, null);
});
test('폴더 권한 오류는 감시를 멈추고 저장 보류를 해제한다', async t => {
  const { state, start, scan, element } = setup(t);
  await start(); state.error = new DOMException('SYNTH denied', 'NotAllowedError');
  await scan();
  assert.equal(state.block, null);
  assert.equal(element('csvFolderStop').disabled, true);
  assert.match(element('csvFolderStatus').textContent, /접근 권한/);
});
test('현재 결과가 없으면 일시 읽기 실패로 저장 보류 상태를 만들지 않는다', async t => {
  const { state, start, scan } = setup(t, false);
  await start(); state.error = new DOMException('SYNTH writing', 'NotReadableError');
  await scan(); assert.equal(state.block, null);
});
test('폴더를 고르기 전에 있던 CSV 6개도 자동 덮어쓰기 없이 반영 후보로 보여 준다', async t => {
  const { state, start, scan, element } = setup(t, false);
  await start(); state.clock = 4000; await scan();
  assert.equal(element('csvFolderApply').hidden, false);
  assert.equal(state.loads, 0);
  await element('csvFolderApply').events.click();
  assert.equal(state.loads, 1); assert.equal(state.hasResult, true);
});
test('폴더 선택 전 3개와 선택 후 나머지 3개를 같은 검사분으로 묶는다', async t => {
  const { state, start, scan, element } = setup(t, false);
  state.disk = stamp(base.slice(0, 3), 1); await start(); state.clock = 4000; await scan();
  assert.equal(element('csvFolderApply').hidden, true);
  assert.match(element('csvFolderStatus').textContent, /3\/6/);
  state.disk.push(...stamp(base.slice(3), 2)); await scan(); state.clock = 8000; await scan();
  assert.equal(element('csvFolderApply').hidden, false);
});
test('수동 CSV 교체 후에는 이전 반영 완료 안내를 남기지 않는다', async t => {
  const { state, start, scan, element, watcher } = setup(t, false);
  await start(); state.clock = 4000; await scan(); await element('csvFolderApply').events.click();
  assert.match(element('csvFolderStatus').textContent, /반영했습니다/);
  state.current = base.map(f => ({ ...replaceInLine(f, 5, SERIAL, 'SYNTH-0002'), name: 'manual-' + f.name }));
  watcher.notifyManualLoad();
  await scan(); assert.doesNotMatch(element('csvFolderStatus').textContent, /반영했습니다|다음 기기 결과를 불러왔습니다/);
});
