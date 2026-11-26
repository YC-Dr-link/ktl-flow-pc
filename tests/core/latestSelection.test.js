import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLatestSelection } from '../../src/ui/latestSelection.js';
import { analyze } from '../../src/core/analyze.js';
import { loadSample, toList, replaceInLine, SERIAL } from '../helpers/fixture.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const fail = error => { throw error; };
const firstDevice = toList(loadSample());
const secondDevice = firstDevice.map(f => replaceInLine(f, 5, SERIAL, 'SYNTH-0002'));

test('읽는 순서가 뒤집혀도 마지막으로 고른 CSV 기기의 결과를 유지한다', async () => {
  const selection = createLatestSelection();
  const slow = deferred();
  let result;
  const apply = files => { result = analyze(files).result; };
  const old = selection.run(() => slow.promise, apply, fail);
  await selection.run(async () => secondDevice, apply, fail);
  assert.equal(result.equipment.serial, 'SYNTH-0002');
  slow.resolve(firstDevice); await old;
  assert.equal(result.equipment.serial, 'SYNTH-0002');
});
test('옛 CSV 읽기 실패가 새 기기의 정상 결과를 지우지 않는다', async () => {
  const selection = createLatestSelection(), slow = deferred();
  let result;
  const apply = files => { result = analyze(files).result; };
  const old = selection.run(() => slow.promise, apply, () => { result = null; });
  await selection.run(async () => secondDevice, apply, fail);
  slow.reject(new Error('SYNTH old read error')); await old;
  assert.equal(result.equipment.serial, 'SYNTH-0002');
});
test('새 양식이 거부되어도 이전 선택의 늦은 성공으로 몰래 바꾸지 않는다', async () => {
  const selection = createLatestSelection(), slow = deferred();
  let picked = 'SYNTH original', message = '';
  const old = selection.run(() => slow.promise, value => { picked = value; }, fail);
  await selection.run(async () => { throw new Error('SYNTH unsafe template'); }, value => { picked = value; }, error => { message = error.message; });
  slow.resolve('SYNTH obsolete'); await old;
  assert.equal(picked, 'SYNTH original'); assert.equal(message, 'SYNTH unsafe template');
});
test('지우기 후 남은 양식 읽기·복원이 끝나도 선택과 저장소를 되살리지 않는다', async () => {
  const selection = createLatestSelection(), slow = deferred();
  let picked = 'SYNTH original', cache = picked;
  const reading = selection.run(() => slow.promise, value => { picked = cache = value; }, fail);
  selection.cancel(); picked = cache = null;
  slow.resolve('SYNTH forgotten'); await reading;
  assert.equal(picked, null); assert.equal(cache, null); assert.equal(selection.pending, false);
});
test('취소한 선택의 뒤늦은 오류는 새 안내를 덮어쓰지 않는다', async () => {
  const selection = createLatestSelection(), slow = deferred();
  let message = '지웠습니다';
  const reading = selection.run(() => slow.promise, () => {}, error => { message = error.message; });
  selection.cancel(); slow.reject(new Error('SYNTH obsolete failure')); await reading;
  assert.equal(message, '지웠습니다');
});
test('옛 읽기가 먼저 끝나도 최신 읽기가 남아 있으면 저장 대기를 유지한다', async () => {
  const transitions = [], selection = createLatestSelection(() => transitions.push(selection.pending));
  const a = deferred(), b = deferred();
  const old = selection.run(() => a.promise, () => {}, fail);
  const latest = selection.run(() => b.promise, () => {}, fail);
  a.resolve('SYNTH old'); await old; assert.equal(selection.pending, true);
  b.resolve('SYNTH new'); await latest; assert.equal(selection.pending, false);
  assert.deepEqual(transitions, [true, false]);
});
test('용량 검사처럼 읽기 전에 실패해도 오류를 전달하고 저장 대기를 해제한다', async () => {
  const selection = createLatestSelection(); let message;
  await selection.run(() => { throw new Error('25 MB'); }, () => assert.fail('반영하면 안 됨'), error => { message = error.message; });
  assert.equal(message, '25 MB'); assert.equal(selection.pending, false);
});
test('CSV 선택과 양식 선택은 서로의 결과를 취소하지 않는다', async () => {
  const csv = createLatestSelection(), template = createLatestSelection(), slow = deferred();
  let picked;
  const restoring = template.run(() => slow.promise, value => { picked = value; }, fail);
  csv.cancel(); slow.resolve('SYNTH template'); await restoring;
  assert.equal(picked, 'SYNTH template');
});
