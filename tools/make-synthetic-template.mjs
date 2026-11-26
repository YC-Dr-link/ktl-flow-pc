// 테스트·시연용 합성 Excel 양식(synthetic/template_synthetic.xlsx)을 만든다. 실제 양식을 읽지 않고 시트 이름 6개와 차트 2개의 뼈대만 직접 쓴다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import config from '../src/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'synthetic/template_synthetic.xlsx');

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CHART = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const TYPE = 'application/vnd.openxmlformats-officedocument';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NOTE = '합성 양식 (테스트·시연용, 실제 양식이 아님)';
const NOTE_CELL = 'AA1'; // 도구가 값을 쓰는 칸(A~J열)과 겹치지 않는 자리
const sheets = config.sheetNames;
const CHART_SHEET = 2; // 차트는 세 번째 시트(sensitive)에 둔다
const ANGLES = config.chartAngleOrder;

// 시트: 표시 한 칸만 두고 비운다. 값 칸은 도구가 만들어 넣는다
const sheetXml = (withDrawing) =>
  `${HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><dimension ref="${NOTE_CELL}"/><sheetData><row r="1"><c r="${NOTE_CELL}" t="s"><v>0</v></c></row></sheetData>${
    withDrawing ? '<drawing r:id="rId1"/>' : ''
  }</worksheet>`;

const numCache = (values) =>
  `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join('')}</c:numCache>`;

// 분산형 차트 하나. 제목(계열 이름 캐시)과 Y 5점 캐시는 도구가 새 값으로 바꾼다. 참조 칸은 차트 시트의 빈 칸(AB~AD열)이다
function chartXml(n) {
  const sheet = `'${sheets[CHART_SHEET]}'`;
  const col = n === 1 ? 'AC' : 'AD';
  const title = `<c:strRef><c:f>${sheet}!$${col}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>0.00</c:v></c:pt></c:strCache></c:strRef>`;
  return `${HEAD}<c:chartSpace xmlns:c="${NS_CHART}" xmlns:a="${NS_A}" xmlns:r="${NS_REL}"><c:chart><c:title><c:tx>${title}</c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:xVal><c:numRef><c:f>${sheet}!$AB$2:$AB$6</c:f>${numCache(
    ANGLES,
  )}</c:numRef></c:xVal><c:yVal><c:numRef><c:f>${sheet}!$${col}$2:$${col}$6</c:f>${numCache(
    ANGLES.map(() => 0),
  )}</c:numRef></c:yVal><c:smooth val="0"/></c:ser><c:axId val="${n}01"/><c:axId val="${n}02"/></c:scatterChart><c:valAx><c:axId val="${n}01"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="${n}02"/></c:valAx><c:valAx><c:axId val="${n}02"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="${n}01"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
}

// 차트 두 개를 시트 오른쪽(L열부터)에 위아래로 놓는다
const anchor = (n, fromRow) =>
  `<xdr:twoCellAnchor><xdr:from><xdr:col>11</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>19</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${
    fromRow + 15
  }</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${n + 1}" name="차트 ${n}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_CHART}"><c:chart xmlns:c="${NS_CHART}" r:id="rId${n}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;

const rels = (items) =>
  `${HEAD}<Relationships xmlns="${NS_PKG_REL}">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${NS_REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`;

const parts = {
  '[Content_Types].xml': `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${TYPE}.spreadsheetml.sheet.main+xml"/>${sheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${TYPE}.spreadsheetml.worksheet+xml"/>`)
    .join(
      '',
    )}<Override PartName="/xl/styles.xml" ContentType="${TYPE}.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${TYPE}.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="${TYPE}.drawing+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="${TYPE}.drawingml.chart+xml"/><Override PartName="/xl/charts/chart2.xml" ContentType="${TYPE}.drawingml.chart+xml"/></Types>`,
  '_rels/.rels': rels([['rId1', 'officeDocument', 'xl/workbook.xml']]),
  'xl/workbook.xml': `${HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${sheets
    .map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': rels([
    ...sheets.map((_, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]),
    [`rId${sheets.length + 1}`, 'styles', 'styles.xml'],
    [`rId${sheets.length + 2}`, 'sharedStrings', 'sharedStrings.xml'],
  ]),
  'xl/styles.xml': `${HEAD}<styleSheet xmlns="${NS_MAIN}"><fonts count="1"><font><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  'xl/sharedStrings.xml': `${HEAD}<sst xmlns="${NS_MAIN}" count="${sheets.length}" uniqueCount="1"><si><t>${esc(NOTE)}</t></si></sst>`,
  [`xl/worksheets/_rels/sheet${CHART_SHEET + 1}.xml.rels`]: rels([['rId1', 'drawing', '../drawings/drawing1.xml']]),
  'xl/drawings/drawing1.xml': `${HEAD}<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}" xmlns:r="${NS_REL}">${anchor(1, 3)}${anchor(2, 20)}</xdr:wsDr>`,
  'xl/drawings/_rels/drawing1.xml.rels': rels([
    ['rId1', 'chart', '../charts/chart1.xml'],
    ['rId2', 'chart', '../charts/chart2.xml'],
  ]),
  'xl/charts/chart1.xml': chartXml(1),
  'xl/charts/chart2.xml': chartXml(2),
};
sheets.forEach((_, i) => {
  parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(i === CHART_SHEET);
});

const zip = new JSZip();
const date = new Date('2026-01-01T00:00:00Z'); // 다시 만들어도 바이트가 같게 시각을 고정한다
for (const [name, text] of Object.entries(parts)) zip.file(name, text, { date, createFolders: false });
const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bytes);
console.log(`${path.relative(root, out)} (${bytes.length} bytes)`);
