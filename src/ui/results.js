// 결과 화면. 장비 정보(두 묶음), 항목별 표시값·계산값·판정, 종합판정, 모달 버튼 세 개를 보여준다. 그래프·환경 조건(renderGraphEnv)과 계산에 쓴 행(renderUsedRows)은 모달 본문이다 (계산은 하지 않고 core 결과만 그대로 표시)
import config from '../config.js';
import { formatRounded } from '../core/round.js';
import { h, clear, table } from './dom.js';
import { sensChart } from './sensChart.js';
import { noticeList } from './noticeList.js';

const f = (v, d) => formatRounded(v, d);
const detail = (v) => f(v, config.detailDecimals);
const signed = (n) => `${n > 0 ? '+' : ''}${n}°`;
const spaced = (point) => point.replace('%', ' %');
const badge = (judgement) => h('span', { class: `badge ${judgement === '적합' ? 'fill-ok' : 'fill-fail'}` }, judgement);

function itemCard(id, title, item, extra) {
  return h(
    'section',
    { class: `card ${item.judgement === '적합' ? 'ok' : 'fail'}`, 'aria-labelledby': id }, // 칸 색은 판정을 따른다 (FR-M4-14)
    h('div', { class: 'card-head' }, h('h4', { id }, title), badge(item.judgement)),
    h('p', { class: 'cap' }, '표시값'),
    h('div', { class: 'val-row' }, h('p', { class: 'big' }, item.display, h('small', {}, '%')), h('span', { class: 'limit' }, `기준 ${item.criterion_pct} % 이하`)),
    h('dl', {}, h('dt', {}, '계산값'), h('dd', {}, `${item.detail} %`), extra),
  );
}

// 장비 정보 두 묶음 (FR-M4-12): 장비 → 접수, 묶음 안 순서는 SPEC 그대로
function equipment(eq) {
  const groups = [
    ['장비', [['모델명', eq.model], ['기기번호', eq.serial], ['최대유속', `${eq.max_velocity} m/s`], ['기기 종류', eq.instrument_kind]]],
    ['접수', [['접수번호', eq.receipt_no], ['의뢰기관', eq.company], ['주소', eq.address], ['시험일자', eq.test_date]]],
  ];
  return h(
    'div',
    { class: 'equip-groups' },
    groups.map(([name, rows], i) =>
      h(
        'section',
        { class: 'equip-group', 'aria-labelledby': `equip-h${i}` },
        h('h4', { id: `equip-h${i}` }, name),
        h('dl', { class: 'equip' }, rows.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v || '-')))),
      ),
    ),
  );
}

// 요약 CSV에 적힌 값을 그대로 보여준다 (다시 계산하지 않음)
function usedRows(result, summaries) {
  const { repeatability: rep, linearity: lin, sensitivity: sen } = result;
  const repRows = summaries.repeatability.data.map((d, i) => [
    i + 1,
    rep.rows.zero.includes(i + 1) ? 'ZERO' : rep.rows.span.includes(i + 1) ? 'SPAN' : '-',
    d.cells[1],
    d.cells[2],
  ]);
  const linRows = summaries.linearity.data.map((d, i) => [
    i + 1,
    lin.rows.p30.includes(i + 1) ? '30 %' : lin.rows.p70.includes(i + 1) ? '70 %' : '-',
    d.cells[1],
    d.cells[2],
    d.cells[8],
  ]);
  const senRows = sen.by_angle.map((g) => [signed(g.angle), spaced(g.point), `${g.rows[0]}~${g.rows[1]}`, detail(g.value_pct)]);
  return [
    table('반복성: 요약 CSV 값', [{ label: '데이터 행', num: true }, { label: '구분' }, { label: '기준 유속', num: true }, { label: '측정 유속', num: true }], repRows),
    table(
      '직선성: 요약 CSV 값',
      [{ label: '데이터 행', num: true }, { label: '지점' }, { label: '기준 유속', num: true }, { label: '측정 유속', num: true }, { label: 'CSV 오차 열', num: true }],
      linRows,
    ),
    table('설치방향 민감도: 그룹별 값 (그룹 하나는 요약 CSV 3행)', [{ label: '각도', num: true }, { label: '지점' }, { label: '데이터 행', num: true }, { label: '그룹 값 (%)', num: true }], senRows),
  ];
}

