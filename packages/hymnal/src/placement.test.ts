import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import type * as Chord from './chord.js';
import * as Placement from './placement.js';

/**
 * The owner's feel on hymn 373, refrain line 0 (worship, 2026-10-23): the
 * first chord on syllable 3 and the second on syllable 7. Written down
 * before the rules, so no rule is tuned to it.
 */
const OWNER_373 = [3, 7] as const;

/** A case over pure functions. */
const check = (name: string, body: () => void) => it.effect(name, () => Effect.sync(body));

const chord = (root: number, quality: Chord.Quality = ''): Chord.Chord => ({ root, quality });
const C = chord(0);
const F = chord(5);
const G = chord(7);

/** Four ticks a quarter: an eighth is 2, a bar of 4/4 is 16. */
const grid = (meters: Placement.Grid['meters'], tonic = 0): Placement.Grid => ({
  ticksPerBeat: 4,
  meters,
  tonic,
});
const FOUR = grid([{ tick: 0, numerator: 4, denominator: 4 }]);
const SIX_EIGHT = grid([{ tick: 0, numerator: 6, denominator: 8 }]);

/** Syllables from [start, length, key] triples. */
const syllables = (...notes: ReadonlyArray<readonly [number, number, number]>) =>
  notes.map(([start, length, key]) => ({ start, length, key }));

const line = (
  sung: Placement.Line['syllables'],
  changes: ReadonlyArray<readonly [number, Chord.Chord, number?]>,
  before: Chord.Chord | 'none' = C,
): Placement.Line => {
  const last = sung.at(-1);
  return {
    syllables: sung,
    changes: changes.map(([syllable, c, at]) => ({ syllable, at: at ?? 0, chord: c })),
    until: last === undefined ? 0 : last.start + last.length,
    before: before === 'none' ? undefined : before,
  };
};

/** Where each change lands: its syllable, and its ticks into it when not 0. */
const where = (id: Placement.RuleId, l: Placement.Line, g: Placement.Grid) =>
  Placement.apply(id, l, g).map((c) => (c.at === 0 ? c.syllable : [c.syllable, c.at]));

/** Eight quarters over two bars of 4/4, the tune C D E F G A B C. */
const quarters = syllables(
  [0, 4, 60],
  [4, 4, 62],
  [8, 4, 64],
  [12, 4, 65],
  [16, 4, 67],
  [20, 4, 69],
  [24, 4, 71],
  [28, 4, 72],
);

describe('the beat grid', () => {
  check(
    'counts bars from each meter, strong on the first beat and the middle of a four-beat bar',
    () => {
      const g = grid([
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 16, numerator: 3, denominator: 4 },
      ]);
      expect([0, 4, 8, 12, 16, 20, 28].map((t) => Placement.beatAt(g, t))).toEqual([
        { bar: 0, beat: 0, on: true, strong: true },
        { bar: 0, beat: 1, on: true, strong: false },
        { bar: 0, beat: 2, on: true, strong: true },
        { bar: 0, beat: 3, on: true, strong: false },
        { bar: 1, beat: 0, on: true, strong: true },
        { bar: 1, beat: 1, on: true, strong: false },
        { bar: 2, beat: 0, on: true, strong: true },
      ]);
    },
  );

  check('beats a compound bar in dotted quarters', () => {
    expect([0, 2, 6, 12].map((t) => Placement.beatAt(SIX_EIGHT, t))).toEqual([
      { bar: 0, beat: 0, on: true, strong: true },
      { bar: 0, beat: 0, on: false, strong: false },
      { bar: 0, beat: 1, on: true, strong: false },
      { bar: 1, beat: 0, on: true, strong: true },
    ]);
  });
});

