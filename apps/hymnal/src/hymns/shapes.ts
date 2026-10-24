/**
 * How to play a chord on a guitar in standard tuning (E A D G B E): which
 * fret each string is held at and by which finger, as a chord box draws it.
 * A chord is fingered as the page shows it: its degrees spelled in the key
 * the chords are played in (`playedKey`, under the capo), so the fingering
 * depends on the root's pitch, its quality and its bass alone.
 *
 * The fingerings are the guitar's usual ones, by rule:
 * - an open fingering (`OPEN`) when the chord has one: C, A, G, E and D
 *   and their kin, the strings left open sounding chord tones;
 * - else the movable forms (`MOVABLE`), each the open E, A or D form moved
 *   up the neck with a barre or the nut's place taken by a finger, at the
 *   lowest fret it reaches;
 * - a slash chord is the same fingering with its bass as its lowest
 *   sounding string: a string below it held at the bass, or the strings
 *   under one already sounding the bass muted. When neither can be played,
 *   the chord is played over its root and says so (`playedAs`).
 *
 * Fingers are given by rule too, unless an open fingering names its own
 * (Em on 2 and 3): the dots in fret order, then string order, fingers 1 to
 * 4; five or more dots take a barre of finger 1 across the lowest fret.
 * A chord nothing here can finger has none, and the sheet says so; it is
 * never given a fingering of another chord.
 */

import * as Chord from '@bible/hymnal/chord';
import { Array as Arr, Match, Option } from 'effect';

/** A fretting finger: 1 the index, 4 the little finger. */
export type Finger = 1 | 2 | 3 | 4;

/** One string as the chord is played on it. */
export type Play =
  | { readonly _tag: 'Muted' }
  | { readonly _tag: 'Open' }
  | { readonly _tag: 'Fretted'; readonly fret: number; readonly finger: Finger };

/** One finger laid flat across strings `from` to `to` (0 the low E) at `fret`. */
export interface Barre {
  readonly fret: number;
  readonly finger: Finger;
  readonly from: number;
  readonly to: number;
}

export interface Fingering {
  /** The six strings, the low E first. */
  readonly strings: ReadonlyArray<Play>;
  readonly barre: Option.Option<Barre>;
  /** The fret the box starts at: 1 at the nut, else the lowest fret held. */
  readonly first: number;
  /** The chord played instead, when a slash chord's bass cannot be: the chord over its root. */
  readonly playedAs: Option.Option<Chord.Chord>;
}

/** Each string's open pitch class, the low E first. */
export const TUNING = [4, 9, 2, 7, 11, 4] as const;

/** The strings' names, the low E first. */
export const STRING_NAMES = ['low E', 'A', 'D', 'G', 'B', 'high E'] as const;

/** The frets a box draws. */
export const FRETS_DRAWN = 4;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** A string not played. */
const X = -1;

type Frets = ReadonlyArray<number>;

// ----------------------------------------------------------------------------
// The fingerings
// ----------------------------------------------------------------------------

/** Frets as a chart writes them, the low E first: "x32010". */
const fretsOf = (written: string): Frets =>
  [...written].map((c) => (c === 'x' && X) || Number.parseInt(c, 16));

/**
 * The open fingerings: the root's name, the quality, the frets, and the
 * fingers where they are not the rule's ("-23---": a finger per string, `-`
 * for none).
 */
