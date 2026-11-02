/* Add editable Excel XY charts to the unified workbook without changing original values. */
(function (root, factory) {
  const pack = typeof module === 'object' && module.exports ? require('./chart-package.js') : root.KtlChartPackage;
  const api = factory(pack);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KtlSensitivityCharts = api;
})(globalThis, function (pack) {
  'use strict';
  const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const X = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  class ChartError extends Error {
    constructor(code, message) { super(message); this.name = 'ChartError'; this.code = code; }
  }
  function fail(code, message) { throw new ChartError(code, message); }
  function read(entries, name) {
    if (!entries[name]) fail('INVALID_WORKBOOK', '통일 Excel의 필수 파일이 없습니다.');
    return new TextDecoder('utf-8', { fatal: true }).decode(entries[name]);
  }
  function value(sheet, address) {
    const match = sheet.match(new RegExp(`<c\\b[^>]*\\br="${address}"[^>]*>\\s*<v>([^<]+)</v>\\s*</c>`));
    const number = match && match[1].trim() !== '' ? Number(match[1]) : NaN;
    if (!Number.isFinite(number)) fail('INVALID_DATA', '민감도 그래프의 각도·범위·오차를 확인하세요.');
    return number;
  }
  function title(text) {
    return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ko-KR"/><a:t>${text}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
  }
  function reference(formula, values) {
    return `<c:numRef><c:f>${formula}</c:f><c:numCache><c:formatCode>0.000</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v,i)=>`<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`;
  }
  function chart(level, angles, values, bound) {
    const color = level === 30 ? '1B64DA' : '027648', yColumn = level === 30 ? 'AB' : 'AC';
    const axis = (id, cross, position, label, minimum, maximum, unit) => `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/><c:max val="${maximum}"/><c:min val="${minimum}"/></c:scaling><c:delete val="0"/><c:axPos val="${position}"/>${title(label)}<c:numFmt formatCode="${position === 'b' ? '0' : '0.0'}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/>${unit ? '<c:majorUnit val="5"/>' : ''}</c:valAx>`;
    return XML + `<c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${R}"><c:lang val="ko-KR"/><c:chart>${title(`설치방향 민감도 · ${level}%`)}<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${level}% 평균 오차</c:v></c:tx><c:spPr><a:ln w="25400"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/></c:marker><c:xVal>${reference("'민감도'!$AA$2:$AA$6", angles)}</c:xVal><c:yVal>${reference(`'민감도'!$${yColumn}$2:$${yColumn}$6`, values)}</c:yVal><c:smooth val="0"/></c:ser><c:axId val="100"/><c:axId val="200"/></c:scatterChart>${axis(100,200,'b','설치 각도(°)',-10,10,true)}${axis(200,100,'l','평균 오차(%)',-bound,bound,false)}</c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="D1D6DB"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
  }
  function drawing() {
    return XML + `<xdr:wsDr xmlns:xdr="${X}" xmlns:a="${A}">${[0,4].map((column,i)=>`<xdr:oneCellAnchor><xdr:from><xdr:col>${column}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>50</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="5334000" cy="3143250"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i+2}" name="민감도 ${i===0?30:70}%"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${C}"><c:chart xmlns:c="${C}" xmlns:r="${R}" r:id="rId${i+1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`).join('')}</xdr:wsDr>`;
  }
  function add(workbook) {
    let entries;
    try { entries = pack.unzip(workbook?.bytes); }
    catch { fail('INVALID_WORKBOOK', '이 도구가 생성한 ZIP STORE 형식의 Excel이 필요합니다.'); }
    if (!/name="민감도" sheetId="3"/.test(read(entries,'xl/workbook.xml'))) fail('INVALID_WORKBOOK', '공동 계약의 민감도 시트를 찾을 수 없습니다.');
    if (entries['xl/drawings/drawing1.xml'] || entries['xl/charts/chart1.xml'] || entries['xl/worksheets/_rels/sheet3.xml.rels']) fail('ALREADY_CHARTED', '이미 그래프가 있거나 드로잉을 사용 중인 파일입니다.');
    let sheet = read(entries,'xl/worksheets/sheet3.xml');
    if (/<drawing\b/.test(sheet) || /r="A[ABC][1-6]"/.test(sheet)) fail('ALREADY_CHARTED', '민감도 그래프 영역이 이미 사용 중입니다.');
    const groups = Array.from({length:10},(_,i)=>({angle:value(sheet,`A${i+2}`),range:value(sheet,`B${i+2}`),error:value(sheet,`C${i+2}`)}));
    const angles = [-10,-5,0,5,10], series = [30,70].map(range=>angles.map(angle=>{
      const matches = groups.filter(g=>g.angle===angle && g.range===range);
      if(matches.length!==1) fail('INVALID_DATA', '각도 5개와 30%·70% 범위의 조합이 필요합니다.');
      return matches[0].error;
    }));
    const bound = Math.max(1,...groups.map(g=>Math.ceil(Math.abs(g.error)*1.25)));
    if(!Number.isFinite(bound)) fail('INVALID_DATA', '그래프 축 범위를 초과했습니다.');
    const headers = ['설치 각도(°)','30% 평균 오차(%)','70% 평균 오차(%)'];
    for(let row=1;row<=6;row++) {
      const cells = ['AA','AB','AC'].map((col,i)=>row===1 ? `<c r="${col}1" t="inlineStr" s="1"><is><t>${headers[i]}</t></is></c>` : `<c r="${col}${row}" s="2">${i===0?'':`<f>C${groups.findIndex(g=>g.angle===angles[row-2] && g.range===(i===1?30:70))+2}</f>`}<v>${i===0?angles[row-2]:series[i-1][row-2]}</v></c>`).join('');
      const pattern = new RegExp(`(<row r="${row}"[^>]*>)([\\s\\S]*?)(</row>)`);
      if(!pattern.test(sheet)) fail('INVALID_WORKBOOK','민감도 데이터 행이 없습니다.');
      sheet=sheet.replace(pattern,(_,start,content,end)=>start+content+cells+end);
    }
    sheet=sheet.replace(/<dimension ref="[^"]+"\/>/,(_,__)=>`<dimension ref="A1:AC${Math.max(51,...Array.from(sheet.matchAll(/<row r="(\d+)"/g),m=>Number(m[1]))) }"/>`);
    sheet=sheet.replace('</cols>','<col min="27" max="29" width="26" customWidth="1"/></cols>');
    if(!/xmlns:r=/.test(sheet)) sheet=sheet.replace('<worksheet ',`<worksheet xmlns:r="${R}" `);
    entries['xl/worksheets/sheet3.xml']=sheet.replace('</worksheet>','<drawing r:id="rIdSensitivityCharts"/></worksheet>');
    const relationships = content=>XML+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${content}</Relationships>`;
    entries['xl/worksheets/_rels/sheet3.xml.rels']=relationships(`<Relationship Id="rIdSensitivityCharts" Type="${R}/drawing" Target="../drawings/drawing1.xml"/>`);
    entries['xl/drawings/drawing1.xml']=drawing();
    entries['xl/drawings/_rels/drawing1.xml.rels']=relationships([1,2].map(i=>`<Relationship Id="rId${i}" Type="${R}/chart" Target="../charts/chart${i}.xml"/>`).join(''));
    [30,70].forEach((level,i)=>{entries[`xl/charts/chart${i+1}.xml`]=chart(level,angles,series[i],bound);});
    if(!read(entries,'[Content_Types].xml').includes('</Types>')) fail('INVALID_WORKBOOK','Excel 형식 정보를 확인하세요.');
    const overrides=[['/xl/drawings/drawing1.xml','drawing+xml'],['/xl/charts/chart1.xml','drawingml.chart+xml'],['/xl/charts/chart2.xml','drawingml.chart+xml']].map(([part,type])=>`<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}"/>`).join('');
    entries['[Content_Types].xml']=read(entries,'[Content_Types].xml').replace('</Types>',overrides+'</Types>');
    return {...workbook,bytes:pack.zip(entries)};
  }
  return Object.freeze({ChartError,add});
});
