// 빌드 결과 HTML에 외부에서 불러오는 리소스가 없는지 검사한다 (NFR-01). 단독 실행: node scripts/check-dist.mjs [파일]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 불러오기가 아니라 XML 이름공간 문자열로만 쓰이는 주소 (SVG 요소 만들기, xlsx XML 처리)
const NAMESPACE_URLS = [
  /^https?:\/\/schemas\.openxmlformats\.org\//,
  /^https?:\/\/schemas\.microsoft\.com\//,
  /^https?:\/\/purl\.org\//,
  /^https?:\/\/www\.w3\.org\//,
  /^https?:\/\/www\.omg\.org\//,
];

// CSP 지시문을 하나씩 허용 목록으로 검사한다 (필요한 문구가 있는지만 보면 script-src data: 같은 덧붙임을 못 잡는다)
const CSP_NONE_ONLY = ['default-src', 'connect-src', 'form-action', 'base-uri']; // 반드시 있고 'none'만
const CSP_HASH_ONLY = ['script-src', 'style-src']; // 반드시 있고 'sha256-…' 해시만
const CSP_OPTIONAL = { 'img-src': ["'none'", 'data:', 'blob:'] }; // 없어도 되고, 있으면 이 값만
export function checkCsp(policy) {
  const problems = [];
  const directives = new Map();
  for (const part of policy.split(';').map((p) => p.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    // 같은 지시문이 두 번이면 브라우저는 첫 번째만 쓰는데 Map은 마지막 값으로 덮어써서 검사가 어긋난다. 대소문자는 구분하지 않는 이름이라 소문자로 비교한다 (보안 N3)
    if ([...directives.keys()].some((k) => k.toLowerCase() === name.toLowerCase())) {
      problems.push(`CSP에 ${name.toLowerCase()}이 두 번 나옵니다`);
      continue;
    }
    directives.set(name, values);
  }
  for (const name of CSP_NONE_ONLY) {
    const v = directives.get(name);
    if (!v) problems.push(`CSP에 ${name}이 없습니다`);
    else if (v.length !== 1 || v[0] !== "'none'") problems.push(`CSP ${name}은 'none'이어야 합니다 (현재: ${v.join(' ')})`);
  }
  for (const name of CSP_HASH_ONLY) {
    const v = directives.get(name);
    if (!v) problems.push(`CSP에 ${name}이 없습니다`);
    else if (!v.length || !v.every((x) => /^'sha256-[A-Za-z0-9+/=]+'$/.test(x))) problems.push(`CSP ${name}은 'sha256-…' 해시만 허용합니다 (현재: ${v.join(' ')})`);
  }
  for (const [name, values] of directives) {
    if (CSP_NONE_ONLY.includes(name) || CSP_HASH_ONLY.includes(name)) continue;
    if (!CSP_OPTIONAL[name]) problems.push(`CSP에 허용하지 않은 지시문이 있습니다: ${name}`);
    else if (!values.every((x) => CSP_OPTIONAL[name].includes(x))) problems.push(`CSP ${name}에 허용하지 않은 값이 있습니다 (현재: ${values.join(' ')})`);
  }
  return problems;
}

// 파일을 읽어 문제 목록을 돌려준다. 빈 배열이면 통과
export function checkDist(file) {
  // 라이선스 고지(legalComments: 'eof')는 주석이라 아무것도 불러오지 못한다. 고지를 남기는 것이 우선이라 이 한 덩어리만 URL 검사에서 뺀다
  const html = fs.readFileSync(file, 'utf8').replace(/\/\*! Bundled license information:(?:(?!\*\/)[\s\S])*?\n\*\/\n(?=<\/script>)/, '');
  const problems = [];
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>`)\\]+/g)) {
    if (!NAMESPACE_URLS.some((re) => re.test(m[0]))) problems.push(`허용되지 않은 외부 주소: ${m[0]}`);
  }
  const loaders = [
    [/<script[^>]*\ssrc\s*=/i, '<script src>'],
    [/<link[\s>]/i, '<link>'],
    [/<(img|iframe|source|video|audio|embed|object)[^>]*\s(src|data)\s*=/i, '<img/iframe 등 src>'],
    [/@import/i, 'CSS @import'],
    [/url\(\s*["']?(https?:)?\/\//i, 'CSS url(외부)'],
    [/\b(src|href)\s*=\s*["']?(https?:)?\/\//i, 'src/href 외부 주소'],
    [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
    [/\bfetch\s*\(/, 'fetch('],
    [/\bimport\s*\(/, 'import('],
    [/\bnew\s+WebSocket\b/, 'WebSocket'],
    [/type\s*=\s*["']module["']/i, 'type=module'],
    [/\bsendBeacon\b/, 'sendBeacon'],
    [/\bEventSource\b/, 'EventSource'],
    [/\bnew\s+Image\s*\(/, 'new Image('],
    [/["'`]wss?:/i, 'ws:/wss: 주소'],
    [/["'`(=]\s*\/\/[\w-]+\.[\w.-]+/, '// 로 시작하는 프로토콜 상대 URL'],
    [/<base[\s>]/i, '<base>'],
    [/http-equiv\s*=\s*["']?refresh/i, 'meta refresh'],
  ];
  for (const [re, label] of loaders) if (re.test(html)) problems.push(`불러오기 패턴 발견: ${label}`);

  // 고지 주석 머리말이 번들 안에 한 번만 있어야 한다 (머리말을 앞에 심어 그 뒤 코드를 검사에서 빼는 우회를 막음)
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.split('/*! Bundled license information:').length - 1 > 1) problems.push('라이선스 고지 머리말이 두 번 이상 나옵니다');

  // 브라우저가 실제로 외부 연결을 막도록 CSP 메타가 있어야 한다 (보안 L1)
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(raw);
  if (!csp) problems.push('CSP 메타가 없습니다');
  else problems.push(...checkCsp(csp[1]));

  // style·script 블록의 실제 텍스트 해시가 CSP 해시와 같아야 한다. 브라우저는 CRLF·CR을 LF로 읽어 해시하므로 \r이 남아 있으면 어긋난다 (보안 N2)
  if (csp) {
    for (const [tag, directive] of [['style', 'style-src'], ['script', 'script-src']]) {
      const blocks = [...raw.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))];
      if (blocks.length !== 1) {
        problems.push(`<${tag}> 블록이 ${blocks.length}개입니다 (1개여야 함)`);
        continue;
      }
      const text = blocks[0][1];
      if (text.includes('\r')) problems.push(`<${tag}> 블록에 CR 문자가 있습니다 (CSP 해시가 어긋남)`);
      const hash = `'sha256-${createHash('sha256').update(text.replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`;
      const declared = new RegExp(`${directive} ([^;]*)`).exec(csp[1]);
      if (!declared || !declared[1].split(' ').includes(hash)) problems.push(`${directive} 해시가 <${tag}> 블록의 실제 해시와 다릅니다`);
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] || path.join(root, 'dist/m4m5.html');
  const problems = checkDist(file);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`check-dist 통과: ${path.relative(root, file)} 외부 URL 0건`);
}