const OPEN: ReadonlyArray<readonly [string, Chord.Quality, string, string?]> = [
  ['C', '', 'x32010'],
  ['A', '', 'x02220'],
  ['G', '', '320003'],
  ['E', '', '022100'],
  ['D', '', 'xx0232'],
  ['A', 'm', 'x02210'],
  ['E', 'm', '022000', '-23---'],
  ['D', 'm', 'xx0231'],
  ['C', '7', 'x32310'],
  ['A', '7', 'x02020', '--2-3-'],
  ['G', '7', '320001'],
  ['E', '7', '020100'],
  ['D', '7', 'xx0212'],
  ['B', '7', 'x21202'],
  ['A', 'm7', 'x02010'],
  ['E', 'm7', '020000', '-2----'],
  ['D', 'm7', 'xx0211'],
  ['B', 'm7', 'x20202'],
  ['C', 'maj7', 'x32000'],
  ['A', 'maj7', 'x02120'],
  ['G', 'maj7', '320002'],
  ['E', 'maj7', '021100'],
  ['D', 'maj7', 'xx0222'],
  ['F', 'maj7', 'xx3210'],
  ['C', '6', 'x32210'],
  ['A', '6', 'x02222'],
  ['G', '6', '320000'],
  ['E', '6', '022120'],
  ['D', '6', 'xx0202'],
  ['A', 'm6', 'x02212'],
  ['E', 'm6', '022020'],
  ['D', 'm6', 'xx0201'],
  ['A', 'dim', 'x0121x'],
  ['D', 'dim', 'xx0131'],
  ['A', 'dim7', 'x01212'],
  ['E', 'dim7', '012020'],
  ['D', 'dim7', 'xx0101'],
  ['A', 'm7b5', 'x0101x'],
  ['E', 'm7b5', '012030'],
  ['D', 'm7b5', 'xx0111'],
  ['B', 'm7b5', 'x20201'],
  ['C', 'aug', 'x32110'],
  ['A', 'aug', 'x03221'],
  ['G', 'aug', '321003'],
  ['E', 'aug', '032110'],
  ['D', 'aug', 'xx0332'],
  ['C', 'sus4', 'x33011'],
  ['A', 'sus4', 'x02230'],
  ['G', 'sus4', '330013'],
  ['E', 'sus4', '022200'],
  ['D', 'sus4', 'xx0233'],
  ['C', 'sus2', 'x30013'],
  ['A', 'sus2', 'x02200'],
  ['G', 'sus2', '3x0233'],
  ['D', 'sus2', 'xx0230'],
  ['C', '7sus4', 'x33311'],
  ['A', '7sus4', 'x02030'],
  ['G', '7sus4', '330011'],
  ['E', '7sus4', '020200'],
  ['D', '7sus4', 'xx0213'],
];

/**
 * The movable forms: the string the root is on (0 the low E, 1 the A, 2 the
 * D), the quality, and each string's fret above or below the root's
 * (`X` not played).
 */
const MOVABLE: ReadonlyArray<readonly [number, Chord.Quality, Frets]> = [
  [0, '', [0, 2, 2, 1, 0, 0]],
  [0, 'm', [0, 2, 2, 0, 0, 0]],
  [0, '7', [0, 2, 0, 1, 0, 0]],
  [0, 'm7', [0, 2, 0, 0, 0, 0]],
  [0, 'maj7', [0, X, 1, 1, 0, X]],
  [0, '6', [0, X, 2, 1, 2, X]],
  [0, 'm6', [0, X, 2, 0, 2, X]],
  [0, 'dim7', [0, X, -1, 0, -1, X]],
  [0, 'm7b5', [0, X, 0, 0, -1, X]],
  [0, 'aug', [0, X, 2, 1, 1, X]],
  [0, 'sus4', [0, 2, 2, 2, 0, 0]],
  [0, '7sus4', [0, 2, 0, 2, 0, 0]],
  [1, '', [X, 0, 2, 2, 2, 0]],
  [1, 'm', [X, 0, 2, 2, 1, 0]],
  [1, '7', [X, 0, 2, 0, 2, 0]],
  [1, 'm7', [X, 0, 2, 0, 1, 0]],
  [1, 'maj7', [X, 0, 2, 1, 2, 0]],
  [1, '6', [X, 0, -1, -1, -2, X]],
  [1, 'm6', [X, 0, X, 2, 1, 2]],
  [1, 'dim', [X, 0, 1, 2, 1, X]],
  [1, 'dim7', [X, 0, 1, -1, 1, X]],
  [1, 'm7b5', [X, 0, 1, 0, 1, X]],
  [1, 'aug', [X, 0, -1, -2, -2, X]],
  [1, 'sus4', [X, 0, 2, 2, 3, 0]],
  [1, 'sus2', [X, 0, 2, 2, 0, 0]],
  [1, '7sus4', [X, 0, 2, 0, 3, 0]],
  [2, '', [X, X, 0, 2, 3, 2]],
  [2, 'm', [X, X, 0, 2, 3, 1]],
  [2, '7', [X, X, 0, 2, 1, 2]],
  [2, 'm7', [X, X, 0, 2, 1, 1]],
  [2, 'maj7', [X, X, 0, 2, 2, 2]],
  [2, '6', [X, X, 0, 2, 0, 2]],
  [2, 'm6', [X, X, 0, 2, 0, 1]],
  [2, 'dim', [X, X, 0, 1, 3, 1]],
  [2, 'dim7', [X, X, 0, 1, 0, 1]],
  [2, 'm7b5', [X, X, 0, 1, 1, 1]],
  [2, 'aug', [X, X, 0, 3, 3, 2]],
  [2, 'sus4', [X, X, 0, 2, 3, 3]],
  [2, 'sus2', [X, X, 0, 2, 3, 0]],
  [2, '7sus4', [X, X, 0, 2, 1, 3]],
];

