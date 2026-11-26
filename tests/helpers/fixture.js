// 합성 풍동 CSV(synthetic/set_a · set_b, 영진 님 PR #15 생성기)를 읽고, 테스트 안에서 일부만 고쳐 오류 케이스를 만드는 도우미 (고친 파일은 저장하지 않는다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SYNTHETIC_DIR = path.join(root, 'synthetic');
export const SYNTHETIC_TEMPLATE_PATH = path.join(root, 'synthetic/template_synthetic.xlsx'); // tools/make-synthetic-template.mjs가 만든다

// 합성 CSV 1행 「의뢰 기관」은 SYNTHETIC-ONLY라 접수번호 꼴이 아니다. 실제 꼴(접수번호 + 공백 + 회사명)로 바꿔 쓴다. 접수번호는 data-guard가 허용하는 가짜(가운데 123456)
export const FAKE_RECEIPT = '25-123456-01-1';
export const FAKE_COMPANY = 'SYNTH-CO';
export const SERIAL = 'SYNTH-0001'; // 합성 CSV 5행 기기 번호
export const MODEL = 'SYNTH-MODEL'; // 합성 CSV 4행 모델명

const SLOT_OF = { repeatability: 'rep', linearity: 'lin', sensitivity: 'sen' };
const slotId = (f) => `${SLOT_OF[f.kind]}_${f.role === 'result' ? 'summary' : 'source'}`;
export const SLOT_IDS = ['rep_summary', 'rep_source', 'lin_summary', 'lin_source', 'sen_summary', 'sen_source'];

// 영진 님 생성기가 만든 정답 (반복성 · 직선성 · 민감도, 백분율). 이 도구 코드로 만든 값이 아니라 독립 정답이다
export const loadExpected = (set = 'set_a') => JSON.parse(fs.readFileSync(path.join(SYNTHETIC_DIR, set, 'expected.json'), 'utf8'));

// 바이트를 latin1 문자열로 바꿔 고친 뒤 되돌린다 (latin1은 1바이트 = 1글자라 CP949 한글 바이트가 그대로 보존된다).
// 숫자 · 쉼표 · 공백 · 영문 · 줄바꿈만 건드리는 수정에 쓴다
export function editLines(file, fn) {
  const lines = Buffer.from(file.bytes).toString('latin1').split('\r\n');
  const out = fn(lines) || lines;
  return { name: file.name, bytes: new Uint8Array(Buffer.from(out.join('\r\n'), 'latin1')) };
}

// 번호는 1부터 센 줄 번호
export const replaceInLine = (file, lineNo, from, to) =>
  editLines(file, (lines) => {
    if (!lines[lineNo - 1].includes(from)) throw new Error(`${lineNo}번째 줄에 '${from}'가 없음: ${lines[lineNo - 1]}`);
    lines[lineNo - 1] = lines[lineNo - 1].replace(from, to);
  });

// { 칸id: { name, bytes } } — 칸 순서가 곧 배열 순서. 1행은 접수번호 + 회사명으로 바꿔 둔다
export function loadSample(set = 'set_a') {
  const { files } = loadExpected(set);
  return Object.fromEntries(
    files
      .map((f) => {
        const raw = { name: f.name, bytes: new Uint8Array(fs.readFileSync(path.join(SYNTHETIC_DIR, set, f.name))) };
        return [slotId(f), replaceInLine(raw, 1, 'SYNTHETIC-ONLY', `${FAKE_RECEIPT} ${FAKE_COMPANY}`)];
      })
      .sort(([a], [b]) => SLOT_IDS.indexOf(a) - SLOT_IDS.indexOf(b)),
  );
}

export const toList = (sample) => SLOT_IDS.map((id) => sample[id]).filter(Boolean);
export const withFile = (sample, id, file) => ({ ...sample, [id]: file });
export const without = (sample, id) => ({ ...sample, [id]: undefined });

// 결과와 정답(expected.json)을 소수 셋째 자리(절대오차 0.0005)까지 비교한다. 어긋난 항목 목록을 돌려준다 (NFR-02, AGENTS.md)
export const TOL = 0.0005;
export function diffSynthetic(expected, result) {
  const e = expected.expected;
  const pairs = [
    ['반복성 ZERO', e.repeatability_pct.zero, result.repeatability.zero_pct],
    ['반복성 SPAN', e.repeatability_pct.span, result.repeatability.span_pct],
    ['직선성 30% (최대 상대오차)', e.linearity_pct['30'].max_abs_relative_pct, result.linearity.p30_pct],
    ['직선성 70% (최대 상대오차)', e.linearity_pct['70'].max_abs_relative_pct, result.linearity.p70_pct],
    ['직선성 30% 평균오차', e.linearity_pct['30'].signed_mean_relative_pct, result.linearity.avg_error_pct.p30],
    ['직선성 70% 평균오차', e.linearity_pct['70'].signed_mean_relative_pct, result.linearity.avg_error_pct.p70],
    ['민감도', e.sensitivity_pct, result.sensitivity.value_pct],
    ...e.sensitivity_groups.map((g, i) => [`민감도 ${g.angle_deg}° ${g.range_pct}% (절댓값)`, Math.abs(g.mean_error_pct), result.sensitivity.by_angle[i]?.value_pct]),
  ];
  return pairs.filter(([, want, got]) => !(typeof got === 'number' && Math.abs(want - got) <= TOL)).map(([k, want, got]) => `${k}: 정답 ${want}, 실제 ${got}`);
}