describe('R1 strong beat', () => {
  check('moves a change to the next strong beat', () => {
    expect(
      where(
        'strong',
        line(quarters, [
          [0, C],
          [1, G],
        ]),
        FOUR,
      ),
    ).toEqual([0, 2]);
  });

  check('keeps a change whose strong beat is taken by the next change', () => {
    expect(
      where(
        'strong',
        line(quarters, [
          [0, C],
          [1, G],
          [2, F],
        ]),
        FOUR,
      ),
    ).toEqual([0, 1, 2]);
  });

  check('lands inside a held note when the strong beat falls there', () => {
    const held = syllables([0, 4, 60], [4, 8, 62], [12, 4, 64]);
    expect(
      where(
        'strong',
        line(held, [
          [0, C],
          [1, G],
        ]),
        FOUR,
      ),
    ).toEqual([0, [1, 4]]);
  });

  check('keeps a change with no strong beat left in its line', () => {
    const short = syllables([0, 4, 60], [4, 4, 62]);
    expect(
      where(
        'strong',
        line(short, [
          [0, C],
          [1, G],
        ]),
        FOUR,
      ),
    ).toEqual([0, 1]);
  });

  check("moves a line's first change only when a chord sounds before the line", () => {
    const pickup = syllables([4, 4, 62], [8, 4, 64], [12, 4, 65]);
    expect(where('strong', line(pickup, [[0, G]], 'none'), FOUR)).toEqual([0]);
    expect(where('strong', line(pickup, [[0, G]], C), FOUR)).toEqual([1]);
    expect(where('strong', line(pickup, [[0, G]], G), FOUR)).toEqual([0]);
  });

  check('waits a whole bar of 6/8 for the downbeat', () => {
    const six = syllables([0, 6, 60], [6, 6, 62], [12, 6, 64]);
    expect(
      where(
        'strong',
        line(six, [
          [0, C],
          [1, G],
        ]),
        SIX_EIGHT,
      ),
    ).toEqual([0, 2]);
  });
});

describe('R1b any beat', () => {
  check('keeps a change on a beat and moves one off it to the next', () => {
    const six = syllables([0, 2, 60], [2, 4, 62], [6, 6, 64]);
    expect(
      where(
        'beat',
        line(six, [
          [0, C],
          [1, G],
        ]),
        SIX_EIGHT,
      ),
    ).toEqual([0, 2]);
    expect(
      where(
        'beat',
        line(quarters, [
          [0, C],
          [1, G],
        ]),
        FOUR,
      ),
    ).toEqual([0, 1]);
  });
});

describe('R2 melody chord tone', () => {
  check('moves a change to the first syllable that sings a tone of its chord', () => {
    const tune = syllables([0, 4, 60], [4, 4, 65], [8, 4, 64], [12, 4, 67]);
    expect(
      where(
        'tone',
        line(tune, [
          [0, C],
          [1, G],
        ]),
        FOUR,
      ),
    ).toEqual([0, 3]);
  });

  check('keeps a change whose own note is a chord tone, in the key of the hymn', () => {
    const inD = grid([{ tick: 0, numerator: 4, denominator: 4 }], 2);
    // In D, degree 7 is A: A C# E. The note at syllable 1 is E (64).
    const tune = syllables([0, 4, 62], [4, 4, 64], [8, 4, 66]);
    expect(
      where(
        'tone',
        line(tune, [
          [0, C],
          [1, G],
        ]),
        inD,
      ),
    ).toEqual([0, 1]);
  });
});

describe('R3 minimum length', () => {
  check('folds a change shorter than a beat into the chord before it', () => {
    const tune = syllables([0, 4, 60], [4, 2, 62], [6, 2, 64], [8, 8, 65]);
    expect(
      where(
        'length',
        line(tune, [
          [0, C],
          [1, G],
          [2, F],
        ]),
        FOUR,
      ),
    ).toEqual([0, 2]);
    expect(
      Placement.apply(
        'length',
        line(tune, [
          [0, C],
          [1, G],
          [2, F],
        ]),
        FOUR,
      ).map((c) => c.chord),
    ).toEqual([C, F]);
  });

  check("gives a short first change's place to the change after it", () => {
    const tune = syllables([0, 2, 60], [2, 6, 62], [8, 8, 64]);
    const out = Placement.apply(
      'length',
      line(tune, [
        [0, C],
        [1, G],
      ]),
      FOUR,
    );
    expect(out).toEqual([{ syllable: 0, at: 0, chord: G }]);
  });

  check('measures a compound beat as a dotted quarter', () => {
    const tune = syllables([0, 4, 60], [4, 4, 62], [8, 8, 64]);
    expect(
      where(
        'length',
        line(tune, [
          [0, C],
          [1, G],
          [2, F],
        ]),
        FOUR,
      ),
    ).toEqual([0, 1, 2]);
    expect(
      where(
        'length',
        line(tune, [
          [0, C],
          [1, G],
          [2, F],
        ]),
        SIX_EIGHT,
      ),
    ).toEqual([0, 2]);
  });
});