/** A form moved to the lowest fret, 1 or above, that puts its root at `root`. */
const placed = (string: number, form: Frets, root: number): Frets => {
  const held = form.filter((f) => f !== X);
  const lowest = Math.min(...held);
  const at = mod12(root - (TUNING[string] ?? 0));
  const fret = at + 12 * Number(at + lowest < 1);
  return form.map((f) => (f === X && X) || f + fret);
};

/** The fingerings to try for a root (a pitch class) and a quality, in order: open, then movable by lowest fret. */
const candidates = (
  root: number,
  quality: Chord.Quality,
): ReadonlyArray<readonly [Frets, Option.Option<string>]> => {
  const open = OPEN.filter(([name, q]) => q === quality && Chord.pitchClass(name) === root).map(
    ([, , frets, fingers]) => [fretsOf(frets), Option.fromUndefinedOr(fingers)] as const,
  );
  const movable = MOVABLE.filter(([, q]) => q === quality)
    .map(([string, , form]) => placed(string, form, root))
    .toSorted((a, b) => lowestHeld(a) - lowestHeld(b))
    .map((frets) => [frets, Option.none<string>()] as const);
  return [...open, ...movable];
};

const lowestHeld = (frets: Frets) => Math.min(...frets.filter((f) => f > 0));

// ----------------------------------------------------------------------------
// Fingers
// ----------------------------------------------------------------------------

interface Hand {
  readonly fingers: ReadonlyArray<Option.Option<Finger>>;
  readonly barre: Option.Option<Barre>;
}

const FINGERS: ReadonlyArray<Finger> = [1, 2, 3, 4];

/** The strings held down, in fret order, then string order. */
const dotsOf = (frets: Frets): ReadonlyArray<number> =>
  frets
    .flatMap((f, s) => (f > 0 && [s]) || [])
    .toSorted((a, b) => (frets[a] ?? 0) - (frets[b] ?? 0) || a - b);

/** Fingers 1 up for the dots in order, when there are four or fewer. */
const oneEach = (frets: Frets, dots: ReadonlyArray<number>): Option.Option<Hand> =>
  Option.liftPredicate(dots, (d) => d.length <= 4).pipe(
    Option.map((held) => {
      const fingers = frets.map(() => Option.none<Finger>());
      held.forEach((s, k) => {
        fingers[s] = Arr.get(FINGERS, k);
      });
      return { fingers, barre: Option.none() };
    }),
  );

/**
 * Finger 1 across the lowest fret, from its lowest string held there to its
 * highest, and fingers 2 up for the rest in order: when every string the
 * barre crosses is held at its fret or above and three dots or fewer are left.
 */
const barred = (frets: Frets, dots: ReadonlyArray<number>): Option.Option<Hand> => {
  const fret = lowestHeld(frets);
  const under = dots.filter((s) => frets[s] === fret);
  const from = Math.min(...under);
  const to = Math.max(...under);
  const crossed = frets.slice(from, to + 1).every((f) => f >= fret);
  const rest = dots.filter((s) => frets[s] !== fret);
  if (!crossed || rest.length > 3 || under.length < 2) return Option.none();
  const fingers = frets.map(() => Option.none<Finger>());
  for (const s of under) fingers[s] = Option.some(1);
  rest.forEach((s, k) => {
    fingers[s] = Arr.get(FINGERS, k + 1);
  });
  return Option.some({ fingers, barre: Option.some({ fret, finger: 1, from, to }) });
};

