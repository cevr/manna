/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- read-only generated JSON storage guard checks raw fields and bytes. */
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'bun:test';
import { Effect, Result, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';
import { Hymn } from './hymn.js';
import { Playback, applyMetadata, metadataOf } from './playback.js';

test('playback sidecars stay one line, hymn-local and below 17 MB', () => {
  const data = new URL('../data/', import.meta.url);
  const folder = new URL('playback/', data);
  const names = readdirSync(folder).filter((name) => name.endsWith('.json'));
  const census = JSON.parse(readFileSync(new URL('census.json', folder), 'utf8'));
  const faults: number[][] = [];
  let bytes = 0;
  let hymns = 0;
  for (const name of names) {
    const raw = readFileSync(new URL(name, folder), 'utf8');
    bytes += Buffer.byteLength(raw);
    if (!/^\d{3}\.json$/.test(name)) continue;
    const number = Number(name.slice(0, 3));
    hymns++;
    if (!raw.endsWith('\n') || raw.trimEnd().includes('\n')) faults.push([number, 1]);
    const metadata = JSON.parse(raw);
    const row = census.census.find((row: { number: number }) => row.number === number);
    const levels = [...metadata.stanzas, ...metadata.refrain].map((part) => part.level);
    if (JSON.stringify(row?.levels) !== JSON.stringify(levels)) faults.push([number, 4]);
    const digest = new Bun.CryptoHasher('sha256')
      .update(readFileSync(new URL(`sdah-1985/${name}`, data)))
      .digest('hex');
    if (metadata.sourceHash !== digest) faults.push([number, 2]);
    if (
      Object.keys(metadata).some(
        (key) =>
          !['version', 'number', 'sourceHash', 'timing', 'verses', 'stanzas', 'refrain'].includes(
            key,
          ),
      )
    )
      faults.push([number, 3]);
  }
  expect(hymns).toBe(695);
  expect(faults.slice(0, 10)).toEqual([]);
  expect(bytes).toBeLessThan(17_000_000);
  const changed = census.census
    .filter(
      (row: { levels: number[]; baseline: { levels: number[] } }) =>
        JSON.stringify(row.levels) !== JSON.stringify(row.baseline.levels),
    )
    .map((row: { number: number }) => row.number);
  expect(
    changed,
    'Follow levels changed; run bun run --cwd packages/hymnal playback and review the census',
  ).toEqual([214, 388]);
});

const hymn = Schema.decodeSync(Hymn)({
  version: 1,
  book: 'sdah-1985',
  number: 1,
  title: 'Synthetic 1',
  key: { tonic: 'C', minor: false },
  meter: { numerator: 4, denominator: 4 },
  verses: { text: 1, midi: 1, exact: true },
  stanzas: [
    {
      _tag: 'Sung',
      level: 'syllable',
      why: [],
      fit: { notes: 2, syllables: 1, melismas: 1, shared: { inWord: 0, acrossWords: 0 }, cost: 0 },
      lines: [
        [
          {
            text: 'token',
            word: 0,
            notes: 2,
            beats: 2,
            guitar: [{ chord: { root: 0, quality: '' }, at: 0 }],
          },
        ],
      ],
    },
  ],
  timing: {
    perBeat: 96,
    tempos: [[0, 500000]],
    intro: 0,
    end: 192,
    lines: [{ start: 0, until: 192, syllables: [0], played: true, even: false }],
  },
});

it.effect('numeric playback joins cuts and chords without storing words', () =>
  Effect.gen(function* () {
    const metadata = yield* metadataOf(hymn, 'fingerprint');
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Playback))(metadata);
    expect(encoded.includes('token')).toBe(false);
    expect(encoded.includes('Synthetic')).toBe(false);
    const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(Playback))(encoded);
    const joined = yield* applyMetadata(hymn, decoded, 'fingerprint');
    expect(joined).toEqual(hymn);
  }),
);

it.effect('numeric playback fit carries exactly zero or six bounded values', () =>
  Effect.gen(function* () {
    const metadata = yield* metadataOf(hymn, 'fingerprint');
    for (let length = 0; length <= 7; length++) {
      const candidate = {
        ...metadata,
        stanzas: metadata.stanzas.map((part) => ({ ...part, fit: Array(length).fill(0) })),
      };
      expect(Schema.is(Playback)(candidate)).toBe(length === 0 || length === 6);
    }
  }),
);

it.effect('numeric playback refuses stale sources, identity, shape and invalid cuts', () =>
  Effect.gen(function* () {
    const metadata = yield* metadataOf(hymn, 'fingerprint');
    for (const changed of [
      { ...metadata, sourceHash: 'stale' },
      { ...metadata, number: 2 },
      { ...metadata, stanzas: [] },
      { ...metadata, timing: { ...metadata.timing, lines: [] } },
      {
        ...metadata,
        timing: {
          ...metadata.timing,
          lines: metadata.timing.lines.map((line) => ({ ...line, syllables: [] })),
        },
      },
      {
        ...metadata,
        stanzas: metadata.stanzas.map((part) => ({
          ...part,
          lines: part.lines.map((line) => line.map((cut) => ({ ...cut, offset: 1 }))),
        })),
      },
    ]) {
      const result = yield* applyMetadata(hymn, changed, 'fingerprint').pipe(Effect.result);
      expect(Result.isFailure(result)).toBe(true);
    }
  }),
);
