import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUnsavedResult } from '../../src/ui/unsavedResult.js';

test('결과가 없으면 묻지 않고 저장하지 않은 결과는 확인한다', () => {
  const guard = createUnsavedResult(), files = [];
  assert.equal(guard.needsConfirmation(files, null, ''), false);
  assert.equal(guard.needsConfirmation(files, { result: null }, ''), false);
  assert.equal(guard.needsConfirmation(files, { result: {} }, ''), true);
});
test('성공한 저장과 같은 파일·분석·일반사항이면 다시 묻지 않는다', () => {
  const guard = createUnsavedResult(), files = [], analysis = { result: {} };
  guard.markSaved(files, analysis, 'SYNTH inputs');
  assert.equal(guard.needsConfirmation(files, analysis, 'SYNTH inputs'), false);
});
test('저장한 뒤 새 파일·재분석·입력 변경이 있으면 확인한다', () => {
  const guard = createUnsavedResult(), files = [], analysis = { result: {} };
  guard.markSaved(files, analysis, 'SYNTH inputs');
  assert.equal(guard.needsConfirmation([], analysis, 'SYNTH inputs'), true);
  assert.equal(guard.needsConfirmation(files, { result: {} }, 'SYNTH inputs'), true);
  assert.equal(guard.needsConfirmation(files, analysis, 'SYNTH changed inputs'), true);
});
