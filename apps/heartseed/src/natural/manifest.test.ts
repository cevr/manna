/* oxlint-disable effect/noTernary, effect/noGlobals, effect/noNodeBuiltinImport -- the generator and the hand-written base reader write their choices as plain branches, a failing ask is named by its JSON, and the pinned list is hashed plainly, as data.test.ts hashes its files. */

/**
 * The pinned download: 39 files of the seven Kokoro stages, the two voices
 * and the vocab, each with a size and a SHA-256, summing to the total; the
 * voices, their packs and their pronunciation lists; the revision's short name and the mirror's
 * folder. Then the base a download
 * reads from, as a property over seeded asks against a reader of the rule
 * written by hand here: a release build always reads the mirror, and a
 * development build reads a plain http(s) folder it was asked for.
 */

import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { Option } from 'effect';

import {
  baseFor,
  BM_GEORGE,
  FILES,
  LISTS,
  MIRROR,
  REVISION,
  SOURCE_REVISION,
  TOTAL_BYTES,
  VOICES,
} from './manifest';

/** The SHA-256 of the 39 `path:bytes:sha256` lines, joined by newlines: hsnatural's kokoro-manifest.json's 38 and the bm_george.bin pin, in path order. */
const MANIFEST_DIGEST = '14526ee4214d51f9dd31cb1b98f8e4e5a3aaf42d17470a2a2ee5dc5563eb5556';

const STAGES = [
  'KokoroAlbert',
  'KokoroAlignment',
  'KokoroNoise_v2',
  'KokoroPostAlbert',
  'KokoroProsody_v2',
  'KokoroTail_v2',
  'KokoroVocoder',
];

describe('the pinned files', () => {
  it('lists 39 distinct files, each with a positive size and a SHA-256, summing to the total', () => {
    expect(FILES.length).toBe(39);
    expect(new Set(FILES.map((file) => file.path)).size).toBe(39);
    for (const file of FILES) {
      expect(Number.isSafeInteger(file.bytes) && file.bytes > 0, file.path).toBe(true);
      expect(file.sha256, file.path).toMatch(/^[0-9a-f]{64}$/);
      expect(file.path, file.path).toMatch(/^(?!\/)(?!.*\.\.)[A-Za-z0-9_./]+$/);
    }
    expect(FILES.reduce((sum, file) => sum + file.bytes, 0)).toBe(TOTAL_BYTES);
    expect(TOTAL_BYTES).toBe(83_332_513);
  });

  it('holds each of the seven stages compiled, both voices and the vocab, in path order', () => {
    const paths = FILES.map((file) => file.path);
    for (const stage of STAGES)
      for (const part of ['coremldata.bin', 'model.mil', 'weights/weight.bin'])
        expect(paths).toContain(`${stage}.mlmodelc/${part}`);
    expect(paths.filter((path) => !path.includes('.mlmodelc/'))).toEqual([
      'LICENSE',
      'README.md',
      'af_heart.bin',
      'bm_george.bin',
      'vocab.json',
    ]);
    expect(paths).toEqual([...paths].sort());
  });

  it('is exactly hsnatural’s kokoro-manifest.json and the bm_george.bin pin: its `path:bytes:sha256` lines hash to that list’s digest', () => {
    const lines = FILES.map((file) => `${file.path}:${file.bytes}:${file.sha256}`).join('\n');
    expect(createHash('sha256').update(lines).digest('hex')).toBe(MANIFEST_DIGEST);
  });

  it('names the revision it was taken at, its short name and the mirror’s folder for it', () => {
    expect(SOURCE_REVISION).toMatch(/^[0-9a-f]{40}$/);
    expect(REVISION).toBe(SOURCE_REVISION.slice(0, 12));
    expect(MIRROR).toBe(`https://models.heartseed.app/kokoro/${REVISION}/`);
  });

  it('pins the second voice’s pack, bm_george.bin, in the download between af_heart.bin and the vocab', () => {
    expect(BM_GEORGE).toEqual({
      path: 'bm_george.bin',
      bytes: 522_240,
      sha256: 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc',
    });
    expect(FILES[37]).toEqual(BM_GEORGE);
    expect(FILES.filter((file) => file.path === BM_GEORGE.path)).toHaveLength(1);
  });

  it('names the two voices, Her and Him, each with its pack in the download', () => {
    expect([...VOICES]).toEqual(['af_heart', 'bm_george']);
    for (const voice of VOICES) {
      expect(
        FILES.filter((file) => file.path === `${voice}.bin`),
        voice,
      ).toHaveLength(1);
    }
  });

  it('gives each voice its pronunciation list: Her the American one, Him the British one', () => {
    expect(LISTS).toEqual({ af_heart: 'us', bm_george: 'gb' });
    expect(Object.keys(LISTS)).toEqual([...VOICES]);
  });
});

const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
};

const HOST = /^[A-Za-z0-9.-]$/;
const SEGMENT = /^[A-Za-z0-9._~-]$/;

