// 설치방향 민감도 그래프 하나(SVG). 각도 −10~+10 순서로 그룹 값을 점과 선으로 보여주고 기준선을 긋는다
import config from '../config.js';
import { formatRounded } from '../core/round.js';
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const DEFAULT_W = 480; // 처음 그릴 때(아직 폭을 모를 때)의 폭. 붙은 뒤에는 그려진 폭에 맞춰 다시 그린다
const MIN_W = 200;
const H = 272;
const PAD = { l: 44, r: 16, t: 24, b: 48 };

function el(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

// point: '30%' | '70%' / velocity: 지점의 평균 유속 / sens: result.sensitivity
// 글자가 그려진 폭에서도 12px로 보이도록 viewBox 폭을 그려진 폭과 같게 하고, 폭이 바뀌면 다시 그린다 (UIPRO UP-2)
// heading: 그래프 제목 태그 (본문에서는 h4, 모달 안에서는 h3)
export function sensChart(point, velocity, sens, heading = 'h4') {
  const groups = config.chartAngleOrder.map((angle) => sens.by_angle.find((g) => g.angle === angle && g.point === point));
  const crit = sens.criterion_pct;
  // 세로축은 눈금 간격(0.5·1·2·5·10) 6칸 이내로 기준선과 가장 큰 값이 모두 들어오게 잡는다
  const needed = Math.max(crit * 1.15, ...groups.map((g) => g.value_pct * 1.1));
  const step = [0.5, 1, 2, 5, 10, 20, 50].find((s) => Math.ceil(needed / s) <= 6) || 100;
  const ticks = Math.ceil(needed / step);
  const top = ticks * step;
  const inset = 28;
  const title = `${point.replace('%', ' %')} 지점 (평균 유속 ${formatRounded(velocity, 2)} m/s)`;
  const summary = `${title}. ${groups.map((g) => `${g.angle > 0 ? '+' : ''}${g.angle}도 ${formatRounded(g.value_pct, config.displayDecimals)} %`).join(', ')}. 기준 ${crit} % 이하.`;

  const draw = (W) => {
    const x = (i) => PAD.l + inset + (i / (groups.length - 1)) * (W - PAD.l - PAD.r - 2 * inset);
    const y = (v) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': summary });
    svg.append(el('title', {}, summary));
    // 세로축 눈금 5개
    for (let i = 0; i <= ticks; i += 1) {
      const v = step * i;
      svg.append(el('line', { class: 'tick', x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v) }));
      svg.append(el('text', { x: PAD.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, formatRounded(v, 1)));
    }
    svg.append(el('line', { class: 'axis', x1: PAD.l, x2: PAD.l, y1: PAD.t, y2: H - PAD.b }));
    svg.append(el('line', { class: 'crit', x1: PAD.l, x2: W - PAD.r, y1: y(crit), y2: y(crit) }));
    svg.append(el('text', { class: 'crit-label', x: W - PAD.r, y: y(crit) - 4, 'text-anchor': 'end' }, `기준 ${crit} %`));
    svg.append(el('polyline', { class: 'series', points: groups.map((g, i) => `${x(i)},${y(g.value_pct)}`).join(' ') }));
    const maxIdx = groups.reduce((m, g, i) => (g.value_pct > groups[m].value_pct ? i : m), 0);
    groups.forEach((g, i) => {
      svg.append(el('circle', { class: i === maxIdx ? 'dot max' : 'dot', cx: x(i), cy: y(g.value_pct), r: 5 }));
      svg.append(el('text', { class: 'val', x: x(i), y: y(g.value_pct) - 10, 'text-anchor': 'middle' }, formatRounded(g.value_pct, config.displayDecimals)));
      svg.append(el('text', { x: x(i), y: H - PAD.b + 18, 'text-anchor': 'middle' }, `${g.angle > 0 ? '+' : ''}${g.angle}°`));
    });
    svg.append(el('text', { x: (W + PAD.l) / 2, y: H - 6, 'text-anchor': 'middle' }, '설치 각도'));
    svg.append(el('text', { x: PAD.l, y: 17 }, '오차 (%)')); // 12px 글자가 위로 잘리지 않을 높이
    return svg;
  };

  let drawn = DEFAULT_W;
  const figure = h('figure', { class: 'chart' }, h(heading, {}, title), draw(drawn));
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const width = Math.max(MIN_W, Math.floor(figure.querySelector('svg').getBoundingClientRect().width));
      if (!width || width === drawn) return;
      drawn = width;
      figure.querySelector('svg').replaceWith(draw(width));
    }).observe(figure);
  }
  return figure;
}
