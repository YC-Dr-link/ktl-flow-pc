// src/ui를 인터넷 없이 file://로 여는 HTML 한 파일(dist/m4m5.html)로 묶는 빌드 스크립트
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { checkDist } from './check-dist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = path.join(dist, 'm4m5.html');
// 양식 xlsx와 견본 CSV는 빌드에 넣지 않는다 (받은 견본·양식은 코드 안 base64로도 싣지 않는다). 양식은 실행할 때 사용자가 고른다

// <script> 안에 넣어도 HTML이 끊기지 않게 닫는 태그와 주석 시작을 풀어 쓴다
const safeInline = (js) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

// JSZip 오류 문구 안의 안내 주소는 불러오는 주소가 아니지만 외부 URL 검사에 걸리므로 주소 앞의 https://만 뺀다
const stripDocUrls = (js) => js.replaceAll('https://stuk.github.io/', 'stuk.github.io/');

// xmldom·JSZip·pako는 번들에 허가문 전문이 없어서, node_modules의 LICENSE 전문을 번들 끝 고지 주석 안에 붙인다 (MIT: 복사본에 저작권·허가 고지를 남겨야 함)
// JSZip은 MIT와 GPLv3 이중 라이선스라 MIT 부분만 붙이고 MIT 조건으로 쓴다고 밝힌다. pako는 jszip.min.js 안에 들어 있다 (zlib 코드가 번들에 있음을 grep으로 확인)
const mitPart = (text) => text.slice(text.indexOf('The MIT License'), text.indexOf('GPL version 3')).trim();
const LICENSES = [
  { title: '@xmldom/xmldom/LICENSE', file: 'node_modules/@xmldom/xmldom/LICENSE' },
  { title: 'jszip LICENSE.markdown (MIT 부분만. 이 파일에서 JSZip은 MIT 조건으로 사용합니다 / JSZip is used here under the MIT license)', file: 'node_modules/jszip/LICENSE.markdown', pick: mitPart },
  { title: 'pako/LICENSE (jszip 안에 포함)', file: 'node_modules/pako/LICENSE' },
];

function addLicenses(js) {
  const read = ({ file, pick = (t) => t }) => pick(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')).replace(/\*\//g, '* /').trim();
  const block = LICENSES.map((l) => `\n${l.title}:\n${read(l).replace(/^/gm, '  ')}\n`).join('');
  const end = js.lastIndexOf('\n*/');
  if (!js.includes('/*! Bundled license information:') || end < 0) return `${js}\n/*! Bundled license information:\n${block}*/\n`;
  return `${js.slice(0, end)}\n${block}${js.slice(end + 1)}`;
}

const js = await build({
  entryPoints: [path.join(root, 'src/ui/main.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110', 'edge110'],
  minify: true,
  legalComments: 'eof',
  logLevel: 'warning',
});
// 줄바꿈을 LF로 통일한다. HTML 파서는 인라인 script·style 안의 CRLF·CR을 LF로 바꿔 읽으므로, CRLF 소스(Windows autocrlf)로 빌드하면
// 계산한 CSP 해시와 브라우저가 해시하는 텍스트가 달라져 CSS·JS가 막힌다. 해시도 넣는 텍스트도 같은 LF 텍스트로 만든다
const lf = (text) => text.replace(/\r\n?/g, '\n');
const css = lf(fs.readFileSync(path.join(root, 'src/ui/style.css'), 'utf8'));
const styleText = `\n${css}`;
const scriptText = `\n${lf(safeInline(addLicenses(stripDocUrls(js.outputFiles[0].text))))}`;

// 보안 L1: 브라우저가 외부 연결·불러오기를 막도록 CSP 메타를 넣는다. 인라인 script·style은 단일 HTML이라 꼭 필요하므로
// 'unsafe-inline' 대신 최종 텍스트의 sha256 해시만 허용한다 (해시가 다른 인라인 코드는 실행되지 않음).
// img-src는 따로 열지 않는다: 이미지를 쓰는 곳이 없고(차트는 SVG 요소), <a download>·Blob 링크 내려받기는 img-src와 관계가 없어 default-src 'none'을 따른다
const sha256 = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
const csp = [
  "default-src 'none'",
  `script-src ${sha256(scriptText)}`,
  `style-src ${sha256(styleText)}`,
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const html = lf(fs.readFileSync(path.join(root, 'src/ui/index.html'), 'utf8'))
  .replace('CSP_POLICY', () => csp)
  .replace('<!--STYLE-->', () => `<style>${styleText}</style>`)
  .replace('<!--SCRIPT-->', () => `<script>${scriptText}</script>`);

fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(out, html);
const bytes = Buffer.byteLength(html, 'utf8');
console.log(`dist/m4m5.html ${bytes} bytes (${(bytes / 1024).toFixed(0)} KB)`);

const problems = checkDist(out);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('check-dist: 외부 URL 0건');
