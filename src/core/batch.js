// 폴더 감시에서 바뀐 CSV를 기기(1행 접수번호 + 5행 기기 번호)별로 묶고, 같은 기기 일부 재측정(교체)과 다음 기기를 가려낸다 (#23)
import defaultConfig from '../config.js';
import { headerValue, readCsvFile } from './csv.js';
import { classifyFile } from './classify.js';
import { SLOTS } from './assign.js';
import { splitRequester } from './receipt.js';

const sameBytes = (a, b) => Boolean(a && b) && a.length === b.length && a.every((v, i) => v === b[i]);

// 파일 하나: 칸 id(판별 못 하면 null), 기기 열쇠, 교정 시간
export function describeFile(f, config = defaultConfig) {
  const file = readCsvFile(f.name, f.bytes);
  const { test, format, evidence } = classifyFile(file, config);
  const slot = SLOTS.find((s) => s.test === test && s.format === format)?.id ?? null;
  const receipt_no = splitRequester(headerValue(file, 1)).receipt_no;
  const serial = headerValue(file, 5).trim();
  return { slot, receipt_no, serial, key: `${receipt_no}|${serial}`, calibrationTime: evidence.calibrationTime };
}

// current: 지금 화면의 파일([{ name, bytes }], 없으면 []), incoming: 기준과 달라진 파일([{ name, bytes, lastModified }]),
// currentSlots: 지금 화면의 칸 배정 { 칸 id: current 번호 } (사람이 직접 고른 칸 포함). 주면 자동 판별 대신 이것을 쓴다
// 반환: { replace: { slots: [{ slot, name, oldTime, newTime }], batch, superseded } | null,
//        next: [{ key, receipt_no, serial, unknown, count, ready, batch, superseded }], ignored: [이름], unchanged: [이름] }
// unchanged: 지금 화면의 같은 칸 파일과 바이트가 같은 파일. 바뀐 것이 없으므로 묻지 않고 기준에 넣으면 된다
// superseded: 같은 칸에서 더 최근 파일에 진 파일 이름. 그 묶음을 쓸 때 함께 기준에 넣어 다시 묻지 않게 한다
export function planFolder({ current, incoming, currentSlots = null }, config = defaultConfig) {
  // 접수번호나 기기 번호를 읽지 못하면 같은 기기인지 알 수 없으므로 지금 기기와 묶지 않는다
  // TODO(확인 필요): 실제 CSV에서 5행 기기 번호가 비는 경우가 있는지
  const known = (d) => Boolean(d.receipt_no && d.serial);
  const slotOfIndex = currentSlots ? new Map(Object.entries(currentSlots).map(([slot, i]) => [i, slot])) : null;
  const cur = current.map((f, i) => {
    const d = describeFile(f, config);
    return { f, d: slotOfIndex ? { ...d, slot: slotOfIndex.get(i) ?? null } : d };
  });
  const curKey = cur.find((c) => c.d.slot && known(c.d))?.d.key ?? null;
  const ignored = [];
  const groups = new Map(); // 열쇠 → { receipt_no, serial, unknown, first, bySlot: Map(칸 → { f, d }), superseded: [] }
  for (const f of incoming) {
    const d = describeFile(f, config);
    if (!d.slot) {
      ignored.push(f.name);
      continue;
    }
    const key = known(d) ? d.key : `?${d.key}`;
    if (!groups.has(key)) groups.set(key, { receipt_no: d.receipt_no, serial: d.serial, unknown: !known(d), first: Infinity, bySlot: new Map(), superseded: [] });
    const g = groups.get(key);
    g.first = Math.min(g.first, f.lastModified ?? 0);
    const prev = g.bySlot.get(d.slot);
    if (!prev || (f.lastModified ?? 0) > (prev.f.lastModified ?? 0)) {
      if (prev) g.superseded.push(prev.f.name);
      g.bySlot.set(d.slot, { f, d }); // 같은 칸이 둘이면 최근 것
    } else g.superseded.push(f.name);
  }

  let replace = null;
  const unchanged = [];
  if (curKey && groups.has(curKey)) {
    const { bySlot, superseded, receipt_no, serial } = groups.get(curKey);
    groups.delete(curKey);
    const curBySlot = new Map(cur.filter((c) => c.d.slot).map((c) => [c.d.slot, c]));
    for (const [slot, { f }] of [...bySlot]) {
      if (sameBytes(f.bytes, curBySlot.get(slot)?.f.bytes)) {
        unchanged.push(f.name);
        bySlot.delete(slot);
      }
    }
    if (bySlot.size) {
      replace = {
        receipt_no,
        serial,
        slots: SLOTS.filter((s) => bySlot.has(s.id)).map((s) => ({
          slot: s.id,
          name: bySlot.get(s.id).f.name,
          oldTime: curBySlot.get(s.id)?.d.calibrationTime ?? '',
          newTime: bySlot.get(s.id).d.calibrationTime,
        })),
        batch: SLOTS.map((s) => (bySlot.get(s.id) ?? curBySlot.get(s.id))?.f).filter(Boolean),
        superseded,
      };
    } else unchanged.push(...superseded);
  }

  // 먼저 들어온(가장 이른 lastModified) 기기가 앞. 폴더를 나열하는 순서(대개 이름순)에 기대지 않는다
  const next = [...groups]
    .sort(([, a], [, b]) => a.first - b.first)
    .map(([key, g]) => {
      const ready = SLOTS.every((s) => g.bySlot.has(s.id));
      return {
        key,
        receipt_no: g.receipt_no,
        serial: g.serial,
        unknown: g.unknown,
        count: g.bySlot.size,
        ready,
        batch: ready ? SLOTS.map((s) => g.bySlot.get(s.id).f) : null,
        superseded: g.superseded,
      };
    });
  return { replace, next, ignored, unchanged };
}