/** The fingers a chart writes ("-23---"), when they are given. */
const writtenHand = (written: string): Hand => ({
  fingers: [...written].map((c) => Arr.findFirst(FINGERS, (finger) => String(finger) === c)),
  barre: Option.none(),
});

/** How a hand holds `frets`, by rule: none when no hand can, or it spans more than four frets. */
const handFor = (frets: Frets): Option.Option<Hand> => {
  const held = frets.filter((f) => f > 0);
  if (held.length > 0 && Math.max(...held) - Math.min(...held) > 3) return Option.none();
  const dots = dotsOf(frets);
  return Option.orElse(oneEach(frets, dots), () => barred(frets, dots));
};

// ----------------------------------------------------------------------------
// Tones
// ----------------------------------------------------------------------------

/** Each quality's tones above its root, and those a fingering must hold: all but a perfect fifth. */
const TONES: Record<Chord.Quality, ReadonlyArray<number>> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  '7sus4': [0, 5, 7, 10],
};

/** The pitch classes `frets` sound, the lowest string first. */
const soundOf = (frets: Frets): ReadonlyArray<number> =>
  frets.flatMap((f, s) => (f >= 0 && [mod12((TUNING[s] ?? 0) + f)]) || []);

/** Whether `frets` sound the chord on `root` of `quality`: its tones alone, each but the fifth. */
const sounds = (frets: Frets, root: number, quality: Chord.Quality, bass: number): boolean => {
  const tones = TONES[quality].map((t) => mod12(root + t));
  const heard = new Set(soundOf(frets));
  const needed = tones.filter((t) => t !== mod12(root + 7));
  return (
    [...heard].every((pc) => tones.includes(pc) || pc === bass) &&
    needed.every((t) => heard.has(t)) &&
    soundOf(frets).length >= 4
  );
};

// ----------------------------------------------------------------------------
// Slash chords
// ----------------------------------------------------------------------------

/** The lowest string `frets` sound. */
const lowestSounding = (frets: Frets): number => frets.findIndex((f) => f >= 0);

/**
 * `frets` with the bass under them: a lower string held at the bass (within
 * reach, the strings between muted), else the strings under the lowest one
 * already sounding the bass muted. Each way is tried from the fullest chord.
 */
const withBass = (frets: Frets, bass: number): ReadonlyArray<Frets> => {
  const low = lowestSounding(frets);
  const below = Arr.range(0, low - 1)
    .filter((t) => t < low)
    .toReversed()
    .flatMap((t) =>
      Arr.range(0, 12)
        .filter((f) => mod12((TUNING[t] ?? 0) + f) === bass)
        .map((f) => frets.map((g, s) => bassAt(s, t, f, low, g))),
    );
  const moved = Arr.range(0, 12)
    .filter((f) => mod12((TUNING[low] ?? 0) + f) === bass)
    .flatMap((f) => {
      const held = frets.map((g, s) => heldAt(s, low, f, g));
      const top = Math.max(...soundingStrings(held));
      return [held, held.map((g, s) => heldAt(s, top, X, g))];
    });
  const muted = frets
    .flatMap((f, s) => (f >= 0 && mod12((TUNING[s] ?? 0) + f) === bass && [s]) || [])
    .map((u) => frets.map((g, s) => mutedUnder(s, u, g)));
  return [...below, ...moved, ...muted];
};

/** The strings `frets` sound. */
const soundingStrings = (frets: Frets): ReadonlyArray<number> =>
  frets.flatMap((f, s) => (f >= 0 && [s]) || []);

/** String `s` held at `f` when it is string `t`, else at `g`. */
const heldAt = (s: number, t: number, f: number, g: number): number => {
  if (s === t) return f;
  return g;
};

/** String `s` muted when it lies under string `u`, else held at `g`. */
const mutedUnder = (s: number, u: number, g: number): number => {
  if (s < u) return X;
  return g;
};

/** String `s` with the bass held on string `t` at fret `f`: the strings under the chord's lowest, `low`, muted but `t`. */
const bassAt = (s: number, t: number, f: number, low: number, g: number): number => {
  if (s === t) return f;
  if (s < low) return X;
  return g;
};

// ----------------------------------------------------------------------------
// The lookup
// ----------------------------------------------------------------------------

