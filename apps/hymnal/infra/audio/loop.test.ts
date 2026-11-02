/**
 * Hymn 663 plays from the set `warm-2` in every key, which holds that hymn
 * alone; every other hymn plays from `warm-1` as before. The upload accepts a
 * `warm-2` manifest of exactly hymn 663, and still a whole `warm-1`.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import type { RecordingManifest } from '@manna/hymnal/recording-manifest';

import { audioKey, audioUrl } from '../../src/remote.ts';
import { SDAH_HYMNS } from './plan.ts';
import { manifestRefusals } from './upload-plan.ts';

/** The set `base` moved `offset` semitones: `warm-2-up3`, `warm-1-down2`; 0 is `base`. */
const setOf = (base: string, offset: number) => {
  let set = base;
  if (offset > 0) set = `${base}-up${offset}`;
  if (offset < 0) set = `${base}-down${-offset}`;
  return set;
};

const OFFSETS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

const manifestOf = (set: string, hymns: ReadonlyArray<number>): RecordingManifest => ({
  set,
  style: 'C Warm band',
  platform: 'darwin-arm64',
  configHash: 'c'.repeat(64),
  tools: { sfizz: { version: '1.2.3', sha256: 's' }, nodeAv: { version: '6.1.1' } },
  hymns: hymns.map((hymn) => ({
    hymn,
    key: `sdah/${hymn}.mp3`,
    file: `${hymn}.mp3`,
    bytes: 1000 + hymn,
    sha256: 'a'.repeat(64),
    md5: hymn.toString(16).padStart(32, '0'),
    seconds: 60,
    lufs: -16,
    truePeak: -2.5,
    lagMs: 3,
    passed: true,
  })),
});

describe("hymn 663's recordings", () => {
  it.effect('plays 663 from warm-2 in every key, an octave apart alike', () =>
    Effect.sync(() => {
      for (const offset of OFFSETS) {
        const key = `audio/${setOf('warm-2', offset)}/sdah/663.mp3`;
        expect(audioKey(663, offset)).toBe(key);
        for (const octaves of [-12, 0, 12])
          expect(audioUrl(663, offset + octaves)).toBe(`https://hymns.cvr.im/${key}`);
      }
    }),
  );

  it.effect('plays every other hymn from warm-1 in every key', () =>
    Effect.sync(() => {
      const wrong: Array<string> = [];
      for (const hymn of SDAH_HYMNS.filter((n) => n !== 663))
        for (const offset of OFFSETS) {
          const url = `https://hymns.cvr.im/audio/${setOf('warm-1', offset)}/sdah/${hymn}.mp3`;
          if (audioUrl(hymn, offset) !== url) wrong.push(`${hymn} ${offset}`);
        }
      expect(wrong.slice(0, 10)).toEqual([]);
      expect(audioUrl(1)).toBe('https://hymns.cvr.im/audio/warm-1/sdah/1.mp3');
    }),
  );

  it.effect('uploads a warm-2 manifest of exactly hymn 663, and a whole warm-1', () =>
    Effect.sync(() => {
      expect(manifestRefusals(manifestOf('warm-2', [663]))).toEqual([]);
      expect(manifestRefusals(manifestOf('warm-1', SDAH_HYMNS))).toEqual([]);
    }),
  );

  it.effect(
    'refuses a warm-2 manifest with a hymn more or less, a failed 663, or another set',
    () =>
      Effect.sync(() => {
        const failed = manifestOf('warm-2', [663]);
        const refused = [
          manifestOf('warm-2', [663, 1]),
          manifestOf('warm-2', [663, 663]),
          manifestOf('warm-2', []),
          manifestOf('warm-2', [1]),
          manifestOf('warm-2', SDAH_HYMNS),
          { ...failed, hymns: failed.hymns.map((h) => ({ ...h, passed: false })) },
          manifestOf('warm-3', [663]),
          manifestOf('warm-1', [663]),
        ];
        expect(refused.map((manifest) => manifestRefusals(manifest).length > 0)).toEqual(
          refused.map(() => true),
        );
      }),
  );
});
