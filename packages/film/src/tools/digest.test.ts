import { describe, expect, test } from 'bun:test';

import { cacheKey, hashing, hmacSha256, sameText, sha256Hex } from './digest.ts';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

describe('digest', () => {
  test('sha256Hex gives the FIPS 180-2 sha256 of text and of bytes, as lowercase hex', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex(new Uint8Array([0x61, 0x62, 0x63]))).toBe(sha256Hex('abc'));
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  test('hashing fed in chunks ends at the sha256 of the whole', () => {
    const into = hashing();
    into.update(new TextEncoder().encode('a'));
    into.update(new TextEncoder().encode('bc'));
    expect(into.hex()).toBe(sha256Hex('abc'));
  });

  test('hmacSha256 gives RFC 4231 test case 2', () => {
    expect(hex(hmacSha256(new TextEncoder().encode('Jefe'), 'what do ya want for nothing?'))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  test("cacheKey is 20 hex digits of the SHA-1 of its parts joined by '|'", () => {
    expect(cacheKey(['abc'])).toBe('a9993e364706816aba3e');
    expect(cacheKey(['a', 'bc'])).toBe(cacheKey(['a|bc']));
    expect(cacheKey(['a', 1])).toBe(cacheKey(['a|1']));
  });

  test('sameText holds only for the same text', () => {
    expect(sameText('whsec_one', 'whsec_one')).toBe(true);
    expect(sameText('whsec_one', 'whsec_two')).toBe(false);
    expect(sameText('whsec_one', 'whsec_on')).toBe(false);
  });
});
