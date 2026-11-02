/* Unified six-sheet exporter, ktl-hub docs/02 §5. Browser/Node, no DOM or network. */
(function (root, factory) {
  const pack = typeof module === 'object' && module.exports ? require('./xlsx-package.js') : root.KtlXlsxPackage;
  const api = factory(pack);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KtlExcel = api;
})(globalThis, function (pack) {
  'use strict';
  const SHEETS = Object.freeze(['일반사항', '반복직선성', '민감도', '구조확인', 'raw data', '출처']);
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const KINDS = ['repeatability', 'linearity', 'sensitivity'];
  class ExportError extends Error {
    constructor(code, message) { super(message); this.name = 'ExportError'; this.code = code; }
  }
  function fail(code, message) { throw new ExportError(code, message); }
  function text(value) {
    const result = value == null ? '' : String(value);
    if (result.length > 32767 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\ud800-\udfff]/u.test(result)) fail('INVALID_TEXT', 'Excel에 쓸 수 없는 문자 또는 너무 긴 값이 있습니다.');
    return result;
  }
  const escape = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;').replace(/"/g, '&quot;');
  function numeric(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_NUMBER', '출력할 계산값은 유한한 숫자여야 합니다.');
    return value;
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail('INVALID_TIME', '시각은 오프셋이 있는 ISO 8601 형식이어야 합니다.');
    return value;
  }
  function localTime() {
    const now = new Date(), minutes = -now.getTimezoneOffset();
    const offset = `${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
    return new Date(now.getTime() + minutes * 60000).toISOString().slice(0, -1) + offset;
  }
  function csv(bytes) {
    let value;
    try { value = new TextDecoder('euc-kr', { fatal: true }).decode(bytes); }
    catch { fail('INVALID_CSV', 'cp949 원본을 읽을 수 없습니다.'); }
    const rows = [], row = []; let cell = '', quoted = false, closed = false;
    function field() { row.push(text(cell)); cell = ''; closed = false; }
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (quoted) {
        if (c === '"' && value[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') { quoted = false; closed = true; } else cell += c;
      } else if (c === ',') field();
      else if (c === '\n' || c === '\r') {
        field(); rows.push(row.splice(0)); if (c === '\r' && value[i + 1] === '\n') i++;
      } else if (c === '"' && !cell && !closed) quoted = true;
      else { if (closed || c === '"') fail('INVALID_CSV', 'CSV 따옴표 형식을 확인하세요.'); cell += c; }
    }
    if (quoted) fail('INVALID_CSV', 'CSV 따옴표가 닫히지 않았습니다.');
    if (cell || row.length || closed) { field(); rows.push(row); }
    return rows;
  }
  async function sha256(bytes) {
    if (!globalThis.crypto?.subtle) fail('HASH_UNAVAILABLE', '이 브라우저에서 SHA-256을 사용할 수 없습니다.');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  }
  function column(index) {
    let value = '';
    for (; index > 0; index = Math.floor((index - 1) / 26)) value = String.fromCharCode(65 + (index - 1) % 26) + value;
    return value;
  }
  async function prepare(input) {
    /* Snapshot before awaiting hashes, so a caller cannot change bytes after review. */
    if (!input || !Array.isArray(input.files) || input.files.length !== 6) fail('FILE_COUNT', '입력 원본은 6개여야 합니다.');
    const snapshot = data => JSON.parse(JSON.stringify(data, (_, value) => { if (typeof value === 'number') numeric(value); return value; }));
    const metadata = snapshot(input.metadata ?? {});
    const result = snapshot(input.results ?? {});
    const toolVersion = text(input.toolVersion);
    if (!toolVersion.trim()) fail('INVALID_VERSION', '도구 버전이 필요합니다.');
    if (!/^\d{2}-\d{6}-\d{2}$/.test(metadata.receiptNo ?? '') || !Number.isSafeInteger(metadata.detailNo) || metadata.detailNo < 1) fail('INVALID_RECEIPT', '접수번호와 세부 번호를 확인하세요.');
    if (numeric(metadata.maximum) <= 0) fail('INVALID_NUMBER', '최대 유속은 0보다 커야 합니다.');
    const pairs = new Set();
    const files = input.files.map(file => {
      const key = `${file.kind}/${file.role}`;
      if (!KINDS.includes(file.kind) || !['result', 'source'].includes(file.role) || pairs.has(key)) fail('FILE_ASSIGNMENT', '파일 종류 배정에 누락 또는 중복이 있습니다.');
      pairs.add(key);
      if (!(file.bytes instanceof Uint8Array) || file.bytes.length > 5 * 1024 * 1024) fail('INVALID_FILE', '원본 바이트가 없거나 파일이 5 MB를 넘습니다.');
      if (!text(file.name).trim()) fail('INVALID_FILE', '원본 파일명이 필요합니다.');
      const bytes = new Uint8Array(file.bytes), rows = csv(bytes), source = file.role === 'source';
      const count = (file.kind === 'sensitivity' ? 30 : 10) * (source ? 5 : 1);
      if (rows.length !== count + 13 || rows.some(row => row.length !== (source ? 10 : 11))) fail('CSV_SHAPE', 'CSV 행·칼럼 수를 확인하세요.');
      const label = rows[11][0].replace(/\s/g, '');
      if (label !== (source ? '시험번호' : '저장번호')) fail('FILE_ASSIGNMENT', '배정한 결과/source와 파일 내용이 다릅니다.');
      return { name: text(file.name), kind: file.kind, role: file.role, manual: file.manual === true, bytes, rows };
    }).sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || (a.role === 'result' ? -1 : 1));
    if (!['max_absolute', 'signed_mean'].includes(result.linearity?.method) || result.sensitivity?.groups?.length !== 10) fail('INVALID_RESULT', '계산 결과 또는 직선성 정의가 없습니다.');
    [result.repeatability?.zero?.percent, result.repeatability?.span?.percent, result.linearity?.low?.selected,
     result.linearity?.high?.selected, result.sensitivity?.percent].forEach(numeric);
    result.sensitivity.groups.forEach(group => [group.angleDeg, group.rangePct, group.meanErrorPct, group.absoluteMeanPct].forEach(numeric));
    for (const file of files) file.sha256 = await sha256(file.bytes);
    const reviewKey = await sha256(new TextEncoder().encode(JSON.stringify({ metadata, result, toolVersion,
      files: files.map(({ name, kind, role, manual, sha256 }) => ({ name, kind, role, manual, sha256 })) })));
    return { metadata, result, toolVersion, files, reviewKey };
  }
  async function preview(input) {
    const value = await prepare(input);
    return { reviewKey: value.reviewKey, fileName: `${value.metadata.receiptNo}-${value.metadata.detailNo}_유속계.xlsx`,
             files: value.files.map(({ name, kind, role, sha256 }) => ({ name, kind, role, sha256 })) };
  }
  function worksheet(rows, { raw = false, provenance = false } = {}) {
    const width = Math.max(1, ...rows.map(row => row.length));
    const cols = provenance ? '<col min="1" max="1" width="36" customWidth="1"/><col min="2" max="2" width="70" customWidth="1"/><col min="3" max="13" width="26" customWidth="1"/>' : `<col min="1" max="${width}" width="${raw ? 20 : 26}" customWidth="1"/>`;
    const data = rows.map((row, index) => `<row r="${index + 1}">${row.map((value, cell) => {
      if (value == null || value === '') return '';
      const address = `${column(cell + 1)}${index + 1}`;
      if (typeof value === 'number') return `<c r="${address}" s="2"><v>${numeric(value)}</v></c>`;
      return `<c r="${address}" t="inlineStr" s="${!raw && index === 0 ? 1 : 0}"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
    }).join('')}</row>`).join('');
    return XML + `<worksheet xmlns="${NS}"><dimension ref="A1:${column(width)}${Math.max(1, rows.length)}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${cols}</cols><sheetData>${data}</sheetData></worksheet>`;
  }
  async function build(input, confirmation, options = {}) {
    const value = await prepare(input), { metadata: m, result: r, files } = value;
    if (confirmation?.reviewKey !== value.reviewKey || !text(confirmation?.confirmedBy).trim()) fail('UNCONFIRMED', '시험자 확인이 필요하거나 확인 이후 입력·계산이 변경되었습니다.');
    const confirmedAt = date(confirmation.confirmedAt), generatedAt = date(options.generatedAt ?? localTime());
    const general = [['항목', '값'], ['접수번호', m.receiptNo], ['업체', m.company], ['모델', m.model],
      ['제조번호', m.serial], ['형식승인번호', m.approvalNo], ['최대 측정범위', m.maximum],
      ['시험일', m.testDate], ['시험자', m.tester], []];
    for (const [key, label] of [['pressure', '대기압'], ['temperature', '온도'], ['humidity', '습도']])
      for (const [stat, suffix] of [['min', '최소'], ['max', '최대'], ['mean', '평균']]) {
        const number = m.environment?.[key]?.[stat];
        general.push([`${label} ${suffix}`, number == null ? '' : numeric(number)]);
      }
    const repeat = [['항목', '값', '단위'], ['반복성 ZERO', r.repeatability.zero.percent, '%'],
      ['반복성 SPAN', r.repeatability.span.percent, '%'], ['직선성 30%', r.linearity.low.selected, '%'],
      ['직선성 70%', r.linearity.high.selected, '%'], ['직선성 정의', r.linearity.method === 'max_absolute' ? '최대 상대오차 절댓값' : '평균 상대오차(부호 유지)'],
      ['반복성 기준', 2, '%'], ['직선성 기준', 5, '%'], [], ['반복성 원 값'],
      ...files.find(f => f.kind === 'repeatability' && f.role === 'result').rows.slice(11), [], ['직선성 원 값'],
      ...files.find(f => f.kind === 'linearity' && f.role === 'result').rows.slice(11)];
    const sensitivity = [['각도(°)', '범위(%)', '평균 오차(%)', '절댓값(%)'],
      ...r.sensitivity.groups.map(g => [g.angleDeg, g.rangePct, g.meanErrorPct, g.absoluteMeanPct]), [],
      ['민감도 최댓값', r.sensitivity.percent, '%'], ['민감도 기준', 4, '%'], [], ['민감도 원 값'],
      ...files.find(f => f.kind === 'sensitivity' && f.role === 'result').rows.slice(11)];
    const raw = [], sources = [['입력 파일명', 'SHA-256', '판별 종류', '결과/source', '도구 버전', '생성 시각',
      '배정 방식', 'raw 시작 열', '시험자 확인자', '확인 시각']];
    let start = 0;
    for (const file of files) {
      file.rows.forEach((row, index) => { raw[index] ??= []; row.forEach((cell, offset) => { raw[index][start + offset] = cell; }); });
      sources.push([file.name, file.sha256, ['반복성', '직선성', '설치방향 민감도'][KINDS.indexOf(file.kind)], file.role === 'result' ? '결과' : 'source', value.toolVersion, generatedAt,
        file.manual ? '수동 지정' : '내용 판별', column(start + 1), confirmation.confirmedBy, confirmedAt]);
      start += file.rows[11].length + 1;
    }
    const entries = {}, sheetRows = [general, repeat, sensitivity, [], raw, sources];
    sheetRows.forEach((rows, index) => { entries[`xl/worksheets/sheet${index + 1}.xml`] = worksheet(rows, { raw: index === 4, provenance: index === 5 }); });
    entries['xl/workbook.xml'] = XML + `<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>${SHEETS.map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
    const relationship = (id, type, target) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`;
    entries['xl/_rels/workbook.xml.rels'] = XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${SHEETS.map((_, i) => relationship(`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`)).join('')}${relationship('styles', 'styles', 'styles.xml')}</Relationships>`;
    entries['_rels/.rels'] = XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationship('workbook', 'officeDocument', 'xl/workbook.xml')}<Relationship Id="core" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
    entries['docProps/core.xml'] = XML + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>KTL flow PC</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${escape(new Date(generatedAt).toISOString())}</dcterms:created></cp:coreProperties>`;
    entries['xl/styles.xml'] = XML + `<styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1B64DA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const override = (part, type) => `<Override PartName="/${part}" ContentType="application/vnd.${type}"/>`;
    entries['[Content_Types].xml'] = XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${override('xl/workbook.xml', 'openxmlformats-officedocument.spreadsheetml.sheet.main+xml')}${override('xl/styles.xml', 'openxmlformats-officedocument.spreadsheetml.styles+xml')}${override('docProps/core.xml', 'openxmlformats-package.core-properties+xml')}${SHEETS.map((_, i) => override(`xl/worksheets/sheet${i + 1}.xml`, 'openxmlformats-officedocument.spreadsheetml.worksheet+xml')).join('')}</Types>`;
    return { fileName: `${m.receiptNo}-${m.detailNo}_유속계.xlsx`, suggestedDirectory: m.receiptNo,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: pack.zip(entries) };
  }
  async function saveToDirectory(rootHandle, input, confirmation, options = {}) {
    const workbook = await build(input, confirmation, options);
    if (typeof rootHandle?.getDirectoryHandle !== 'function') fail('SAVE_FAILED', '저장할 폴더를 먼저 선택하세요.');
    let writable;
    try {
      const directory = await rootHandle.getDirectoryHandle(workbook.suggestedDirectory, { create: true });
      try {
        await directory.getFileHandle(workbook.fileName);
        if (options.overwrite !== true) fail('FILE_EXISTS', '같은 이름의 파일이 있습니다. 덮어쓰기 여부를 확인하세요.');
      } catch (error) { if (error.name !== 'NotFoundError') throw error; }
      const file = await directory.getFileHandle(workbook.fileName, { create: true });
      writable = await file.createWritable();
      await writable.write(workbook.bytes); await writable.close();
      return { fileName: workbook.fileName, directory: workbook.suggestedDirectory };
    } catch (error) {
      if (writable) { try { await writable.abort(); } catch { /* Already closed or aborted. */ } }
      if (error instanceof ExportError) throw error;
      fail('SAVE_FAILED', 'Excel을 저장하지 못했습니다. 폴더 권한과 남은 공간을 확인하세요.');
    }
  }
  return Object.freeze({ SHEETS, ExportError, preview, build, saveToDirectory });
});
