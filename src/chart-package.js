/* Minimal ZIP STORE container for OOXML. No external library or network. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KtlChartPackage = api;
})(globalThis, function () {
  'use strict';
  const encoder = new TextEncoder();
  const table = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  function join(parts) {
    const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }
  function zip(entries) {
    const local = [], central = [];
    let offset = 0;
    for (const [path, text] of Object.entries(entries)) {
      const name = encoder.encode(path), bytes = text instanceof Uint8Array ? text : encoder.encode(text);
      let crc = 0xffffffff;
      for (const value of bytes) crc = table[(crc ^ value) & 255] ^ (crc >>> 8);
      crc = (crc ^ 0xffffffff) >>> 0;
      const header = new Uint8Array(30), h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
      h.setUint16(12, 33, true); h.setUint32(14, crc, true); h.setUint32(18, bytes.length, true);
      h.setUint32(22, bytes.length, true); h.setUint16(26, name.length, true);
      local.push(header, name, bytes);
      const directory = new Uint8Array(46), d = new DataView(directory.buffer);
      d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true);
      d.setUint16(8, 0x800, true); d.setUint16(14, 33, true); d.setUint32(16, crc, true);
      d.setUint32(20, bytes.length, true); d.setUint32(24, bytes.length, true);
      d.setUint16(28, name.length, true); d.setUint32(42, offset, true);
      central.push(directory, name); offset += header.length + name.length + bytes.length;
    }
    const directory = join(central), end = new Uint8Array(22), e = new DataView(end.buffer);
    const count = Object.keys(entries).length;
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, count, true); e.setUint16(10, count, true);
    e.setUint32(12, directory.length, true); e.setUint32(16, offset, true);
    return join([...local, directory, end]);
  }
  function unzip(bytes) {
    const result = {}, decoder = new TextDecoder('utf-8', { fatal: true });
    if (!(bytes instanceof Uint8Array) || bytes.length < 22) throw new Error('Invalid ZIP');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = bytes.length - 22;
    if (view.getUint32(end, true) !== 0x06054b50 || view.getUint16(end + 20, true)) throw new Error('Invalid ZIP end');
    let cursor = view.getUint32(end + 16, true);
    for (let i = 0; i < view.getUint16(end + 10, true); i++) {
      if (view.getUint32(cursor, true) !== 0x02014b50 || view.getUint16(cursor + 10, true) !== 0) throw new Error('Only ZIP STORE supported');
      const length = view.getUint32(cursor + 24, true), nameLength = view.getUint16(cursor + 28, true);
      const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
      const local = view.getUint32(cursor + 42, true);
      if (view.getUint32(local, true) !== 0x04034b50 || name in result || /(^[\\/]|(?:^|\/)\.\.(?:\/|$))/.test(name)) throw new Error('Invalid ZIP entry');
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      if (start + length > cursor || length !== view.getUint32(cursor + 20, true)) throw new Error('Invalid ZIP size');
      const data = bytes.slice(start, start + length); let crc = 0xffffffff;
      for (const value of data) crc = table[(crc ^ value) & 255] ^ (crc >>> 8);
      if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(cursor + 16, true)) throw new Error('Invalid ZIP CRC');
      result[name] = data;
      cursor += 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    }
    return result;
  }
  return Object.freeze({ zip, unzip });
});
