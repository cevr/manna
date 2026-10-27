import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Chord from './chord.js';
import * as Midi from './midi.js';
import * as Fixture from './midi-fixture.js';
import * as Score from './score.js';

/** A dominant chord, then the closing chord on `tonic` (a pitch class), its third minor or major. */
const cadence = (tonic: number, minor: boolean): Fixture.Fixture => ({
  fifths: null,
  tracks: [
    {
      program: 5,
      voices: [
        [
          [72 + ((tonic + 7) % 12), 1],
          [79 + tonic, 2],
        ],
      ],
    },
    {
      program: 5,
      voices: [
        [
          [0, 1],
          [60 + tonic + (minor ? 3 : 4), 2],
        ],
      ],
    },
    {
      program: 5,
      voices: [
        [
          [48 + ((tonic + 7) % 12), 1],
          [48 + tonic, 2],
        ],
      ],
    },
  ],
});

const real = (n: number) =>
  Effect.gen(function* () {
    const path = new URL(`../data/midi/${String(n).padStart(3, '0')}.mid`, import.meta.url)
      .pathname;
    return yield* Midi.parse(yield* (yield* FileSystem.FileSystem).readFile(path));
  });

describe('Score.fromMidi', () => {
  it.effect('reads all 262 soprano notes on 388 and keeps dedicated legato on 33', () =>
    Effect.gen(function* () {
      const midi = yield* real(388);
      const selected = Score.melodyOf(midi, Score.harmonyTracks(midi));
      const soprano = midi.tracks[2]?.notes ?? [];
      expect(selected).toHaveLength(262);
      expect(selected).toEqual([...soprano]);
      const dedicated = yield* real(33);
      const first = dedicated.tracks.find((t) => t.notes.length > 0);
      expect(Score.melodyOf(dedicated, Score.harmonyTracks(dedicated))).toEqual(
        Score.topVoice(first?.notes ?? [], dedicated.ticksPerBeat / 16),
      );
    }).pipe(Effect.provide(BunServices.layer)),
  );
  it.effect('selects soprano behind polyphonic accompaniment and preserves dedicated melody', () =>
    Effect.gen(function* () {
      for (const dedicated of [false, true]) {
        const melody: Fixture.Voice = [
          [72, 1],
          [74, 1],
          [76, 2],
        ];
        const midi = yield* Midi.parse(
          Fixture.write({
            tracks: [
              {
                program: 105,
                voices: dedicated
                  ? [
                      [
                        [79, 1],
                        [77, 1],
                        [76, 2],
                      ],
                    ]
                  : [
                      [
                        [60, 1],
                        [62, 1],
                        [64, 2],
                      ],
                      [
                        [67, 1],
                        [69, 1],
                        [71, 2],
                      ],
                    ],
              },
              { program: 5, voices: [melody] },
            ],
          }),
        );
        const wanted = midi.tracks[dedicated ? 1 : 2]?.notes ?? [];
        expect(Score.melodyOf(midi, Score.harmonyTracks(midi))).toEqual([...wanted]);
      }
    }),
  );
  it.effect('names the key of a file with no signature from its closing chord', () =>
    Effect.gen(function* () {
      for (const minor of [false, true]) {
        for (let tonic = 0; tonic < 12; tonic++) {
          const midi = yield* Midi.parse(Fixture.write(cadence(tonic, minor)));
          expect(midi.keySignatures).toEqual([]);
          expect(Score.fromMidi(midi, 1).key).toEqual(Chord.keyOnPitch(tonic, minor));
        }
      }
    }),
  );

  it.effect('names the keys of the hymnal files that carry no signature', () =>
    Effect.gen(function* () {
      const keys = [
        [6, { tonic: 'C', minor: false }],
        [162, { tonic: 'D', minor: true }],
        [663, { tonic: 'G', minor: false }],
      ] as const;
      for (const [n, key] of keys) {
        const midi = yield* real(n);
        expect(midi.keySignatures).toEqual([]);
        expect(Score.fromMidi(midi, 1).key).toEqual(key);
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('takes a signed file at its signature, whatever its closing chord', () =>
    Effect.gen(function* () {
      const midi = yield* Midi.parse(Fixture.write({ ...cadence(2, true), fifths: -1 }));
      expect(Score.fromMidi(midi, 1).key).toEqual({ tonic: 'F', minor: false });
    }),
  );
});
