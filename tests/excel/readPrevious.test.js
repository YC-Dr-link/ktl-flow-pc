// 작년 Excel(이 도구가 만든 파일 또는 같은 양식)에서 일반사항 칸을 읽어 저장 화면 입력 값으로 돌려주는지 본다 (#24)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import { analyze } from '../../src/core/analyze.js';
import { buildXlsx } from '../../src/excel/buildXlsx.js';
import { excelDateText, readPreviousGeneral } from '../../src/excel/readPrevious.js';
import { SERIAL, SYNTHETIC_TEMPLATE_PATH, loadSample, toList } from '../helpers/fixture.js';

const template = () => new Uint8Array(fs.readFileSync(SYNTHETIC_TEMPLATE_PATH));
const { result, summaries } = analyze(toList(loadSample('set_a')));
// 작년에 이 도구로 저장했다고 치는 값 (가짜)
const LAST_YEAR = {
  representative: 'SYNTH 대표',
  phone: '055-000-0000',
  maker: 'SYNTH 제작',
  approvalNumber: 'SYNTH-A-001',
  approvalDate: '2013년 08월 30일',
  firstInspectionDate: '2019년 05월 01일',
  pitotType: 'L형',
  pitotSerial: 'P-0001',
  pitotCoefficient: '0.826',
  unitNumber: '2',
  receiptDate: '2025년 10월 17일', // 올해 값이라 불러오지 않아야 한다
  referenceReportNo: 'R-0001', // 올해 값이라 불러오지 않아야 한다
};

describe('readPreviousGeneral', () => {
  it('이 도구가 만든 파일에서 일반사항 칸을 읽고, 작년 시험일은 직전 정도검사일로 돌려준다', async () => {
    const { bytes } = await buildXlsx(template(), result, summaries, LAST_YEAR);
    const prev = await readPreviousGeneral(bytes);
    assert.equal(prev.serial, SERIAL);
    assert.deepEqual(prev.values, {
      representative: 'SYNTH 대표',
      phone: '055-000-0000',
      maker: 'SYNTH 제작',
      approvalNumber: 'SYNTH-A-001',
      approvalDate: '2013년 08월 30일',
      firstInspectionDate: '2019년 05월 01일',
      pitotType: 'L형',
      pitotSerial: 'P-0001',
      pitotCoefficient: '0.826',
      unitNumber: '2', // G6 「ST 2」 → 2
      previousInspectionDate: result.equipment.test_date, // 작년 D11
    });
  });

  it('빈칸 표시 「-」와 빈 칸은 건너뛴다', async () => {
    const { bytes } = await buildXlsx(template(), result, summaries, {}); // 제작회사 · 형식승인 · 피토계수는 「-」
    const prev = await readPreviousGeneral(bytes);
    assert.deepEqual(Object.keys(prev.values), ['previousInspectionDate']);
  });

  it('일반사항 시트가 없거나 Excel 파일이 아니면 한국어 오류', async () => {
    await assert.rejects(readPreviousGeneral(new TextEncoder().encode('a,b')), { message: 'Excel 파일(.xlsx · .xlsm)이 아닙니다.' });
    const zip = await JSZip.loadAsync(template());
    const wb = await zip.file('xl/workbook.xml').async('string');
    zip.file('xl/workbook.xml', wb.replace('name="일반사항"', 'name="다른 시트"'));
    await assert.rejects(readPreviousGeneral(await zip.generateAsync({ type: 'uint8array' })), { message: "작년 파일에 '일반사항' 시트가 없습니다." });
  });

  it('날짜 칸이 Excel 날짜 숫자면 「YYYY년 MM월 DD일」로 바꾼다', () => {
    assert.equal(excelDateText(45000), '2023년 03월 15일');
    assert.equal(excelDateText(41516), '2013년 08월 30일');
  });
});

