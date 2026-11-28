// 마지막 저장에 사용한 파일·분석·입력값과 현재 결과가 같은지 확인한다.
export function createUnsavedResult() {
  let saved = null;
  return {
    markSaved(files, analysis, inputs) { saved = { files, analysis, inputs }; },
    needsConfirmation(files, analysis, inputs) {
      return Boolean(analysis?.result) && (!saved || saved.files !== files || saved.analysis !== analysis || saved.inputs !== inputs);
    },
  };
}
