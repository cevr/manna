/**
 * The mirror's list, keys and headers, then the copy's plan from cached MD5s
 * and R2's listing alone: a key R2 holds with the file's size and MD5 is
 * kept (its ETag quoted or not, in any case), a key R2 lacks is uploaded,
 * and a key R2 holds with another size or MD5 is a conflict.
 */
import { describe, expect, it } from 'bun:test';

import { AM_MICHAEL, FILES, MIRROR, TOTAL_BYTES } from '../../src/natural/manifest.ts';
import {
  CACHE_CONTROL,
  CONTENT_TYPE,
  CopyItem,
  MIRROR_FILES,
  PREFIX,
  holds,
  keyOf,
  planCopy,
} from './plan.ts';

describe('the mirror’s list', () => {
  it('is the download’s 39 files, both voices among them, in path order, each once, summing to 83,332,513 bytes', () => {
    expect(TOTAL_BYTES).toBe(83_332_513);
    expect([...MIRROR_FILES]).toEqual([...FILES]);
    expect(MIRROR_FILES.length).toBe(39);
    expect(MIRROR_FILES.reduce((sum, file) => sum + file.bytes, 0)).toBe(83_332_513);
    const paths = MIRROR_FILES.map((file) => file.path);
    expect(new Set(paths).size).toBe(39);
    expect(paths.filter((path) => path === AM_MICHAEL.path)).toHaveLength(1);
    expect(paths).toEqual([...paths].sort());
    expect(paths.slice(-4)).toEqual(['README.md', 'af_heart.bin', 'am_michael.bin', 'vocab.json']);
    expect(paths.slice(0, 2)).toEqual([
      'KokoroAlbert.mlmodelc/analytics/coremldata.bin',
      'KokoroAlbert.mlmodelc/coremldata.bin',
    ]);
  });

  it('keys each file under kokoro/<revision>/, so the mirror URL of a path is its key on the mirror’s host', () => {
    expect(PREFIX).toBe('kokoro/2568276a60ff/');
    for (const file of MIRROR_FILES) {
      expect(keyOf(file.path)).toBe(`kokoro/2568276a60ff/${file.path}`);
      expect(`${MIRROR}${file.path}`).toBe(`https://models.heartseed.app/${keyOf(file.path)}`);
    }
  });

  it('serves every file as immutable octets for a year', () => {
    expect(CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
    expect(CONTENT_TYPE).toBe('application/octet-stream');
  });
});

const MD5 = '0123456789abcdef0123456789abcdef';
const OTHER = 'fedcba9876543210fedcba9876543210';
const file = (path: string, bytes: number) => ({ path, bytes, sha256: '0'.repeat(64) });

describe('the copy’s plan', () => {
  it('holds an object only at the file’s size and MD5, its ETag quoted or bare, in either case', () => {
    expect(holds({ size: 5, etag: MD5 }, 5, MD5)).toBe(true);
    expect(holds({ size: 5, etag: `"${MD5}"` }, 5, MD5)).toBe(true);
    expect(holds({ size: 5, etag: `"${MD5.toUpperCase()}"` }, 5, MD5)).toBe(true);
    expect(holds({ size: 6, etag: MD5 }, 5, MD5)).toBe(false);
    expect(holds({ size: 5, etag: OTHER }, 5, MD5)).toBe(false);
    expect(holds({ size: 5, etag: `${MD5}-2` }, 5, MD5)).toBe(false);
  });

  it('keeps what R2 holds, uploads what it lacks, and makes a conflict of other bytes, in list order', () => {
    const files = [file('a/x.bin', 5), file('b.bin', 5), file('c.bin', 5), file('d.bin', 5)];
    const listing = new Map([
      [keyOf('a/x.bin'), { size: 5, etag: `"${MD5.toUpperCase()}"` }],
      [keyOf('c.bin'), { size: 5, etag: `"${OTHER}"` }],
      [keyOf('d.bin'), { size: 4, etag: `"${MD5}"` }],
      ['kokoro/other/b.bin', { size: 5, etag: MD5 }],
      ['b.bin', { size: 5, etag: MD5 }],
    ]);
    const items = planCopy(
      files.map((each) => ({ file: each, md5: MD5 })),
      listing,
    );
    expect(items.map((item) => [item._tag, item.key])).toEqual([
      ['Keep', 'kokoro/2568276a60ff/a/x.bin'],
      ['Upload', 'kokoro/2568276a60ff/b.bin'],
      ['Conflict', 'kokoro/2568276a60ff/c.bin'],
      ['Conflict', 'kokoro/2568276a60ff/d.bin'],
    ]);
    const upload = items.find(CopyItem.$is('Upload'));
    expect(upload?.md5).toBe(MD5);
    expect(items.filter(CopyItem.$is('Conflict')).map((item) => item.held.size)).toEqual([5, 4]);
  });
});
