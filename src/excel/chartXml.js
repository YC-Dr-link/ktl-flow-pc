// 민감도 차트의 캐시 값(제목 평균 유속, Y 5점)을 새 값으로 바꾼다 (EXCEL_MAPPING 4절)
import { parseXml, toXml } from './sheetXml.js';

const byTag = (el, name) => [...el.getElementsByTagName(name)];

// 캐시 안의 pt idx 값을 바꾼다. 없는 점은 만든다
function setPoint(doc, cache, idx, text) {
  let pt = byTag(cache, 'c:pt').find((p) => p.getAttribute('idx') === String(idx));
  if (!pt) {
    pt = doc.createElement('c:pt');
    pt.setAttribute('idx', String(idx));
    pt.appendChild(doc.createElement('c:v'));
    cache.appendChild(pt);
  }
  const v = byTag(pt, 'c:v')[0];
  while (v.firstChild) v.removeChild(v.firstChild);
  v.appendChild(doc.createTextNode(text));
}

// title: 계열 이름(평균 유속 문자열), yValues: 각도 −10, −5, 0, +5, +10 순서의 그룹 값 5개
export function updateChart(xml, { title, yValues }, titleReference = null) {
  const doc = parseXml(xml);
  if (titleReference) {
    const ref = byTag(byTag(doc, 'c:title')[0], 'c:f')[0];
    if (!ref) throw new Error('양식 차트의 제목 참조 셀을 읽지 못했습니다.');
    ref.textContent = titleReference;
  }
  const titleCache = byTag(byTag(doc, 'c:title')[0], 'c:strCache')[0];
  setPoint(doc, titleCache, 0, title);

  const yCache = byTag(byTag(doc, 'c:yVal')[0], 'c:numCache')[0];
  const count = byTag(yCache, 'c:ptCount')[0];
  if (Number(count.getAttribute('val')) !== yValues.length) throw new Error('차트 Y 점 개수가 양식과 다릅니다.');
  yValues.forEach((y, i) => {
    if (!Number.isFinite(y)) throw new RangeError('차트 값이 유한한 숫자가 아닙니다.');
    setPoint(doc, yCache, i, String(y));
  });
  return toXml(doc);
}
