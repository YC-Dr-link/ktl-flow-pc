// 출력 양식은 보존해서 복사하므로, 위험한 부품을 지우는 대신 사용을 거부한다.
import JSZip from 'jszip';
import { parseXml } from './sheetXml.js';

export const WORKBOOK_LIMITS = { compressed: 25 * 1024 * 1024, expanded: 100 * 1024 * 1024, xml: 10 * 1024 * 1024, entries: 2000 };
const unsafe = message => new Error(`Excel 양식을 사용할 수 없습니다. ${message}`);

// ZIP의 크기 표기를 속인 XML도 한 번에 메모리에 풀지 않는다.
function readXml(entry) {
  return new Promise((resolve, reject) => {
    let size = 0, stopped = false;
    const chunks = [];
    const stream = entry.internalStream('uint8array');
    stream.on('data', chunk => {
      if (stopped) return;
      size += chunk.byteLength;
      if (size > WORKBOOK_LIMITS.xml) { stopped = true; chunks.length = 0; stream.pause(); reject(unsafe('압축을 푼 XML이 너무 큽니다.')); return; }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (stopped) return;
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      resolve(new TextDecoder().decode(bytes));
    });
    stream.resume();
  });
}

export async function loadWorkbook(bytes, { output = true } = {}) {
  if (bytes.byteLength > WORKBOOK_LIMITS.compressed) throw unsafe('파일은 25 MB 이하여야 합니다.');
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  if (entries.length > WORKBOOK_LIMITS.entries) throw unsafe('압축 항목이 너무 많습니다.');
  let total = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    // JSZip 3.10의 loadAsync 결과에 있는 압축 메타데이터로 해제 전에 용량을 제한한다.
    const size = entry._data?.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0) throw unsafe('압축 용량 정보를 읽지 못했습니다.');
    total += size;
    if (total > WORKBOOK_LIMITS.expanded || (/\.(xml|rels)$/i.test(entry.name) && size > WORKBOOK_LIMITS.xml)) {
      throw unsafe('압축을 푼 데이터가 너무 큽니다.');
    }
    const original = entry.unsafeOriginalName || entry.name;
    if (original.split(/[\\/]/).includes('..')) throw unsafe('올바르지 않은 압축 경로가 있습니다.');
    if (output && /(?:^|\/)(?:vbaProject(?:Signature)?\.bin|externalLinks\/|activeX\/|embeddings\/|ctrlProps\/|macrosheets\/|connections\.xml|queryTables\/)/i.test(entry.name)) {
      throw unsafe('매크로·외부 연결·활성 콘텐츠가 없는 .xlsx 양식을 고르세요.');
    }
    if (!/\.(xml|rels)$/i.test(entry.name)) continue;
    const xml = await readXml(entry);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw unsafe('지원하지 않는 XML 선언이 있습니다.');
    if (!output) continue; // 작년 xlsm은 실행하지 않고 일반사항 값만 읽는다.
    const doc = parseXml(xml);
    for (const relation of [...doc.getElementsByTagNameNS('*', 'Relationship')]) {
      const target = (relation.getAttribute('Target') || '').trim();
      if (/vbaProject|macrosheet|activeX|oleObject|externalLink|connections/i.test(relation.getAttribute('Type') || '')) throw unsafe('매크로·외부 연결·활성 콘텐츠가 없는 .xlsx 양식을 고르세요.');
      if (String(relation.getAttribute('TargetMode') || '').trim().toLowerCase() === 'external' || /^(?:[a-z][\w+.-]*:|[\\/]{2})/i.test(target)) {
        throw unsafe('외부 파일·인터넷 연결이 있습니다. 연결을 제거한 양식을 따로 준비하세요.');
      }
    }
    for (const type of [...doc.getElementsByTagNameNS('*', 'Override'), ...doc.getElementsByTagNameNS('*', 'Default')]) {
      if (/macroEnabled|macrosheet|vbaProject|activeX|oleObject/i.test(type.getAttribute('ContentType'))) {
        throw unsafe('매크로·활성 콘텐츠가 없는 .xlsx 양식을 고르세요.');
      }
    }
    for (const node of [...doc.getElementsByTagName('*')]) {
      const name = node.localName || node.nodeName;
      if (!['f', 'definedName'].includes(name)) continue;
      if (name === 'definedName' && /(?:^|\.)(?:Auto_Open|Auto_Close)$/i.test(node.getAttribute('name') || '')) throw unsafe('자동 실행 이름 정의가 있습니다. 매크로가 없는 양식을 고르세요.');
      if (/\[[^\]]+\][^!]*!|\|[^!]*!|\b(?:HYPERLINK|WEBSERVICE|IMAGE|STOCKHISTORY|RTD|DDE|EXEC|EVALUATE|RUN|CALL|REGISTER(?:\.ID)?)\s*\(/i.test(node.textContent)) {
        throw unsafe('외부 연결 수식이 있습니다. 연결이 없는 양식을 고르세요.');
      }
    }
  }
  return zip;
}
