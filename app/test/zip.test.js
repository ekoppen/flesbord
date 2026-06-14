import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, zipStore } from '../zip.js';

test('crc32 tegen de bekende vector', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('crc32 van lege buffer is 0', () => {
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('zipStore bouwt een geldige store-only zip', () => {
  const files = [
    { name: 'een.txt', data: Buffer.from('hallo') },
    { name: 'twee.bin', data: Buffer.from([1, 2, 3, 4]) }
  ];
  const zip = zipStore(files);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const eocd = zip.length - 22;
  assert.equal(zip.readUInt32LE(eocd), 0x06054b50);
  assert.equal(zip.readUInt16LE(eocd + 10), 2);
  assert.ok(zip.includes(Buffer.from('een.txt')));
  assert.ok(zip.includes(Buffer.from('twee.bin')));
  assert.ok(zip.includes(Buffer.from('hallo')));
});

test('zipStore met nul bestanden geeft alleen een EOCD', () => {
  const zip = zipStore([]);
  assert.equal(zip.length, 22);
  assert.equal(zip.readUInt32LE(0), 0x06054b50);
  assert.equal(zip.readUInt16LE(10), 0);
});
