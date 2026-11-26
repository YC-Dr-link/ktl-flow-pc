// CSV 해독(UTF-8/CP949)과 파싱, 머리글·데이터 나누기를 확인하는 테스트
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBytes, headerValue, parseCsv, parseNumber, readCsvFile, collapseSpaces } from '../../src/core/csv.js';
import { SERIAL, loadSample } from '../helpers/fixture.js';

describe('csv', () => {
  it('CP949 CSV는 UTF-8로 읽히지 않아 CP949로 해독된다', () => {
    const { rep_summary } = loadSample();
    const { text, encoding } = decodeBytes(rep_summary.bytes);
    assert.equal(encoding, 'cp949');
    assert.match(text, /의뢰 기관,25-123456-01-1 \S+/);
  });

  it('UTF-8(BOM 포함)이면 UTF-8로 읽는다', () => {
    const bytes = new TextEncoder().encode('﻿의뢰 기관,가나다\r\n');
    const { text, encoding } = decodeBytes(bytes);
    assert.equal(encoding, 'utf-8');
    assert.equal(text, '의뢰 기관,가나다\r\n');
  });

  it('머리글 11줄, 열 이름 12행, 단위 13행, 데이터 14행부터 (요약 10행)', () => {
    const f = readCsvFile('x.csv', loadSample().rep_summary.bytes);
    assert.equal(f.header.length, 11);
    assert.equal(f.columnNames[0], '저장번호');
    assert.equal(f.units[1], 'm/sec');
    assert.equal(f.data.length, 10);
    assert.equal(f.data[0].row, 14);
    assert.equal(headerValue(f, 5), SERIAL);
    assert.equal(headerValue(f, 11), '09:00:00');
  });

  it('첫 열이 빈 줄에서 데이터가 끝난다', () => {
    const rows = parseCsv(`${'a,b\n'.repeat(13)}1,2\n,3\n4,5\n`);
    const f = readCsvFile('y.csv', new TextEncoder().encode(rows.map((r) => r.join(',')).join('\n')));
    assert.equal(f.data.length, 1);
  });

  it('빈 파일도 던지지 않는다', () => {
    const f = readCsvFile('empty.csv', new Uint8Array());
    assert.equal(f.rows.length, 0);
    assert.equal(f.data.length, 0);
  });

  it('숫자 해석은 엄격하다', () => {
    assert.equal(parseNumber('1.5e-3'), 0.0015);
    assert.equal(parseNumber('-2'), -2);
    for (const bad of ['', ' ', 'abc', '0x10', '1,5', '1..2']) assert.ok(Number.isNaN(parseNumber(bad)), bad);
  });

  it('연속 공백은 하나로 본다', () => {
    assert.equal(collapseSpaces('25-123456-01-1   시험기관 '), '25-123456-01-1 시험기관');
  });
});
