import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import { excelDateText, readPreviousGeneral } from '../../src/excel/readPrevious.js';
import { sheetPaths } from '../../src/excel/buildXlsx.js';
import { SYNTHETIC_TEMPLATE_PATH } from '../helpers/fixture.js';

for (const flag of ['0', '1', 'true']) {
  test(`작년 날짜를 workbookPr.date1904=${flag} 체계로 읽는다`, async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(SYNTHETIC_TEMPLATE_PATH));
    let wb = await zip.file('xl/workbook.xml').async('string');
    wb = wb.replace(/<workbookPr\b[^>]*\/>/, '').replace(/(<workbook\b[^>]*>)/, `$1<workbookPr date1904="${flag}"/>`);
    zip.file('xl/workbook.xml', wb);
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    zip.file(sheetPaths(wb, rels)['일반사항'], '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="10"><c r="D10"><v>45000</v></c></row></sheetData></worksheet>');
    const prev = await readPreviousGeneral(await zip.generateAsync({ type: 'uint8array' }));
    assert.equal(prev.values.approvalDate, flag === '0' ? '2023년 03월 15일' : '2027년 03월 16일');
  });
}
test('1900 윤년 버그·초기 날짜·1904의 0·무한대·범위를 확인한다', () => {
  assert.equal(excelDateText(1), '1900년 01월 01일');
  assert.equal(excelDateText(59), '1900년 02월 28일');
  assert.equal(excelDateText(61), '1900년 03월 01일');
  assert.equal(excelDateText(0, true), '1904년 01월 01일');
  assert.equal(excelDateText(2958465), '9999년 12월 31일');
  assert.equal(excelDateText(2957003, true), '9999년 12월 31일');
  for (const serial of [60, -1, Infinity, NaN, 9000000]) assert.throws(() => excelDateText(serial), /날짜/);
});
