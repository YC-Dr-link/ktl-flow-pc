// 폴더 감시에서 바뀐 CSV를 기기(1행 접수번호 + 5행 기기 번호)별로 묶고, 같은 기기 일부 재측정(교체)과 다음 기기를 가려낸다 (#23)
import defaultConfig from '../config.js';
import { headerValue, readCsvFile } from './csv.js';
import { classifyFile } from './classify.js';
import { SLOTS } from './assign.js';
import { splitRequester } from './receipt.js';

// 파일 하나: 칸 id(판별 못 하면 null), 기기 열쇠, 교정 시간
export function describeFile(f, config = defaultConfig) {
  const file = readCsvFile(f.name, f.bytes);
  const { test, format, evidence } = classifyFile(file, config);
  const slot = SLOTS.find((s) => s.test === test && s.format === format)?.id ?? null;
  const receipt_no = splitRequester(headerValue(file, 1)).receipt_no;
  const serial = headerValue(file, 5).trim();
  return { slot, receipt_no, serial, key: `${receipt_no}|${serial}`, calibrationTime: evidence.calibrationTime };
}

// current: 지금 화면의 파일([{ name, bytes }], 없으면 []), incoming: 기준과 달라진 파일([{ name, bytes, lastModified }])
// 반환: { replace: { slots: [{ slot, name, oldTime, newTime }], batch } | null, next: [{ key, receipt_no, serial, count, ready, batch }], ignored: [이름] }
export function planFolder({ current, incoming }, config = defaultConfig) {
  const cur = current.map((f) => ({ f, d: describeFile(f, config) }));
  const curKey = cur.find((c) => c.d.slot)?.d.key ?? null;
  const ignored = [];
  const groups = new Map(); // 열쇠 → { receipt_no, serial, bySlot: Map(칸 → { f, d }) }, 먼저 들어온 기기가 앞
  for (const f of incoming) {
    const d = describeFile(f, config);
    if (!d.slot) {
      ignored.push(f.name);
      continue;
    }
    if (!groups.has(d.key)) groups.set(d.key, { receipt_no: d.receipt_no, serial: d.serial, bySlot: new Map() });
    const bySlot = groups.get(d.key).bySlot;
    const prev = bySlot.get(d.slot);
    if (!prev || (f.lastModified ?? 0) > (prev.f.lastModified ?? 0)) bySlot.set(d.slot, { f, d }); // 같은 칸이 둘이면 최근 것
  }

  let replace = null;
  if (curKey && groups.has(curKey)) {
    const { bySlot } = groups.get(curKey);
    groups.delete(curKey);
    const curBySlot = new Map(cur.filter((c) => c.d.slot).map((c) => [c.d.slot, c]));
    replace = {
      slots: SLOTS.filter((s) => bySlot.has(s.id)).map((s) => ({
        slot: s.id,
        name: bySlot.get(s.id).f.name,
        oldTime: curBySlot.get(s.id)?.d.calibrationTime ?? '',
        newTime: bySlot.get(s.id).d.calibrationTime,
      })),
      batch: SLOTS.map((s) => (bySlot.get(s.id) ?? curBySlot.get(s.id))?.f).filter(Boolean),
    };
  }

  const next = [...groups].map(([key, g]) => {
    const ready = SLOTS.every((s) => g.bySlot.has(s.id));
    return { key, receipt_no: g.receipt_no, serial: g.serial, count: g.bySlot.size, ready, batch: ready ? SLOTS.map((s) => g.bySlot.get(s.id).f) : null };
  });
  return { replace, next, ignored };
}