// 손으로 만든 양식처럼 일반사항 시트를 직접 쓴 xlsx (공유 문자열 · 윗주 · 공식 캐시 · 날짜 숫자 · 빈 D8)
async function handMade(cellsXml, sstItems) {
  const zip = await JSZip.loadAsync(template());
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const id = /<sheet name="일반사항" sheetId="\d+" r:id="(rId\d+)"/.exec(wb)[1];
  const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)[1];
  zip.file(`xl/${target}`, `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cellsXml}</row></sheetData></worksheet>`);
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sstItems.join('')}</sst>`);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('readPreviousGeneral — 손으로 만든 양식', () => {
  it('공유 문자열의 윗주(rPh)는 빼고, 서식 조각(r)은 이어 붙인다. 공식 칸은 캐시 값, 날짜 숫자는 날짜 글자', async () => {
    const bytes = await handMade(
      '<c r="D8" t="s"><v>0</v></c><c r="G7" t="s"><v>1</v></c><c r="D9" t="str"><f>A1</f><v>SYNTH-A-009</v></c><c r="D10"><v>41516</v></c><c r="G6" t="s"><v>2</v></c>',
      ['<si><t>SYNTH-0001</t></si>', '<si><r><t>SYNTH </t></r><r><t>제작</t></r><rPh sb="0" eb="1"><t>しんせ</t></rPh></si>', '<si><t>ST-3</t></si>'],
    );
    const prev = await readPreviousGeneral(bytes);
    assert.equal(prev.serial, 'SYNTH-0001');
    assert.deepEqual([prev.values.maker, prev.values.approvalNumber, prev.values.approvalDate, prev.values.unitNumber], ['SYNTH 제작', 'SYNTH-A-009', '2013년 08월 30일', '3']);
  });

  it('D8(기기 번호)이 비면 serial은 빈 글자다 (화면에서 채우지 않는다)', async () => {
    const prev = await readPreviousGeneral(await handMade('<c r="G7" t="s"><v>0</v></c>', ['<si><t>SYNTH 제작</t></si>']));
    assert.equal(prev.serial, '');
  });

  it('깨진 XML이면 한국어로 알린다', async () => {
    const zip = await JSZip.loadAsync(template());
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row>');
    await assert.rejects(readPreviousGeneral(await zip.generateAsync({ type: 'uint8array' })), { message: '작년 파일을 읽지 못했습니다. 파일이 손상되지 않았는지 확인하세요.' });
  });

  it('시각이 들어간 날짜 숫자도 그날로 (반올림하지 않는다)', () => {
    assert.equal(excelDateText(41516.6), '2013년 08월 30일');
  });
});

describe('Excel 날짜 체계 (PR #29 리뷰)', () => {
  it('1904 날짜 체계: 45000은 2027년 03월 16일, 1900 체계는 2023년 03월 15일', () => {
    assert.equal(excelDateText(45000, { date1904: true }), '2027년 03월 16일');
    assert.equal(excelDateText(0, { date1904: true }), '1904년 01월 01일');
    assert.equal(excelDateText(45000), '2023년 03월 15일');
  });

  it('1900 체계의 60 미만은 Excel 윤년 버그를 따라 하루를 맞추고, 없는 1900-02-29(60)는 빈칸', () => {
    assert.equal(excelDateText(1), '1900년 01월 01일');
    assert.equal(excelDateText(59), '1900년 02월 28일');
    assert.equal(excelDateText(60), '');
    assert.equal(excelDateText(61), '1900년 03월 01일');
  });

  it('workbookPr date1904="1"인 파일의 날짜 숫자는 1904 체계로 읽는다', async () => {
    const zip = await JSZip.loadAsync(await handMade('<c r="D8" t="s"><v>0</v></c><c r="D10"><v>45000</v></c>', ['<si><t>SYNTH-0001</t></si>']));
    const wb = await zip.file('xl/workbook.xml').async('string');
    zip.file('xl/workbook.xml', wb.replace('<sheets>', '<workbookPr date1904="1"/><sheets>'));
    const prev = await readPreviousGeneral(await zip.generateAsync({ type: 'uint8array' }));
    assert.equal(prev.values.approvalDate, '2027년 03월 16일');
  });
});