describe('R4 long note', () => {
  check('moves a change to the next syllable longer than the one before it', () => {
    const tune = syllables([0, 4, 60], [4, 2, 62], [6, 2, 64], [8, 8, 65]);
    expect(
      where(
        'long',
        line(tune, [
          [0, C],
          [1, G],
        ]),
        FOUR,
      ),
    ).toEqual([0, 3]);
  });
});

describe('the combinations', () => {
  check('R1 then R3 folds a change the strong beat leaves too short', () => {
    // G moves from beat 2 to beat 3 (tick 8); F at tick 10 leaves it half a beat.
    const tune = syllables([0, 4, 60], [4, 4, 62], [8, 2, 64], [10, 6, 65]);
    expect(
      where(
        'strong',
        line(tune, [
          [0, C],
          [1, G],
          [3, F],
        ]),
        FOUR,
      ),
    ).toEqual([0, 2, 3]);
    expect(
      where(
        'strong+length',
        line(tune, [
          [0, C],
          [1, G],
          [3, F],
        ]),
        FOUR,
      ),
    ).toEqual([0, 3]);
  });

  check('R2 on R1 takes the first strong beat that sings a chord tone, else R1', () => {
    const tune = syllables(
      [0, 4, 60],
      [4, 4, 62],
      [8, 4, 64],
      [12, 4, 65],
      [16, 4, 67],
      [20, 4, 69],
    );
    // G: beat 3 (tick 8) sings E, the next bar (tick 16) sings G.
    expect(
      where(
        'tone-on-strong',
        line(tune, [
          [0, C],
          [1, G],
        ]),
        FOUR,
      ),
    ).toEqual([0, 4]);
    // F: no strong beat sings a tone of F before G at tick 16, so R1's beat 3.
    expect(
      where(
        'tone-on-strong',
        line(tune, [
          [0, C],
          [1, F],
          [4, G],
        ]),
        FOUR,
      ),
    ).toEqual([0, 2, 4]);
  });

  check('R1 then R4 takes the first long note from the strong beat on', () => {
    const tune = syllables([0, 4, 60], [4, 4, 62], [8, 2, 64], [10, 2, 65], [12, 4, 67]);
    expect(
      where(
        'strong+long',
        line(tune, [
          [0, C],
          [1, G],
        ]),
        FOUR,
      ),
    ).toEqual([0, 4]);
  });
});

describe('hymn 373, refrain line 0 (measured from its file: 12/8 in Ab, 384 ticks a quarter)', () => {
  // Each syllable's start, length in ticks and melody key, read from the compiled
  // timing and the MIDI file; today the guitar shows IV at syllable 0 and I at 4.
  const refrain: Placement.Line = {
    syllables: syllables(
      [25920, 180, 65],
      [26112, 180, 65],
      [26304, 180, 65],
      [26496, 576, 65],
      [28032, 180, 63],
      [28224, 372, 63],
      [28608, 180, 63],
      [28800, 372, 63],
      [29184, 180, 63],
    ),
    changes: [
      { syllable: 0, at: 0, chord: chord(5) },
      { syllable: 4, at: 0, chord: chord(0) },
    ],
    until: 30528,
    before: chord(0),
  };
  const g: Placement.Grid = {
    ticksPerBeat: 384,
    meters: [{ tick: 0, numerator: 12, denominator: 8 }],
    tonic: 8,
  };
  const expected: Record<Placement.RuleId, readonly number[]> = {
    strong: [3, 7],
    beat: [0, 5],
    tone: [0, 4],
    length: [0, 4],
    long: [3, 5],
    'strong+length': [3, 7],
    'tone-on-strong': [3, 7],
    'strong+long': [3, 7],
  };

  for (const rule of Placement.RULES) {
    check(`${rule.label} gives syllables ${expected[rule.id].join(' and ')}`, () => {
      expect(where(rule.id, refrain, g)).toEqual([...expected[rule.id]]);
      expect(Placement.reproduces(rule.id, refrain, g, OWNER_373)).toBe(
        expected[rule.id].join() === OWNER_373.join(),
      );
    });
  }
});
