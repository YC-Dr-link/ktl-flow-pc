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

test('다른 경로에 넣은 Excel 4 매크로도 관계·콘텐츠 형식으로 거부한다', async () => {
  const bytes = await altered(async zip => {
    const xml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    zip.file('xl/_rels/workbook.xml.rels', xml.replace('</Relationships>', '<Relationship Id="macro" Type="http://schemas.microsoft.com/office/2006/relationships/xlMacrosheet" Target="odd.xml"/></Relationships>'));
    zip.file('xl/odd.xml', '<worksheet/>');
  });
  await assert.rejects(checkTemplate(bytes), /활성 콘텐츠/);
  const types = await altered(async zip => {
    zip.file('[Content_Types].xml', (await zip.file('[Content_Types].xml').async('string')).replace('</Types>', '<Override PartName="/xl/odd.xml" ContentType="application/vnd.ms-excel.macrosheet+xml"/></Types>'));
  });
  await assert.rejects(checkTemplate(types), /활성 콘텐츠/);
});
for (const definition of ['<definedName name="SYNTH">WEBSERVICE("https://example.invalid/")</definedName>', '<definedName name="_xlnm.Auto_Open">Sheet1!$A$1</definedName>', '<definedName name="SYNTH">CALL("SYNTH")</definedName>']) {
  test(`자동 실행·외부 통신을 이름 정의에서도 거부: ${definition.slice(0, 65)}`, async () => {
    const bytes = await altered(async zip => zip.file('xl/workbook.xml', (await zip.file('xl/workbook.xml').async('string')).replace('</workbook>', `<definedNames>${definition}</definedNames></workbook>`)));
    await assert.rejects(checkTemplate(bytes), /자동 실행|외부 연결 수식/);
  });
}
test('ZIP 크기 표기를 속인 XML도 실제 해제 중 상한으로 멈춘다', async () => {
  const zip = await JSZip.loadAsync(original);
  zip.file('xl/large.xml', '<x>' + 'A'.repeat(WORKBOOK_LIMITS.xml + 1) + '</x>');
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  // 가짜 시험용 ZIP 중앙 디렉터리의 uncompressed size만 작게 바꾼다.
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let offset = bytes.indexOf(signature);
  while (offset >= 0) {
    const nameLength = bytes.readUInt16LE(offset + 28);
    if (bytes.subarray(offset + 46, offset + 46 + nameLength).toString() === 'xl/large.xml') { bytes.writeUInt32LE(1, offset + 24); break; }
    offset = bytes.indexOf(signature, offset + 46 + nameLength);
  }
  assert.ok(offset >= 0);
  await assert.rejects(loadWorkbook(bytes), /너무 큽니다/);
});
