// 실행할 때 고른 양식 파일을 검사하는 checkTemplate과, 합성 양식으로 Excel을 끝까지 만드는지 보는 테스트
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import { analyze } from '../../src/core/analyze.js';
import defaultConfig from '../../src/config.js';
import { buildXlsx, checkTemplate } from '../../src/excel/buildXlsx.js';
import { FAKE_COMPANY, FAKE_RECEIPT, MODEL, SERIAL, TOL, loadExpected, loadSample, toList, SYNTHETIC_TEMPLATE_PATH } from '../helpers/fixture.js';
import { openXlsx } from '../helpers/xlsx.js';

const names = defaultConfig.sheetNames;
const synthetic = () => new Uint8Array(fs.readFileSync(SYNTHETIC_TEMPLATE_PATH));
const { result, summaries } = analyze(toList(loadSample()));

// 양식에서 부품 하나를 빼거나 바꾼 xlsx 바이트
async function altered(change) {
  const zip = await JSZip.loadAsync(synthetic());
  await change(zip);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('checkTemplate — 고른 양식 파일 검사', () => {
  it('합성 양식은 통과한다', async () => {
    await checkTemplate(synthetic());
  });

  it('xlsx가 아닌 파일은 한국어로 알린다', async () => {
    await assert.rejects(checkTemplate(new TextEncoder().encode('a,b,c\n1,2,3')), { message: 'Excel 양식 파일(.xlsx)이 아닙니다.' });
    await assert.rejects(checkTemplate(new Uint8Array(0)), { message: 'Excel 양식 파일(.xlsx)이 아닙니다.' });
  });

  it('zip이지만 Excel 통합 문서가 아니면 같은 문구로 알린다', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    await assert.rejects(checkTemplate(await zip.generateAsync({ type: 'uint8array' })), { message: 'Excel 양식 파일(.xlsx)이 아닙니다.' });
  });

  it('시트 이름이 하나라도 없으면 어느 시트인지 알린다', async () => {
    const bytes = await altered(async (zip) => {
      const wb = await zip.file('xl/workbook.xml').async('string');
      zip.file('xl/workbook.xml', wb.replace(`name="${names[2]}"`, 'name="다른 이름"'));
    });
    await assert.rejects(checkTemplate(bytes), { message: `양식에 '${names[2]}' 시트가 없습니다.` });
  });

  it('차트나 공유 문자열 부품이 없으면 양식이 맞지 않는다고 알린다', async () => {
    for (const part of ['xl/charts/chart2.xml', 'xl/sharedStrings.xml']) {
      const bytes = await altered((zip) => zip.remove(part));
      await assert.rejects(checkTemplate(bytes), { message: '양식의 구조가 맞지 않습니다. 계산식 양식 파일인지 확인하세요.' }, part);
    }
  });
});

describe('합성 양식으로 Excel 만들기', () => {
  it('시트 6개에 값이 들어가고 차트 캐시가 바뀐다', async () => {
    const { bytes, fileName } = await buildXlsx(synthetic(), result, summaries, {});
    assert.equal(fileName, '25-123456-01-1_유속계.xlsx'); // 접수번호_유속계.xlsx (hub #16)
    const book = await openXlsx(bytes);
    assert.deepEqual(book.sheetNames, names);
    assert.equal(book.sheets[names[2]].cell('B1'), result.equipment.receipt_no);
    assert.equal(book.sheets[names[2]].cell('J36'), result.sensitivity.value_pct);
    assert.equal(book.sheets[names[3]].cell('B1'), result.equipment.receipt_no);
    const chart = await book.read('xl/charts/chart1.xml');
    const first = result.sensitivity.by_angle.find((g) => g.angle === defaultConfig.chartAngleOrder[0] && g.point === '30%').value_pct;
    assert.ok(chart.includes(`<c:v>${first}</c:v>`), 'Y 첫 점이 계산값으로 바뀐다');
  });
});

describe('합성 CSV set_a → 합성 양식: 주요 칸 값 (NFR-02, 소수 셋째 자리)', () => {
  it('일반사항 기기 정보 · 판정과 반복성 · 직선성 · 민감도 값이 정답과 같다', async () => {
    const e = loadExpected('set_a').expected;
    const book = await openXlsx((await buildXlsx(synthetic(), result, summaries, {})).bytes);
    const g = book.sheets[names[0]];
    assert.deepEqual(
      ['D2', 'D3', 'D8', 'G8', 'G10', 'D11', 'D12'].map((c) => g.cell(c)),
      [FAKE_COMPANY, FAKE_RECEIPT, SERIAL, MODEL, 20, '2026년 11월 02일', '적 합'],
    );
    const near = (cell, want, label) => assert.ok(Math.abs(cell - want) <= TOL, `${label}: 칸 ${cell}, 정답 ${want}`);
    near(g.cell('E21'), e.repeatability_pct.zero, '반복성 ZERO(E21)');
    near(g.cell('G21'), e.repeatability_pct.span, '반복성 SPAN(G21)');
    near(g.cell('E30'), e.linearity_pct['30'].max_abs_relative_pct, '직선성 30%(E30)');
    near(g.cell('G30'), e.linearity_pct['70'].max_abs_relative_pct, '직선성 70%(G30)');
    near(book.sheets[names[2]].cell('J36'), e.sensitivity_pct, '민감도(sensitive J36)');
  });
});
