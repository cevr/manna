import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Chord from './chord.js';
import * as Harmony from './harmony.js';
import * as Midi from './midi.js';
import * as Fixture from './midi-fixture.js';
import * as Score from './score.js';

const [S, A, T, B] = Fixture.praiseToTheLord;
const bars = (voice: Fixture.Voice | undefined, from: number, to: number): Fixture.Voice => {
  const out: Array<readonly [number, number]> = [];
  let beat = 0;
  for (const note of voice ?? []) {
    if (beat >= from * 3 && beat < to * 3) out.push(note);
    beat += note[1];
  }
  return out;
};
/** As the hymnal's files are laid out: an intro of the first two bars, then each verse in full. */
const played = (voice: Fixture.Voice | undefined, verses: number) => [
  ...bars(voice, 0, 2),
  ...Array.from({ length: verses }, () => voice ?? []).flat(),
];

const praise = (layout: 'voices' | 'pairs') =>
  Effect.gen(function* () {
    const v = [S, A, T, B].map((voice) => played(voice, 2));
    const tracks =
      layout === 'voices'
        ? v.map((voice, i) => ({ name: i === 0 ? 'S A T B' : '', program: 5, voices: [voice] }))
        : [
            { name: 'SA TB', program: 5, voices: [v[0] ?? [], v[1] ?? []] },
            { program: 5, voices: [v[2] ?? [], v[3] ?? []] },
          ];
    const midi = yield* Midi.parse(Fixture.write({ meter: [3, 4], fifths: -1, tracks }));
    return Score.fromMidi(midi, 2);
  });

const written = (score: Score.Score, level: Harmony.Level) =>
  Harmony.onNotes(score, score.verses.spans[0]?.start ?? 0, score.verses.spans[0]?.end ?? 0, level)
    .map(({ changes }) =>
      changes.map((c) => `${c.offset > 0 ? '~' : ''}${Chord.format(c.chord, score.key)}`).join(' '),
    )
    .join(' | ');

describe('Score.fromMidi', () => {
  it.effect('finds the intro and the verses after it, with one track per voice or per pair', () =>
    Effect.gen(function* () {
      for (const layout of ['voices', 'pairs'] as const) {
        const score = yield* praise(layout);
        expect(score.key).toEqual({ tonic: 'F', minor: false });
        expect(score.beatsPerBar).toBe(3);
        expect(score.verses).toEqual({
          spans: [
            { start: 2 * 3 * 384, end: 8 * 3 * 384 },
            { start: 8 * 3 * 384, end: 14 * 3 * 384 },
          ],
          exact: true,
        });
        expect(score.melody.length).toBe(6 + 2 * 14);
      }
    }),
  );
});

