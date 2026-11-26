import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import { checkTemplate, buildXlsx } from '../../src/excel/buildXlsx.js';
import { readPreviousGeneral } from '../../src/excel/readPrevious.js';
import { loadWorkbook, WORKBOOK_LIMITS } from '../../src/excel/workbookSafety.js';
import { analyze } from '../../src/core/analyze.js';
import { loadSample, toList, SYNTHETIC_TEMPLATE_PATH } from '../helpers/fixture.js';
const original = fs.readFileSync(SYNTHETIC_TEMPLATE_PATH);
const originalHash = original.toString('base64');
const a = analyze(toList(loadSample()));
async function altered(change) {
  const zip = await JSZip.loadAsync(original);
  await change(zip);
  return zip.generateAsync({ type: 'uint8array' });
}
for (const prefix of ['', 'r:']) {
  test(`외부 관계를 거부한다 (${prefix || '기본 namespace'})`, async () => {
    const bytes = await altered(zip => zip.file('xl/_rels/audit.rels',
      `<${prefix}Relationships xmlns${prefix ? ':r' : ''}="http://schemas.openxmlformats.org/package/2006/relationships"><${prefix}Relationship Id="x" Type="x" Target="https://example.invalid/" TargetMode="External"/></${prefix}Relationships>`));
    await assert.rejects(checkTemplate(bytes), /외부 파일/);
    await assert.rejects(buildXlsx(bytes, a.result, a.summaries), /외부 파일/);
  });
}
for (const part of ['xl/vbaProject.bin', 'xl/activeX/activeX1.bin', 'xl/embeddings/oleObject1.bin', 'xl/externalLinks/externalLink1.xml']) {
  test(`활성 콘텐츠를 거부한다: ${part}`, async () => {
    const bytes = await altered(zip => zip.file(part, 'SYNTHETIC'));
    await assert.rejects(checkTemplate(bytes), /활성 콘텐츠/);
  });
}
test('외부 수식은 거부하고 수식처럼 생긴 문자열은 허용한다', async () => {
  const formula = await altered(async zip => {
    const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
    zip.file('xl/worksheets/sheet1.xml', xml.replace('</sheetData>', '<row r="99"><c r="Z99"><f>HYPERLINK("https://example.invalid/","SYNTH")</f></c></row></sheetData>'));
  });
  await assert.rejects(checkTemplate(formula), /외부 연결 수식/);
  const text = await altered(async zip => {
    const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
    zip.file('xl/worksheets/sheet1.xml', xml.replace('</sheetData>', '<row r="99"><c r="Z99" t="inlineStr"><is><t>HYPERLINK("SYNTH")</t></is></c></row></sheetData>'));
  });
  await checkTemplate(text);
});
test('작년 xlsm은 매크로를 실행하거나 복사하지 않고 값만 읽는다', async () => {
  const macro = await altered(zip => zip.file('xl/vbaProject.bin', 'SYNTHETIC-NOT-EXECUTED'));
  await readPreviousGeneral(macro);
  assert.equal(original.toString('base64'), originalHash);
});
test('입력과 해제 용량 상한 및 XML 엔티티를 검사한다', async () => {
  await assert.rejects(loadWorkbook(new Uint8Array(WORKBOOK_LIMITS.compressed + 1)), /25 MB/);
  const large = await altered(zip => zip.file('xl/large.xml', 'x'.repeat(WORKBOOK_LIMITS.xml + 1)));
  await assert.rejects(checkTemplate(large), /너무 큽니다/);
  const entity = await altered(zip => zip.file('xl/audit.xml', '<!DOCTYPE x [<!ENTITY y "SYNTH">]><x/>'));
  await assert.rejects(checkTemplate(entity), /XML 선언/);
});
