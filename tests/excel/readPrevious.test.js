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
  representative: '홍길동',
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
      representative: '홍길동',
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
