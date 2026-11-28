// 읽기가 끝나는 순서와 선택한 순서가 달라도 마지막 선택의 성공·오류만 화면에 반영한다.
export function createLatestSelection(onPendingChange = () => {}) {
  let revision = 0, pending = false;
  const setPending = value => {
    if (pending === value) return;
    pending = value;
    onPendingChange();
  };
  return {
    get pending() { return pending; },
    cancel() { revision += 1; setPending(false); },
    // apply·onError는 화면과 저장소를 한 번에 바꾸는 동기 콜백이다.
    async run(read, apply, onError) {
      const request = ++revision;
      setPending(true);
      try {
        const value = await read();
        if (request === revision) apply(value);
      } catch (error) {
        if (request === revision) onError(error);
      } finally {
        if (request === revision) setPending(false);
      }
    },
  };
}
