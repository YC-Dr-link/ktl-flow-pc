import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { analyze } from '../../src/core/analyze.js';
import { buildXlsx } from '../../src/excel/buildXlsx.js';
import { prepareProvenance } from '../../src/excel/provenance.js';
import { loadSample, toList, SYNTHETIC_TEMPLATE_PATH } from '../helpers/fixture.js';
import { openXlsx } from '../helpers/xlsx.js';
import config from '../../src/config.js';
import JSZip from 'jszip';
import { parseXml } from '../../src/excel/sheetXml.js';

const template = fs.readFileSync(SYNTHETIC_TEMPLATE_PATH);
const stamp = '2026-11-26T12:00:00+09:00';
for (const set of ['set_a', 'set_b']) {
  test(`${set}: 원본 6개 해시·raw·확인 이력과 차트 제목을 출력한다`, async () => {
    const files = toList(loadSample(set));
    const analysis = analyze(files);
    const before = files.map(f => createHash('sha256').update(f.bytes).digest('hex'));
    const { bytes } = await buildXlsx(template, analysis.result, analysis.summaries, {}, config, { files, analysis, confirmedAt: stamp });
    const book = await openXlsx(bytes);
    assert.deepEqual(book.sheetNames, [...config.sheetNames, '출처']);
    const source = book.sheets['출처'];
    Object.values(analysis.slots).forEach((slot, i) => {
      assert.equal(source.cell(`A${i + 2}`), files[slot.fileIndex].name);
      assert.equal(source.cell(`B${i + 2}`), before[slot.fileIndex]);
      assert.equal(source.cell(`K${i + 2}`), stamp);
      assert.equal(source.cell(`L${i + 2}`), analysis.result.equipment.receipt_no);
    });
    assert.equal(book.sheets[config.sheetNames[0]].cell('I21'), analysis.result.repeatability.value_pct);
    assert.equal(book.sheets[config.sheetNames[0]].cell('I30'), analysis.result.linearity.value_pct);
    const title = book.sheets.sensitive.cell('AC1');
    assert.match(title, / m\/s$/);
    assert.ok((await book.read('xl/charts/chart1.xml')).includes(title));
    assert.equal(book.sheets[config.sheetNames[4]].cell('M14'), '1');
    assert.equal(book.sheets[config.sheetNames[4]].cell('AJ14'), '1');
    assert.equal(book.sheets[config.sheetNames[5]].cell('M14'), '1');
    assert.deepEqual(files.map(f => createHash('sha256').update(f.bytes).digest('hex')), before);
    // 결과를 다음 양식으로 선택해도 출처 시트가 중복되지 않는다.
    const again = await buildXlsx(bytes, analysis.result, analysis.summaries, {}, config, { files, analysis, confirmedAt: stamp });
    assert.equal((await openXlsx(again.bytes)).sheetNames.filter(n => n === '출처').length, 1);
  });
}

test('수동 배정과 수정한 접수번호를 원본 정보와 함께 기록한다', async () => {
  const files = toList(loadSample());
  const analysis = analyze(files, { assignment: { rep_summary: 0 } });
  const result = { ...analysis.result, equipment: { ...analysis.result.equipment, receipt_no: '26-000001-01-1', company: 'SYNTH-CORRECTED' } };
  const { bytes } = await buildXlsx(template, result, analysis.summaries, {}, config, { files, analysis, confirmedAt: stamp });
  const sheet = (await openXlsx(bytes)).sheets['출처'];
  assert.equal(sheet.cell('E2'), '수동');
  assert.equal(sheet.cell('L2'), '26-000001-01-1');
  assert.equal(sheet.cell('M2'), 'SYNTH-CORRECTED');
  assert.equal(sheet.cell('N2'), analysis.result.equipment.receipt_no);
});

test('확인한 뒤 입력 바이트나 계산 결과가 바뀌면 출처 생성을 거부한다', async () => {
  const files = toList(loadSample());
  const analysis = analyze(files);
  const bad = files.map(f => ({ ...f, bytes: f.bytes.slice() }));
  bad[0].bytes.fill(0);
  await assert.rejects(prepareProvenance(bad, analysis, analysis.result), /바뀌었습니다/);
  const wrong = { ...analysis.result, sensitivity: { ...analysis.result.sensitivity, value_pct: 999 } };
  await assert.rejects(prepareProvenance(files, analysis, wrong), /다릅니다/);
});

test('추가 후보 7개 중 사용한 6개만 출처·원본에 기록한다', async () => {
  for (const manual of [false, true]) {
    const selected = toList(loadSample());
    selected.push(manual ? { ...selected[0], name: 'SYNTH-selected-seventh.csv' } : { name: 'SYNTH-ignored.csv', bytes: new TextEncoder().encode('SYNTH ignored') });
    const analysis = analyze(selected, manual ? { assignment: { rep_summary: 6 } } : {});
    assert.ok(analysis.result);
    const { bytes } = await buildXlsx(template, analysis.result, analysis.summaries, {}, config, { files: selected, analysis, confirmedAt: stamp });
    const book = await openXlsx(bytes), provenance = book.sheets['출처'];
    assert.equal(provenance.cell('A2'), manual ? selected[6].name : selected[0].name);
    assert.equal(provenance.cell('A8'), null);
    assert.equal(provenance.cell('B2'), createHash('sha256').update(selected[manual ? 6 : 0].bytes).digest('hex'));
  }
});

test('접두사가 있는 workbook·관계 XML에서도 출처를 만들고 재사용한다', async () => {
  const zip = await JSZip.loadAsync(template);
  for (const [part, prefix, names, ns] of [
    ['xl/workbook.xml', 'x', 'workbook|workbookPr|sheets|sheet', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'],
    ['xl/_rels/workbook.xml.rels', 'p', 'Relationships|Relationship', 'http://schemas.openxmlformats.org/package/2006/relationships'],
  ]) {
    const xml = (await zip.file(part).async('string'))
      .replace(new RegExp(`(<[/]?)(${names})(?=[\\s/>])`, 'g'), `$1${prefix}:$2`)
      .replace(new RegExp(`<${prefix}:([^ >]+)`), `<${prefix}:$1 xmlns:${prefix}="${ns}"`);
    zip.file(part, xml);
  }
  const files = toList(loadSample()), analysis = analyze(files);
  let bytes = await zip.generateAsync({ type: 'uint8array' });
  for (let i = 0; i < 2; i++) {
    ({ bytes } = await buildXlsx(bytes, analysis.result, analysis.summaries, {}, config, { files, analysis, confirmedAt: stamp }));
    const book = await JSZip.loadAsync(bytes);
    const wb = parseXml(await book.file('xl/workbook.xml').async('string'));
    const sheets = [...wb.getElementsByTagNameNS('*', 'sheet')];
    assert.equal(sheets.filter(s => s.getAttribute('name') === '출처').length, 1);
    assert.equal(sheets.length, 7);
    const rels = parseXml(await book.file('xl/_rels/workbook.xml.rels').async('string'));
    assert.equal([...rels.getElementsByTagNameNS('*', 'Relationship')].filter(r => r.getAttribute('Id') === sheets.at(-1).getAttribute('r:id')).length, 1);
  }
});
