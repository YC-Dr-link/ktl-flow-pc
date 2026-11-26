// CLAYDOX가 가져갈 주요 셀(시트, 셀, 항목, 형식, 값) 표 (FR-M5-07). 값은 excel/cellValues.js가 만든 값 그대로이고 UI에서 다시 계산하지 않는다
import config from '../config.js';
import { cellValues } from '../excel/cellValues.js';
import { h, clear, table } from './dom.js';

// [시트 번호, 셀, 항목]. 시트 번호는 config.sheetNames의 위치
const KEY_CELLS = [
  [0, 'D2', '의뢰기관(회사명)'],
  [0, 'D3', '접수번호'],
  [0, 'D5', '주소'],
  [0, 'G6', '호기'],
  [0, 'G7', '제작회사'],
  [0, 'D8', '기기번호'],
  [0, 'G8', '모델명'],
  [0, 'D9', '형식승인번호'],
  [0, 'D10', '형식승인일자'],
  [0, 'G10', '최대유속'],
  [0, 'H10', '속도 단위'],
  [0, 'H11', '피토계수'],
  [0, 'D11', '시험일자'],
  [0, 'D12', '종합판정'],
  [0, 'E21', '반복성 ZERO (%)'],
  [0, 'G21', '반복성 SPAN (%)'],
  [0, 'E30', '직선성 30 % (%)'],
  [0, 'G30', '직선성 70 % (%)'],
  [0, 'C35', '민감도 30 % 평균 유속'],
  [0, 'C39', '민감도 70 % 평균 유속'],
  [1, 'J20', '직선성 30 % 평균 오차 (%)'],
  [1, 'J25', '직선성 70 % 평균 오차 (%)'],
  [2, 'J36', '민감도 최대값 (%)'],
];

function show(v) {
  if (v === undefined) return '(양식 그대로)';
  if (v === null || v === '') return '(비움)';
  return typeof v === 'number' ? String(Number(v.toPrecision(10))) : String(v);
}

// analysis: 오류가 없는 analyze() 반환값 / optional: 선택 입력 값
export function renderMapPreview(container, analysis, optional) {
  const values = cellValues(analysis.result, analysis.summaries, optional, config);
  const rows = KEY_CELLS.map(([sheet, cell, label]) => {
    const name = config.sheetNames[sheet];
    const v = values[name][cell];
    return [name, cell, label, typeof v === 'number' ? '숫자' : '문자', h('span', { class: v === undefined ? 'hint' : '' }, show(v))];
  });
  clear(container).append(
    table('주요 셀', [{ label: '시트' }, { label: '셀' }, { label: '항목' }, { label: '형식' }, { label: '값' }], rows),
  );
}
