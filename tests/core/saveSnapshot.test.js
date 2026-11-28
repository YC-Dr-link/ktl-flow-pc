import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeSnapshot } from '../../src/ui/saveSnapshot.js';

function targetWith(log, hooks = {}) {
  const writer = Object.fromEntries(['write', 'close', 'abort'].map(name => [name, async () => { log.push(name); await hooks[name]?.(); }]));
  return { createWritable: async () => { log.push('create'); await hooks.create?.(); return writer; } };
}
test('새 데이터가 없으면 한 번만 쓰고 확정한다', async () => {
  const log = [];
  assert.equal(await writeSnapshot(targetWith(log), new Uint8Array([1]), async () => true), true);
  assert.deepEqual(log, ['create', 'write', 'close']);
});
for (const phase of ['before', 'create', 'write']) {
  test(`${phase} 단계에서 새 데이터가 생기면 확정하지 않는다`, async () => {
    const log = [];
    let current = phase !== 'before';
    const target = targetWith(log, { [phase]: () => { current = false; } });
    assert.equal(await writeSnapshot(target, new Uint8Array([1]), async () => current), false);
    assert.deepEqual(log, phase === 'before' ? [] : phase === 'create' ? ['create', 'abort'] : ['create', 'write', 'abort']);
  });
}
for (const phase of ['write', 'close']) {
  test(`${phase} 실패 시 중단하고 원래 오류를 전달한다`, async () => {
    const log = [];
    const target = targetWith(log, { [phase]: () => { throw new Error('SYNTH write error'); }, abort: () => { throw new Error('SYNTH abort error'); } });
    await assert.rejects(writeSnapshot(target, new Uint8Array([1]), async () => true), /SYNTH write error/);
    assert.equal(log.at(-1), 'abort');
  });
}