const fingeringOfFrets = (
  frets: Frets,
  hand: Hand,
  playedAs: Option.Option<Chord.Chord>,
): Fingering => {
  const held = frets.filter((f) => f > 0);
  const top = Math.max(0, ...held);
  const first = (top <= FRETS_DRAWN && 1) || Math.min(...held);
  return {
    strings: frets.map((f, s): Play => {
      if (f < 0) return { _tag: 'Muted' };
      return Option.match(Option.flatten(Option.fromUndefinedOr(hand.fingers[s])), {
        onNone: (): Play => ({ _tag: 'Open' }),
        onSome: (finger): Play => ({ _tag: 'Fretted', fret: f, finger }),
      });
    }),
    barre: hand.barre,
    first,
    playedAs,
  };
};

/** The first of `tried` a hand can hold, with its hand. */
const firstHeld = (
  tried: ReadonlyArray<readonly [Frets, Option.Option<string>]>,
  fits: (frets: Frets) => boolean,
): Option.Option<readonly [Frets, Hand]> =>
  Arr.findFirst(tried, ([frets, written]) =>
    Option.filter(
      Option.match(written, {
        onNone: () => handFor(frets),
        onSome: (w) => Option.some(writtenHand(w)),
      }),
      () => fits(frets),
    ).pipe(Option.map((hand) => [frets, hand] as const)),
  );

/**
 * How to play `chord` in `key`, the key the page spells it in. None for a
 * chord no fingering here can play.
 */
export const fingeringOf = (chord: Chord.Chord, key: Chord.Key): Option.Option<Fingering> => {
  const root = mod12(Chord.pitchClass(key.tonic) + chord.root);
  const { quality } = chord;
  const tried = candidates(root, quality);
  const plain = () =>
    Option.map(
      firstHeld(tried, (frets) => sounds(frets, root, quality, root) && lowestIs(frets, root)),
      ([frets, hand]) => ({ frets, hand }),
    );
  return Option.match(Option.fromUndefinedOr(chord.bass), {
    onNone: () =>
      Option.map(plain(), ({ frets, hand }) => fingeringOfFrets(frets, hand, Option.none())),
    onSome: (degree) => {
      const bass = mod12(Chord.pitchClass(key.tonic) + degree);
      const slashed = tried.flatMap(([frets]) =>
        withBass(frets, bass).map((f) => [f, Option.none<string>()] as const),
      );
      return Option.match(
        firstHeld(slashed, (frets) => sounds(frets, root, quality, bass) && lowestIs(frets, bass)),
        {
          onSome: ([frets, hand]) => Option.some(fingeringOfFrets(frets, hand, Option.none())),
          onNone: () =>
            Option.map(plain(), ({ frets, hand }) =>
              fingeringOfFrets(frets, hand, Option.some({ root: chord.root, quality })),
            ),
        },
      );
    },
  });
};

const lowestIs = (frets: Frets, pc: number): boolean =>
  Option.exists(Option.fromUndefinedOr(soundOf(frets)[0]), (low) => low === pc);

// ----------------------------------------------------------------------------
// Words
// ----------------------------------------------------------------------------

const playWords: (play: Play) => string = Match.type<Play>().pipe(
  Match.tagsExhaustive({
    Muted: () => 'muted',
    Open: () => 'open',
    Fretted: (play) => `fret ${play.fret}, finger ${play.finger}`,
  }),
);

/**
 * A fingering as a screen reader reads it: the chord's name, what it is
 * played as, each string from the low E, the barre, and the capo.
 */
export const describe = (
  fingering: Fingering,
  name: string,
  playedAs: Option.Option<string>,
  capo: number,
): string =>
  [
    `${name}${Option.match(playedAs, { onNone: () => '', onSome: (as) => `, played as ${as}` })}`,
    fingering.strings.map((play, s) => `${STRING_NAMES[s]} ${playWords(play)}`).join('; '),
    ...Option.toArray(
      Option.map(
        fingering.barre,
        (b) =>
          `finger ${b.finger} across ${STRING_NAMES[b.from]} to ${STRING_NAMES[b.to]} at fret ${b.fret}`,
      ),
    ),
    ...((capo > 0 && [`capo ${capo}`]) || []),
  ].join('. ');
