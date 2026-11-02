import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { type Midi, type Note, secondsAt, secondsOf } from './midi.js';
import * as Sung from './sung.js';

const TPB = 96;

/** One verse of eight notes, a beat each, with a bass under each; the bass's last note held to the file's end. */
const oneVerse = (tempos: Midi['tempos']): Midi => {
  const keys = [60, 62, 64, 65, 67, 65, 64, 60];
  const tune: Note[] = keys.map((key, i) => ({
    start: i * TPB,
    end: (i + 1) * TPB,
    key,
    channel: 0,
  }));
  const bass: Note[] = keys.map((key, i) => ({
    start: i * TPB,
    end: i === keys.length - 1 ? 9 * TPB : (i + 1) * TPB,
    key: key - 24,
    channel: 1,
  }));
  return {
    ticksPerBeat: TPB,
    tracks: [
      { name: 'tune', notes: tune, program: 0 },
      { name: 'bass', notes: bass, program: 0 },
    ],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [{ tick: 0, fifths: 0, minor: false }],
    tempos,
    // A beat of silent tail after the last note.
    lastTick: 9 * TPB,
  };
};

const PASS = 9 * TPB;

describe('Sung.of', () => {
  it.effect(
    'sings a file of one verse once for each stanza, its opening tempo stated again at each pass',
    () =>
      Effect.sync(() => {
        const midi = oneVerse([
          { tick: 0, microsPerQuarter: 600_000 },
          { tick: 4 * TPB, microsPerQuarter: 900_000 },
          { tick: PASS, microsPerQuarter: 600_000 },
        ]);
        const sung = Sung.of(midi, 3);
        expect(sung.played).toBe(1);
        expect(sung.loop).toEqual({ start: 0, length: PASS, passes: 3 });
        expect(sung.score.verses.spans).toEqual([
          { start: 0, end: PASS },
          { start: PASS, end: 2 * PASS },
          { start: 2 * PASS, end: 2 * PASS + 8 * TPB },
        ]);
        expect(sung.score.verses.exact).toBe(false);
        expect(sung.midi.lastTick).toBe(3 * PASS);
        expect(sung.midi.tempos.map((t) => [t.tick, t.microsPerQuarter])).toEqual([
          [0, 600_000],
          [4 * TPB, 900_000],
          [PASS, 600_000],
          [PASS + 4 * TPB, 900_000],
          [2 * PASS, 600_000],
          [2 * PASS + 4 * TPB, 900_000],
          [3 * PASS, 600_000],
        ]);
        const seconds = secondsAt(sung.midi);
        for (let k = 0; k < 3; k++)
          expect(seconds((k + 1) * PASS) - seconds(k * PASS)).toBeCloseTo(secondsOf(midi), 9);
        // The bass held to the file's end ends where the next pass's first note starts.
        const bass = sung.midi.tracks[1]?.notes ?? [];
        expect(bass.filter((note) => note.end === PASS || note.start === PASS)).toHaveLength(2);
        expect(sung.midi.tracks[0]?.notes).toHaveLength(24);
        // The verse starts on the file's first tick, so its meter and key come again with each pass.
        expect(sung.midi.timeSignatures.map((m) => m.tick)).toEqual([0, PASS, 2 * PASS]);
        expect(sung.midi.keySignatures.map((k) => k.tick)).toEqual([0, PASS, 2 * PASS]);
      }),
  );

  it.effect('states the default tempo again at a pass when the file names none by then', () =>
    Effect.sync(() => {
      const sung = Sung.of(oneVerse([{ tick: 2 * TPB, microsPerQuarter: 800_000 }]), 2);
      expect(sung.midi.tempos.map((t) => [t.tick, t.microsPerQuarter])).toEqual([
        [2 * TPB, 800_000],
        [PASS, 500_000],
        [PASS + 2 * TPB, 800_000],
      ]);
    }),
  );

  it.effect('sings a file that plays a verse for each stanza as it stands', () =>
    Effect.sync(() => {
      const midi = oneVerse([{ tick: 0, microsPerQuarter: 600_000 }]);
      const sung = Sung.of(midi, 1);
      expect(sung.midi).toBe(midi);
      expect(sung.loop).toBeUndefined();
      expect(sung.played).toBe(1);
      expect(sung.score.verses.spans).toHaveLength(1);
    }),
  );
});
