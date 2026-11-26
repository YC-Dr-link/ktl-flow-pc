// DOM 요소를 짧게 만드는 도우미. 글자는 textContent로만 넣어 HTML 주입을 막는다
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// 표 하나. columns: [{ label, num }] / rows: [[셀 값…]]
export function table(caption, columns, rows) {
  return h(
    'div',
    { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': caption },
    h(
      'table',
      {},
      h('caption', {}, caption),
      h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col', class: c.num ? 'num' : '' }, c.label)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((v, i) => h('td', { class: columns[i].num ? 'num' : '' }, v))))),
    ),
  );
}
