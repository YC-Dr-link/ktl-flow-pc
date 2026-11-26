// 파일 시스템과 시계만 가짜로 두고 실제 폴더 감시·판별·계산을 함께 실행한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFolderWatch } from '../../src/ui/folderWatch.js';
import { analyze } from '../../src/core/analyze.js';
import { loadSample, toList, replaceInLine, SERIAL } from '../helpers/fixture.js';

const base = toList(loadSample());
const repeated = base.slice(0, 2).map((f, i) => ({ ...replaceInLine(f, 11, '09:00:00', '10:00:00'), name: `repeat-new-${i}.csv` }));
const other = base.map(f => ({ ...replaceInLine(f, 5, SERIAL, 'SYNTH-0002'), name: `next-${f.name}` }));
const stamp = (files, n) => files.map(f => new File([f.bytes], f.name, { lastModified: n }));

function harness(t, { current = base, disk = stamp(base, 1) } = {}) {
  const saved = { document: globalThis.document, window: globalThis.window };
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', hidden: true, disabled: false, events: {}, addEventListener(type, fn) { this.events[type] = fn; }, focus() {} });
    return elements.get(id);
  };
  let clock = 0, timerId = 0, files = current, analysis = analyze(current), blocked = null, saving = false, failure = null;
  const timers = new Map();
  t.mock.method(globalThis, 'setTimeout', fn => { timers.set(++timerId, fn); return timerId; });
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  globalThis.document = { getElementById: el };
  globalThis.window = { showDirectoryPicker: async () => ({ async *entries() {
    if (failure) throw new DOMException('SYNTH read error', failure);
    for (const f of disk) yield [f.name, { kind: 'file', getFile: async () => f }];
  } }) };
  t.after(() => { globalThis.document = saved.document; globalThis.window = saved.window; });
  const watcher = createFolderWatch({ analyze, load: next => { files = next; analysis = analyze(next); }, isSaving: () => saving, getFiles: () => files,
    getSlots: () => Object.fromEntries(Object.entries(analysis.slots).filter(([, s]) => s.fileIndex != null).map(([id, s]) => [id, s.fileIndex])),
    hasResult: () => Boolean(analysis.result), currentDevice: () => analysis.result?.equipment.serial, onBlock: reason => { blocked = reason; }, say() {}, now: () => clock });
  return { watcher, el, start: () => el('csvFolderStart').events.click(), click: id => el(id).events.click(),
    get files() { return files; }, get analysis() { return analysis; }, get blocked() { return blocked; },
    disk: next => { disk = next; }, fail: name => { failure = name; }, saving: v => { saving = v; },
    async tick(ms = 1000) { clock += ms; const [id, fn] = timers.entries().next().value ?? []; assert.ok(fn, '감시 타이머가 살아 있어야 한다'); timers.delete(id); await fn(); } };
}

test('안정화 대기부터 저장을 막고 반복성 두 파일 교체 후 6개로 다시 계산한다', async t => {
  const h = harness(t); await h.start();
  h.disk([...stamp(base, 1), ...stamp(repeated, 2)]); await h.tick();
  assert.match(h.blocked, /확인 중/);
  assert.equal(await h.watcher.checkBeforeSave(h.files), false);
  await h.tick(3000);
  assert.equal(h.el('watchReplace').hidden, false);
  await h.click('watchReplace');
  assert.equal(h.files.length, 6); assert.ok(h.analysis.result); assert.equal(h.blocked, null);
  assert.ok(h.files.some(f => f.name.startsWith('repeat-new-')));
  assert.equal(await h.watcher.checkBeforeSave(h.files), true);
});
test('정기 검사 전에 바뀐 CSV도 저장 직전 검사에서 발견한다', async t => {
  const h = harness(t); await h.start();
  assert.equal(await h.watcher.checkBeforeSave(h.files), true);
  h.disk([...stamp(base, 1), ...stamp(repeated, 2)]);
  assert.equal(await h.watcher.checkBeforeSave(h.files), false); assert.ok(h.blocked);
  await h.tick(3000); await h.click('watchKeep');
  assert.equal(h.files, base); assert.equal(await h.watcher.checkBeforeSave(h.files), true);
});
test('다음 기기는 현재 결과 저장 후 넘어가는 팀 결정을 유지한다', async t => {
  const h = harness(t); await h.start(); h.disk([...stamp(base, 1), ...stamp(other, 2)]);
  await h.tick(); await h.tick(3000);
  assert.equal(h.files, base); assert.equal(h.blocked, null); assert.equal(h.el('watchNext').hidden, false);
  assert.equal(await h.watcher.checkBeforeSave(h.files), true);
  h.watcher.notifySaved(h.files); await h.tick();
  assert.equal(h.analysis.result.equipment.serial, 'SYNTH-0002');
});
test('일시적 읽기 실패에도 이전 결과 저장을 허용하지 않고 복구 후 다시 확인한다', async t => {
  const h = harness(t); await h.start(); h.fail('NotReadableError'); await h.tick();
  assert.ok(h.blocked); assert.equal(await h.watcher.checkBeforeSave(h.files), false);
  h.fail(null); await h.tick(); assert.equal(h.blocked, null);
  assert.equal(await h.watcher.checkBeforeSave(h.files), true);
});
test('접근 권한을 잃으면 차단을 남기고 명시적 감시 중지 후에만 해제한다', async t => {
  const h = harness(t); await h.start(); h.fail('NotAllowedError'); await h.tick();
  assert.match(h.blocked, /접근 권한/); assert.equal(await h.watcher.checkBeforeSave(h.files), false);
  assert.equal(h.el('csvFolderStop').disabled, false); await h.click('csvFolderStop');
  assert.equal(await h.watcher.checkBeforeSave(h.files), true);
});
test('현재 결과에 쓴 CSV가 빈 파일로 바뀌어도 조용히 제외하고 저장하지 않는다', async t => {
  const h = harness(t); await h.start();
  h.disk([new File([], base[0].name, { lastModified: 2 }), ...stamp(base.slice(1), 1)]);
  await h.tick(); await h.tick(3000);
  assert.ok(h.blocked); assert.equal(h.el('watchKeep').hidden, false);
  assert.equal(await h.watcher.checkBeforeSave(h.files), false);
  await h.click('watchKeep'); assert.equal(await h.watcher.checkBeforeSave(h.files), true);
});
test('교체 직전에 파일이 다시 바뀌면 이전 교체 계획도 저장도 멈춘다', async t => {
  const h = harness(t); await h.start(); h.disk([...stamp(base, 1), ...stamp(repeated, 2)]);
  await h.tick(); await h.tick(3000);
  h.disk([...stamp(base, 1), ...stamp(repeated, 3)]); await h.click('watchReplace');
  assert.equal(h.files, base); assert.ok(h.blocked); assert.equal(await h.watcher.checkBeforeSave(h.files), false);
});
test('처음 들어온 여섯 파일의 반영 흐름을 유지한다', async t => {
  const h = harness(t, { current: [], disk: [] }); await h.start(); h.disk(stamp(base, 1));
  await h.tick(); await h.tick(3000); assert.equal(h.el('csvFolderApply').hidden, false);
  await h.click('csvFolderApply'); assert.ok(h.analysis.result); assert.equal(h.files.length, 6);
});
