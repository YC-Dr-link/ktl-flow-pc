// close() 전에 새 데이터가 확인되면 임시 쓰기를 중단하여 기존 파일을 보존한다.
export async function writeSnapshot(target, bytes, isCurrent) {
  let writer;
  let committed = false;
  try {
    if (!(await isCurrent())) return false;
    writer = await target.createWritable();
    if (!(await isCurrent())) return false;
    await writer.write(bytes);
    if (!(await isCurrent())) return false;
    await writer.close();
    committed = true;
    return true;
  } finally {
    if (writer && !committed) await writer.abort().catch(() => {});
  }
}