// 그래프·환경 조건 모달의 본문 (FR-M4-13). 모달 제목이 소제목을 대신하므로 그래프 제목은 h3
export function renderGraphEnv(container, analysis) {
  const { sensitivity: sen, environment: env } = analysis.result;
  clear(container).append(
    h('div', { class: 'charts' }, sensChart('30%', sen.velocity_30, sen, 'h3'), sensChart('70%', sen.velocity_70, sen, 'h3')),
    h('h3', {}, '시험 환경 조건'),
    table(
      '요약 CSV 50행 전체의 최소·최대·중간값',
      [{ label: '항목' }, { label: '최소', num: true }, { label: '최대', num: true }, { label: '중간값', num: true }],
      [
        ['대기압 (hPa)', env.pressure_hpa],
        ['온도 (℃)', env.temperature_c],
        ['습도 (%)', env.humidity_pct],
      ].map(([name, s]) => [name, f(s.min, 2), f(s.max, 2), f(s.mid, 2)]),
    ),
  );
}

// 계산에 쓴 행 모달의 본문 (FR-M4-15). 표 3개를 예전 본문 접힘 영역과 같은 내용·순서로 보여준다
export function renderUsedRows(container, analysis) {
  clear(container).append(...usedRows(analysis.result, analysis.summaries));
}

// analysis: 오류가 없는 analyze() 반환값
export function renderResult(container, analysis) {
  const { result, warnings, notices } = analysis;
  const { repeatability: rep, linearity: lin, sensitivity: sen } = result;
  clear(container);

  container.append(
    h(
      'div',
      { class: `verdict-bar${result.overall === '적합' ? '' : ' fail'}`, id: 'overall' },
      '종합판정',
      badge(result.overall),
      h('span', { class: 'aside' }, `현장적용계수: ${result.field_coefficient}`),
    ),
    ...[noticeList('warn', '경고', warnings, ' (계산은 했습니다)'), noticeList('', '알림', notices, ' (결과에는 쓰이지 않은 파일이 있을 수 있습니다)')]
      .filter(Boolean)
      .map((box) => h('div', { class: 'after-verdict' }, box)),
    h('div', { class: 'sec-head' }, h('h3', {}, '성능 판정')),
    h(
      'div',
      { class: 'grid3', id: 'resultCards' },
      itemCard('card-rep', '반복성', rep, [h('dt', {}, 'ZERO'), h('dd', {}, `${detail(rep.zero_pct)} %`), h('dt', {}, 'SPAN'), h('dd', {}, `${detail(rep.span_pct)} %`)]),
      itemCard('card-lin', '직선성', lin, [h('dt', {}, '30 %'), h('dd', {}, `${detail(lin.p30_pct)} %`), h('dt', {}, '70 %'), h('dd', {}, `${detail(lin.p70_pct)} %`)]),
      itemCard('card-sen', '설치방향 민감도', sen, [h('dt', {}, '최대 그룹'), h('dd', {}, `${signed(sen.max_group.angle)} / ${spaced(sen.max_group.point)}`)]),
    ),
    h('h3', {}, '장비 정보'),
    equipment(result.equipment),
    // 모달 버튼 세 개: 장비 정보 두 묶음 바로 아래 한 줄 (FR-M4-15, AC-14)
    h(
      'div',
      { class: 'modal-btns' },
      h('button', { type: 'button', class: 'btn weak', id: 'graphBtn', dataset: { modal: 'graph' } }, '설치 방향 및 민감도 그래프, 시험 환경 조건'),
      h('button', { type: 'button', class: 'btn weak', id: 'cellsBtn', dataset: { modal: 'cells' } }, 'CLAYDOX가 가져갈 주요 셀'),
      h('button', { type: 'button', class: 'btn weak', id: 'rowsBtn', dataset: { modal: 'rows' } }, '계산에 쓴 행'),
    ),
  );
}
