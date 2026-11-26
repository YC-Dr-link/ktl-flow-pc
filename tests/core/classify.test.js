// 내용으로 종류를 판별하고 6칸에 배정하는 규칙을 순서 섞기·이름 바꾸기와 함께 확인하는 테스트
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../../src/core/analyze.js';
import { SLOT_IDS, loadSample, toList } from '../helpers/fixture.js';

const nameOf = (r, slot) => r.slots[slot].fileName;

describe('판별과 자동 배정', () => {
  const sample = loadSample();

  it('합성 CSV 6개가 각 칸에 맞게 배정되고 판별 근거가 칸마다 나온다', () => {
    const r = analyze(toList(sample));
    assert.deepEqual(r.errors, []);
    for (const id of SLOT_IDS) {
      assert.equal(nameOf(r, id), sample[id].name, id);
      const ev = r.slots[id].evidence;
      assert.ok(ev.points >= 10, `${id} 측정점 수`);
      assert.ok(ev.pattern, `${id} 패턴`);
      assert.match(ev.calibrationTime, /^(\d+ 시 \d+ 분 \d+ 초|\d{2}:\d{2}:\d{2})$/, `${id} 교정 시간`); // 실제 견본 꼴은 「HH 시 MM 분 SS 초」, 합성 CSV는 09:00:00
      assert.ok(ev.reason.length > 0, `${id} 근거 문장`);
    }
    assert.equal(r.slots.rep_summary.evidence.points, 10);
    assert.equal(r.slots.sen_summary.evidence.points, 30);
    assert.equal(r.slots.lin_summary.evidence.calibrationTime, '09:00:00');
  });

  it('순서를 섞어도 같은 배정', () => {
    for (const order of [[5, 4, 3, 2, 1, 0], [2, 5, 0, 3, 1, 4], [1, 0, 3, 2, 5, 4]]) {
      const list = order.map((i) => toList(sample)[i]);
      const r = analyze(list);
      assert.deepEqual(r.errors, [], order.join());
      for (const id of SLOT_IDS) assert.equal(nameOf(r, id), sample[id].name, `${order.join()} ${id}`);
    }
  });

  it('파일 이름을 f1~f6.csv로 바꿔도 같은 결과 (이름은 판별에 쓰지 않는다)', () => {
    const base = analyze(toList(sample));
    const renamed = toList(sample).map((f, i) => ({ name: `f${i + 1}.csv`, bytes: f.bytes }));
    const r = analyze(renamed.reverse());
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.result, base.result);
    SLOT_IDS.forEach((id, i) => assert.equal(nameOf(r, id), `f${i + 1}.csv`));
  });

  it('요약인지 source인지도 내용으로 구분한다', () => {
    const r = analyze(toList(sample));
    const byName = Object.fromEntries(r.files.map((f) => [f.name, f]));
    assert.equal(byName[sample.rep_summary.name].format, 'summary');
    assert.equal(byName[sample.rep_source.name].format, 'source');
    assert.equal(byName[sample.sen_source.name].test, 'sensitivity');
  });

  it('판별 불가 파일은 알림이 나오고 배정되지 않는다', () => {
    const junk = { name: 'junk.csv', bytes: new TextEncoder().encode('a,b,c\r\n1,2,3\r\n') };
    const r = analyze([...toList(sample), junk]);
    const n = r.notices.find((x) => x.code === 'UNCLASSIFIED');
    assert.ok(n && n.file === 'junk.csv');
    assert.match(n.message, /junk\.csv/);
    assert.deepEqual(r.errors, []);
    assert.ok(r.result);
  });

  it('빈 파일과 파일 없음도 던지지 않는다', () => {
    const r = analyze([{ name: 'empty.csv', bytes: new Uint8Array() }]);
    assert.equal(r.result, null);
    assert.equal(r.errors.filter((e) => e.code === 'FILE_MISSING').length, 6);
    assert.equal(analyze([]).result, null);
  });
});
