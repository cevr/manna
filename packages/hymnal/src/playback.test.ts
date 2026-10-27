import { Effect, Result, Schema } from 'effect';
import { expect, it } from 'effect-bun-test';
import { Hymn } from './hymn.js';
import { Playback, applyMetadata, metadataOf } from './playback.js';

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