describe('Score.findVerses', () => {
  /** A bar of 2/4 at 384 ticks per beat: the tunes here are in 2/4 unless a case says else. */
  const BAR = 2 * 384;

  it.effect(
    'finds verses played each in its own rhythm, each after the pause that ends the last',
    () =>
      Effect.sync(() => {
        const tune = [60, 62, 64, 65, 67, 65, 64, 62, 60];
        // A verse's last note is long; verse 2 splits its third note for an extra syllable.
        const verse = (split: boolean): Fixture.Voice =>
          tune.flatMap((key, i): Fixture.Voice => {
            if (split && i === 2)
              return [
                [key, 0.5],
                [key, 0.5],
              ];
            return [[key, i === 8 ? 3 : 1]];
          });
        const intro: Fixture.Voice = [
          [64, 1],
          [62, 1],
          [60, 3],
        ];
        let beat = 0;
        const melody = [...intro, ...verse(false), ...verse(true)].map(([key, beats]) => {
          const note = { key, start: beat * 384, end: (beat + beats) * 384, channel: 0 };
          beat += beats;
          return note;
        });
        const found = Score.findVerses(melody, 2, BAR);
        expect(found.exact).toBe(false);
        expect(found.spans.map((span) => span.start / 384)).toEqual([5, 16]);
      }),
  );

  // A ten-note tune that ends on a held note, and the file laid out from voices: each note's
  // start in beats, as a melody of 384 ticks per beat.
  const TUNE: Fixture.Voice = [
    [60, 1],
    [62, 1],
    [64, 1],
    [65, 2],
    [67, 1],
    [69, 1],
    [67, 1],
    [65, 1],
    [64, 1],
    [62, 4],
  ];
  /** The tune with note `p` split in two, for an extra syllable. */
  const splitAt = (tune: Fixture.Voice, p: number): Fixture.Voice =>
    tune.flatMap((note, i): Fixture.Voice =>
      i === p
        ? [
            [note[0], note[1] / 2],
            [note[0], note[1] / 2],
          ]
        : [note],
    );
  const file = (...voices: readonly Fixture.Voice[]) => {
    let beat = 0;
    return voices.flat().map(([key, beats]) => {
      const note = { key, start: beat * 384, end: (beat + beats) * 384, channel: 0 };
      beat += beats;
      return note;
    });
  };
  const startsOf = (verses: Score.Verses) => verses.spans.map((span) => span.start / 384);
  const INTRO = TUNE.slice(7);

  it.effect(
    'finds a verse in its own rhythm before verses that repeat exactly, not as part of the intro',
    () =>
      Effect.sync(() => {
        // 493's shape: verse 1 splits a note, verses 2 and 3 repeat exactly. The intro takes 6
        // beats, each verse 14 beats.
        const melody = file(INTRO, splitAt(TUNE, 2), TUNE, TUNE);
        const found = Score.findVerses(melody, 3, BAR);
        expect(startsOf(found)).toEqual([6, 20, 34]);
        expect(found.exact).toBe(false);
      }),
  );

  it.effect(
    'starts the first exact verse on its own first note when it is the one in its own rhythm',
    () =>
      Effect.sync(() => {
        // The tune opens on a repeated key; verse 2 splits its second note, so its third note
        // opens the run that repeats exactly, one note late. Verses start at beats 6, 20, 34.
        const tune: Fixture.Voice = [[60, 1], ...TUNE];
        const intro = tune.slice(8);
        const melody = file(intro, tune, splitAt(tune, 1), tune, tune);
        expect(startsOf(Score.findVerses(melody, 4, BAR))).toEqual([6, 21, 36, 51]);
      }),
  );

  it.effect('finds every verse when alternate verses are sung in a second rhythm', () =>
    Effect.sync(() => {
      // 212's and 305's shape: verses 2 and 4 split a note, so the file repeats exactly as two
      // pairs of verses.
      const melody = file(INTRO, TUNE, splitAt(TUNE, 4), TUNE, splitAt(TUNE, 4));
      const found = Score.findVerses(melody, 4, BAR);
      expect(startsOf(found)).toEqual([6, 20, 34, 48]);
      expect(found.exact).toBe(false);
    }),
  );

  it.effect(
    'starts each stanza of a pair on the note the verses open on, not on the last note before it',
    () =>
      Effect.sync(() => {
        // 305's shape: each verse ends on a held note and then a shorter last note, so the
        // longest pause falls before that last note, one note early.
        const tune: Fixture.Voice = [...TUNE.slice(0, 8), [64, 4], [62, 2]];
        const melody = file(tune.slice(7), tune, splitAt(tune, 4), tune, splitAt(tune, 4));
        expect(startsOf(Score.findVerses(melody, 4, BAR))).toEqual([7, 22, 37, 52]);
      }),
  );

  it.effect('keeps the verses a file plays when it plays fewer than the text has', () =>
    Effect.sync(() => {
      // Two exact verses after a short intro, for a text of three stanzas: the file plays two.
      expect(Score.findVerses(file(INTRO, TUNE, TUNE), 3, BAR)).toEqual({
        spans: [
          { start: 6 * 384, end: 20 * 384 },
          { start: 20 * 384, end: 34 * 384 },
        ],
        exact: true,
      });
    }),
  );

  it.effect(
    'keeps each verse on its first note when a longer rest follows within a few notes',
    () =>
      Effect.sync(() => {
        // Verse 1 splits a note; every verse rests 6 beats on its fourth note, longer than the
        // held note before each verse.
        const rested: Fixture.Voice = TUNE.map((note, i) => (i === 3 ? [note[0], 6] : note));
        const melody = file(rested.slice(7), splitAt(rested, 6), rested, rested);
        expect(startsOf(Score.findVerses(melody, 3, BAR))).toEqual([6, 24, 42]);
      }),
  );

  it.effect(
    'starts verse 1 where the intro ends as the tune ends, not after a longer note inside it',
    () =>
      Effect.sync(() => {
        // 54's and 288's shape: the intro is the tune's last line, with a 3-beat note before
        // its last three notes; verse 2 splits a note. The intro ends at beat 7, each verse is
        // 16 beats.
        const held: Fixture.Voice = TUNE.map((note, i) => (i === 6 ? [note[0], 3] : note));
        const intro: Fixture.Voice = [...held.slice(5, 9), [62, 1]];
        const found = Score.findVerses(file(intro, held, splitAt(held, 2)), 2, BAR);
        expect(startsOf(found)).toEqual([7, 23]);
        expect(found.exact).toBe(false);
      }),
  );

  it.effect('starts verse 1 on the first note when no intro of two bars fits', () =>
    Effect.sync(() => {
      // 58's shape: a 4/4 file with no intro, its first two bars in quarter notes; verse 2 splits
      // its next-to-last note. The closest split puts a one-note intro before verse 1.
      const tune: Fixture.Voice = [60, 62, 64, 65, 67, 65, 64, 62, 64, 65, 67, 64]
        .map((key): readonly [number, number] => [key, 1])
        .concat([[62, 4]]);
      const found = Score.findVerses(file(tune, splitAt(tune, 11)), 2, 4 * 384);
      expect(startsOf(found)).toEqual([0, 16]);
    }),
  );

  it.effect(
    'starts a verse on the first of a split pickup, where the verse before ends as the tune ends',
    () =>
      Effect.sync(() => {
        // 475's and 525's shape: a 4/4 tune on a one-beat pickup, its intro three bars less the
        // pickup. Verse 2 splits the pickup in two for an extra syllable, so its second half
        // opens as verse 1 does, and the first half follows verse 1's ending. Verse 3 splits its
        // second note. Verses start at beats 11, 24, 37.
        const tune: Fixture.Voice = [
          [60, 1],
          [64, 1],
          [65, 1],
          [67, 2],
          [65, 1],
          [64, 1],
          [62, 1],
          [64, 1],
          [62, 1],
          [59, 3],
        ];
        const intro: Fixture.Voice = [...tune.slice(1, 9), [59, 2]];
        const melody = file(intro, tune, splitAt(tune, 0), splitAt(tune, 1));
        expect(startsOf(Score.findVerses(melody, 3, 4 * 384))).toEqual([11, 24, 37]);
      }),
  );
});

describe('Harmony.onNotes', () => {
  it.effect(
    'puts each change on the note it falls on, and changes under a held note after it',
    () =>
      Effect.gen(function* () {
        const score = yield* praise('pairs');
        expect(written(score, 'full')).toBe(
          'F | Dm | C/E | F | C | Dm | Am | Bb | F | Bb | Edim/G | Dm | Gm7/Bb ~C ~C7 | F',
        );
        expect(written(score, 'guitar')).toBe(
          'F | Dm | C | F | C | Dm | Am | Bb | F | Bb | C7 | Dm | Gm7 ~C ~C7 | F',
        );
      }),
  );
});
