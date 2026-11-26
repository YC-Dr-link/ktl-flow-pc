// createWritable의 임시 파일은 close에서 확정된다. 확인 중 바뀌면 abort하여 기존 파일을 보존한다.
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
