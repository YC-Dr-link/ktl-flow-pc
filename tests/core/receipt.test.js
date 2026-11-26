// CSV 1행 「의뢰 기관」을 접수번호와 회사명으로 나누고, 꼴이 다르거나 공백 없이 붙은 경우를 알려 주는지 본다 (#23)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReceiptNo, splitRequester } from '../../src/core/receipt.js';

test('정상: 접수번호 + 공백 + 회사명', () => {
  assert.deepEqual(splitRequester('25-123456-01-1 SYNTH-CO'), { receipt_no: '25-123456-01-1', company: 'SYNTH-CO', problem: null });
  assert.deepEqual(splitRequester('25-123456-01-12 가나다 주식회사'), { receipt_no: '25-123456-01-12', company: '가나다 주식회사', problem: null });
  assert.deepEqual(splitRequester('25-123456-01 SYNTH-CO'), { receipt_no: '25-123456-01', company: 'SYNTH-CO', problem: null });
  assert.deepEqual(splitRequester('  25-123456-01-1   SYNTH-CO  '), { receipt_no: '25-123456-01-1', company: 'SYNTH-CO', problem: null });
});

test('회사명 없이 접수번호만 있어도 꼴은 맞다', () => {
  assert.deepEqual(splitRequester('25-123456-01-1'), { receipt_no: '25-123456-01-1', company: '', problem: null });
});

test('공백 없이 회사명이 붙으면 나눈 값을 제안하고 glued로 알린다', () => {
  assert.deepEqual(splitRequester('25-000123-01-1업체A'), { receipt_no: '25-000123-01-1', company: '업체A', problem: 'glued' });
  assert.deepEqual(splitRequester('25-123456-01-1SYNTH-CO'), { receipt_no: '25-123456-01-1', company: 'SYNTH-CO', problem: 'glued' });
});

test('접수번호 꼴이 아니면 첫 공백 앞을 접수번호로 두고 format으로 알린다', () => {
  assert.deepEqual(splitRequester('SYNTHETIC-ONLY'), { receipt_no: 'SYNTHETIC-ONLY', company: '', problem: 'format' });
  assert.deepEqual(splitRequester('25123456011 SYNTH-CO'), { receipt_no: '25123456011', company: 'SYNTH-CO', problem: 'format' });
  assert.deepEqual(splitRequester('2-123456-01-1 SYNTH-CO'), { receipt_no: '2-123456-01-1', company: 'SYNTH-CO', problem: 'format' });
  assert.deepEqual(splitRequester(''), { receipt_no: '', company: '', problem: 'format' });
  assert.deepEqual(splitRequester(null), { receipt_no: '', company: '', problem: 'format' });
});

test('세부 번호가 3자리 이상이거나 하이픈이 더 붙으면 세부를 버리지 않고 format으로 알린다', () => {
  assert.deepEqual(splitRequester('25-123456-01-123 SYNTH-CO'), { receipt_no: '25-123456-01-123', company: 'SYNTH-CO', problem: 'format' });
  assert.deepEqual(splitRequester('25-123456-01-1-2 SYNTH-CO'), { receipt_no: '25-123456-01-1-2', company: 'SYNTH-CO', problem: 'format' });
  assert.equal(splitRequester('25-123456-01-1234SYNTH').problem, 'format');
});

test('탭 · 전각 공백도 구분 공백으로 본다', () => {
  assert.deepEqual(splitRequester('25-123456-01-1	SYNTH-CO'), { receipt_no: '25-123456-01-1', company: 'SYNTH-CO', problem: null });
  assert.deepEqual(splitRequester('25-123456-01-1　SYNTH-CO'), { receipt_no: '25-123456-01-1', company: 'SYNTH-CO', problem: null });
});

test('isReceiptNo: 사람이 고친 값이 NN-NNNNNN-NN(-N|-NN) 꼴인지', () => {
  for (const ok of ['25-123456-01', '25-123456-01-1', '25-123456-01-12', ' 25-123456-02-1 ']) assert.equal(isReceiptNo(ok), true, ok);
  for (const bad of ['', '25-123456-01-123', '25-12345-01-1', '25-123456-1-1', '25-123456-01-1 업체', 'SYNTHETIC-ONLY']) assert.equal(isReceiptNo(bad), false, bad);
});

test('analyze 결과에 receipt_problem과 1행 원문이 들어간다', async () => {
  const { analyze } = await import('../../src/core/analyze.js');
  const { loadSample, replaceInLine, toList } = await import('../helpers/fixture.js');
  const sample = loadSample('set_a');
  assert.equal(analyze(toList(sample)).result.equipment.receipt_problem, null);
  // 6개 파일 모두 1행 공백을 지운다 (파일마다 같아야 검증을 통과한다)
  const glued = Object.fromEntries(Object.entries(sample).map(([id, f]) => [id, replaceInLine(f, 1, '25-123456-01-1 SYNTH-CO', '25-123456-01-1SYNTH-CO')]));
  const eq = analyze(toList(glued)).result.equipment;
  assert.deepEqual([eq.receipt_no, eq.company, eq.receipt_problem, eq.requester_raw], ['25-123456-01-1', 'SYNTH-CO', 'glued', '25-123456-01-1SYNTH-CO']);
});

test('receiptNoMode left15: 앞 15글자가 접수번호 꼴이 아니면 format으로 알린다', async () => {
  const { analyze } = await import('../../src/core/analyze.js');
  const { default: defaultConfig } = await import('../../src/config.js');
  const { loadSample, replaceInLine, toList } = await import('../helpers/fixture.js');
  const config = { ...defaultConfig, receiptNoMode: 'left15' };
  const sample = loadSample('set_a');
  const noDetail = Object.fromEntries(Object.entries(sample).map(([id, f]) => [id, replaceInLine(f, 1, '25-123456-01-1 ', '25-123456-01 ')]));
  const eq = analyze(toList(noDetail), { config }).result.equipment;
  assert.deepEqual([eq.receipt_no, eq.receipt_problem], ['25-123456-01 SY', 'format']);
});
