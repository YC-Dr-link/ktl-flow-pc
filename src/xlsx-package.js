/* Minimal ZIP STORE container for OOXML. No external library or network. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KtlXlsxPackage = api;
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
      const name = encoder.encode(path), bytes = encoder.encode(text);
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
  return Object.freeze({ zip });
});
