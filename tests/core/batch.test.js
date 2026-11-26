// 폴더 감시에서 바뀐 CSV를 기기별로 묶고, 같은 기기 일부 재측정(교체)과 다음 기기를 가려내는지 본다 (#23)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeFile, planFolder } from '../../src/core/batch.js';
import { SERIAL, SLOT_IDS, loadSample, replaceInLine, toList } from '../helpers/fixture.js';

const sample = loadSample('set_a');
const current = toList(sample); // 지금 화면의 6개 (칸 순서)
let clock = 1000;
// 폴더에서 읽은 파일처럼 lastModified를 붙인다
const stamp = (f, name = f.name) => ({ name, bytes: f.bytes, lastModified: (clock += 1) });
const retimed = (f) => replaceInLine(f, 11, '09:00:00', '10:00:00'); // 다시 측정 → 교정 시간이 바뀐다
const otherDevice = (f) => replaceInLine(f, 5, SERIAL, 'SYNTH-0002'); // 2대째 기기 번호
const junk = { name: 'memo.csv', bytes: new TextEncoder().encode('a,b,c\n1,2,3'), lastModified: 1 };

test('describeFile: 칸 · 기기 열쇠 · 교정 시간', () => {
  const d = describeFile(sample.rep_summary);
  assert.deepEqual([d.slot, d.receipt_no, d.serial, d.calibrationTime], ['rep_summary', '25-123456-01-1', SERIAL, '09:00:00']);
  assert.equal(describeFile(junk).slot, null);
});

test('같은 기기의 반복성 요약 · source만 다시 저장 → 교체 2칸, 바꾼 6개 묶음', () => {
  const incoming = [stamp(retimed(sample.rep_summary), 'rep2.csv'), stamp(retimed(sample.rep_source), 'rep2s.csv')];
  const plan = planFolder({ current, incoming });
  assert.deepEqual(
    plan.replace.slots.map((s) => [s.slot, s.name, s.oldTime, s.newTime]),
    [
      ['rep_summary', 'rep2.csv', '09:00:00', '10:00:00'],
      ['rep_source', 'rep2s.csv', '09:00:00', '10:00:00'],
    ],
  );
  assert.deepEqual(plan.replace.batch.map((f) => f.name), ['rep2.csv', 'rep2s.csv', ...current.slice(2).map((f) => f.name)]);
  assert.deepEqual(plan.next, []);
});

test('다른 기기 3개 → 다음 기기 3/6 대기, 아직 준비 안 됨. 지금 기기 교체는 없음', () => {
  const incoming = current.slice(0, 3).map((f) => stamp(otherDevice(f), `b-${f.name}`));
  const plan = planFolder({ current, incoming });
  assert.equal(plan.replace, null);
  assert.equal(plan.next.length, 1);
  assert.deepEqual([plan.next[0].serial, plan.next[0].count, plan.next[0].ready, plan.next[0].batch], ['SYNTH-0002', 3, false, null]);
});

test('다른 기기 6개 → 준비됨, 묶음은 칸 순서', () => {
  const shuffled = [3, 0, 5, 1, 4, 2].map((i) => current[i]);
  const plan = planFolder({ current, incoming: shuffled.map((f) => stamp(otherDevice(f), `b-${f.name}`)) });
  assert.equal(plan.next[0].ready, true);
  assert.deepEqual(plan.next[0].batch.map((f) => describeFile(f).slot), SLOT_IDS);
});

test('지금 결과가 없으면(처음) 모든 기기가 다음 기기다', () => {
  const plan = planFolder({ current: [], incoming: current.map((f) => stamp(f)) });
  assert.equal(plan.replace, null);
  assert.deepEqual([plan.next.length, plan.next[0].serial, plan.next[0].ready], [1, SERIAL, true]);
});

test('두 기기가 섞인 12개 → 기기별로 둘, 먼저 들어온 기기가 앞', () => {
  const third = (f) => replaceInLine(f, 5, SERIAL, 'SYNTH-0003');
  const incoming = [...current.map((f) => stamp(otherDevice(f), `b-${f.name}`)), ...current.map((f) => stamp(third(f), `c-${f.name}`))];
  const plan = planFolder({ current: [], incoming });
  assert.deepEqual(plan.next.map((n) => [n.serial, n.count, n.ready]), [['SYNTH-0002', 6, true], ['SYNTH-0003', 6, true]]);
});

test('판별 못 하는 파일은 ignored로 빼고, 같은 칸 파일이 둘이면 최근 것을 쓴다', () => {
  const older = stamp(retimed(sample.lin_summary), 'lin-old.csv');
  const newer = stamp(retimed(sample.lin_summary), 'lin-new.csv');
  const plan = planFolder({ current, incoming: [newer, junk, older].map((f, i) => (i === 2 ? { ...f, lastModified: 1 } : f)) });
  assert.deepEqual(plan.ignored, ['memo.csv']);
  assert.deepEqual(plan.replace.slots.map((s) => s.name), ['lin-new.csv']);
});