/** The rule read by hand, character by character: `http://` or `https://`, a host, an optional port of 1-5 digits, `/`, then plain segments each ending in `/`. */
const plainFolder = (ask: string): boolean => {
  const scheme = ask.startsWith('http://') ? 7 : ask.startsWith('https://') ? 8 : 0;
  if (scheme === 0) return false;
  const path = afterPort(ask, afterHost(ask, scheme));
  if (path < 0 || ask.charAt(path) !== '/') return false;
  return plainSegments(ask, path + 1);
};

/** Where a host of at least one character ends, or -1 when there is none. */
const afterHost = (ask: string, start: number): number => {
  let at = start;
  while (at < ask.length && HOST.test(ask.charAt(at))) at++;
  return at === start ? -1 : at;
};

/** Where an optional `:` and 1-5 digits end, or -1 for a bad port. */
const afterPort = (ask: string, start: number): number => {
  if (start < 0 || ask.charAt(start) !== ':') return start;
  let at = start + 1;
  while (at < ask.length && /^[0-9]$/.test(ask.charAt(at))) at++;
  const digits = at - start - 1;
  return digits === 0 || digits > 5 ? -1 : at;
};

/** The rest is nothing, or segments of plain characters each closed by `/`. */
const plainSegments = (ask: string, start: number): boolean => {
  let at = start;
  let segment = 0;
  while (at < ask.length) {
    const char = ask.charAt(at);
    if (char === '/') {
      if (segment === 0) return false;
      segment = 0;
    } else if (SEGMENT.test(char)) segment++;
    else return false;
    at++;
  }
  return segment === 0;
};

describe('the base a download reads from', () => {
  it('is the mirror in a release build, whatever was asked', () => {
    expect(baseFor(false, Option.none())).toBe(MIRROR);
    expect(baseFor(false, Option.some('http://localhost:8285/'))).toBe(MIRROR);
    expect(baseFor(false, Option.some(MIRROR))).toBe(MIRROR);
  });

  it('is the mirror in a development build asked nothing', () => {
    expect(baseFor(true, Option.none())).toBe(MIRROR);
  });

  it('reads the hand-made edges as the rule does', () => {
    const cases: ReadonlyArray<readonly [string, boolean]> = [
      ['http://localhost:8285/', true],
      ['https://192.168.40.13/kokoro/2568276a60ff/', true],
      ['http://a/~x_.-/', true],
      ['http://localhost:65535/', true],
      ['http://localhost:123456/', false],
      ['http://localhost:/', false],
      ['http://localhost', false],
      ['http://localhost/kokoro', false],
      ['http://localhost//', false],
      ['http:///', false],
      ['HTTP://localhost/', false],
      ['ftp://localhost/', false],
      ['http://local host/', false],
      ['http://x_y/', false],
      ['http://localhost/?x=1', false],
      ['http://localhost/#h', false],
      ['http://localhost/\n', false],
      ['http://localhost/ ', false],
      [' http://localhost/', false],
      ['http://user@localhost/', false],
      ['', false],
    ];
    for (const [ask, plain] of cases) {
      expect(plainFolder(ask), JSON.stringify(ask)).toBe(plain);
      expect(baseFor(true, Option.some(ask)), JSON.stringify(ask)).toBe(plain ? ask : MIRROR);
    }
  });

  it('takes a development ask exactly when it is a plain http(s) folder, over seeded asks', () => {
    const next = random(41_107);
    const pick = <A>(list: ReadonlyArray<A>): A => list[Math.floor(next() * list.length)] as A;
    const schemes = ['http://', 'https://', 'Http://', 'http:/', 'https:', 'ws://', ''];
    const hosts = [
      'localhost',
      '10.0.0.2',
      'models.heartseed.app',
      'a-b',
      '',
      'a b',
      'a_b',
      'é',
      '[::1]',
    ];
    const ports = ['', '', ':8285', ':0', ':65535', ':99999', ':123456', ':', ':8a', '::1'];
    const segments = ['kokoro', REVISION, '~x_.-', '', 'a b', 'a?', '%20', 'é'];
    const tails = ['', '', '', '/', '?q', '#f', '\n', ' ', '.'];
    let taken = 0;
    let refused = 0;
    const ask = (plain: boolean) => {
      const from = <A>(list: ReadonlyArray<A>, good: number): A =>
        plain ? pick(list.slice(0, good)) : pick(list);
      const depth = Math.floor(next() * 4);
      const path = Array.from({ length: depth }, () => `${from(segments, 3)}/`).join('');
      const slash = plain || next() < 0.85 ? '/' : '';
      return `${from(schemes, 2)}${from(hosts, 4)}${from(ports, 5)}${slash}${path}${from(tails, 3)}`;
    };
    for (let i = 0; i < 5_000; i++) {
      const asked = ask(next() < 0.4);
      const dev = next() < 0.7;
      const want = dev && plainFolder(asked) ? asked : MIRROR;
      if (want === asked) taken++;
      else if (dev) refused++;
      expect(baseFor(dev, Option.some(asked)), `${dev} ${JSON.stringify(asked)}`).toBe(want);
    }
    expect(taken).toBeGreaterThan(300);
    expect(refused).toBeGreaterThan(300);
  });
});
