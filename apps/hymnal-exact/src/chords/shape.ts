/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): a fingering, a key or a chord the current app's decoders leave out is undefined, and its rules branch plainly. */

/**
 * A chord's shape, the current hymnal's chord page: how to hold each chord a
 * syllable shows, in the key the page spells it in, as the current app's
 * `fingeringOf` gives it (six strings from the low E, a barre, the fret the
 * box starts at), drawn as a chord box: strings down, four frets across,
 * the nut thick when the box starts at the first fret, `x` over a muted
 * string and `o` over an open one, a dot with its finger on each held
 * string, a barre as one bar.
 *
 * A syllable's chords and their key travel in the shape's route as one
 * token, `<key>_<chord>[_<chord>…]` (`keyCode`, `chordsCode`): the key's tonic with
 * `s` for a sharp and `m` when minor (`Fs`, `Bbm`), each chord its degree
 * in hex, its quality and `-` its bass (`5m7-b`). A syllable whose chords
 * any fingering lacks has no token, so its chord opens nothing.
 *
 * The drawing's numbers are the box's own units (its `viewBox`); text over
 * it (the marks, the fingers, the first fret) is placed at the same units.
 */

import type { Chord, Key } from '@manna/hymnal/chord';
import { format, keyFromSignature, Quality } from '@manna/hymnal/chord';
import { FRETS_DRAWN, type Fingering, fingeringOf } from '@manna/hymnal-app/hymns/shapes';

/** Strings' and frets' spacing, the room above the nut for the marks, and left of the neck for the first fret. */
const GAP = 22;
const FRET = 28;
const TOP = 22;
const LEFT = 34;
/** A dot's diameter. */
const DOT = 18;

/** The box's size in its own units: the neck in its middle. */
const GRIP_WIDTH = LEFT * 2 + GAP * 5;
const GRIP_HEIGHT = TOP + FRET * FRETS_DRAWN + 6;

export interface GripMark {
  readonly x: number;
  readonly text: string;
}

export interface GripDot {
  readonly x: number;
  readonly y: number;
  readonly finger: number;
}

export interface GripBarre {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly finger: number;
}

/**
 * One chord's box: its name, the frets and fingers as a chart writes them
 * (`x32010`, `-32-1-`; the low E first), what it is played as when a slash
 * chord's bass cannot be (else ""), and its drawing.
 */
export interface GripBox {
  readonly name: string;
  readonly frets: string;
  readonly fingers: string;
  readonly playedAs: string;
  readonly first: number;
  readonly firstLabel: string;
  readonly nut: boolean;
  /** Each string's x, the low E first, and each fret line's y, the nut first; the neck's edges. */
  readonly stringsX: Array<number>;
  readonly fretsY: Array<number>;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly marks: Array<GripMark>;
  readonly dots: Array<GripDot>;
  readonly barres: Array<GripBarre>;
}

/**
 * The shape page: the chords' names together, and each chord's box, each
 * `width` by `height` in its units with dots `dot` wide; `has` false for a
 * token that names no shape.
 */
export interface GripPage {
  readonly has: boolean;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly dot: number;
  readonly boxes: Array<GripBox>;
}

const tonicCode = (tonic: string) => tonic.replaceAll('#', 's');

/** A key's part of a token: `Fs`, `Bbm`. */
export const keyCode = (key: Key): string => `${tonicCode(key.tonic)}${key.minor ? 'm' : ''}`;

const chordCode = (chord: Chord) =>
  `${chord.root.toString(16)}${chord.quality}${chord.bass === undefined ? '' : `-${chord.bass.toString(16)}`}`;

/** Every key a signature names, major and minor, by its code. */
const KEYS: ReadonlyMap<string, Key> = new Map(
  [false, true].flatMap((minor) =>
    Array.from({ length: 15 }, (_, at) => {
      const key = keyFromSignature(at - 7, minor);
      return [keyCode(key), key] as const;
    }),
  ),
);

const degreeOf = (hex: string | undefined): number | undefined => {
  if (hex === undefined || !/^[0-9a-b]$/.test(hex)) return undefined;
  return Number.parseInt(hex, 16);
};

/** A chord from its code, or none for a code that names no chord. */
const chordOf = (code: string): Chord | undefined => {
  const [head = '', bassCode, ...rest] = code.split('-');
  const root = degreeOf(head[0]);
  const quality = Quality.literals.find((each) => each === head.slice(1));
  const bass = degreeOf(bassCode);
  if (root === undefined || quality === undefined || rest.length > 0) return undefined;
  if (bassCode === undefined) return { root, quality };
  if (bass === undefined) return undefined;
  return { root, quality, bass };
};

const fingered = (chord: Chord, key: Key): Fingering | undefined => {
  const fingering = fingeringOf(chord, key);
  return fingering._tag === 'Some' ? fingering.value : undefined;
};

/**
 * The chords' part of the route token of `chords` spelled in `key` (the
 * whole token is `<keyCode>_<this>`); "" for none, or for a chord no
 * fingering plays.
 */
export const chordsCode = (chords: ReadonlyArray<Chord>, key: Key): string => {
  if (chords.length === 0 || chords.some((chord) => fingered(chord, key) === undefined)) return '';
  return chords.map(chordCode).join('_');
};

const xOf = (string: number) => LEFT + string * GAP;

/** The middle of the box's `fret`th fret, from 1. */
const yOf = (fret: number) => TOP + (fret - 0.5) * FRET;

const boxOf = (chord: Chord, key: Key, fingering: Fingering): GripBox => {
  const barre = fingering.barre._tag === 'Some' ? [fingering.barre.value] : [];
  const barreFret = barre[0]?.fret ?? 0;
  return {
    name: format(chord, key),
    frets: fingering.strings
      .map((play) =>
        play._tag === 'Fretted' ? play.fret.toString(16) : play._tag === 'Open' ? '0' : 'x',
      )
      .join(''),
    fingers: fingering.strings
      .map((play) => (play._tag === 'Fretted' ? `${play.finger}` : '-'))
      .join(''),
    playedAs: fingering.playedAs._tag === 'Some' ? format(fingering.playedAs.value, key) : '',
    first: fingering.first,
    firstLabel: fingering.first === 1 ? '' : `${fingering.first}fr`,
    nut: fingering.first === 1,
    stringsX: Array.from({ length: 6 }, (_, s) => xOf(s)),
    fretsY: Array.from({ length: FRETS_DRAWN + 1 }, (_, f) => TOP + f * FRET),
    left: xOf(0),
    right: xOf(5),
    top: TOP,
    bottom: TOP + FRETS_DRAWN * FRET,
    marks: fingering.strings.flatMap((play, s) =>
      play._tag === 'Fretted' ? [] : [{ x: xOf(s), text: play._tag === 'Open' ? 'o' : 'x' }],
    ),
    dots: fingering.strings.flatMap((play, s) =>
      play._tag === 'Fretted' && play.fret !== barreFret
        ? [{ x: xOf(s), y: yOf(play.fret - fingering.first + 1), finger: play.finger }]
        : [],
    ),
    barres: barre.map((b) => ({
      x: xOf(b.from) - DOT / 2,
      y: yOf(b.fret - fingering.first + 1) - DOT / 2,
      width: (b.to - b.from) * GAP + DOT,
      finger: b.finger,
    })),
  };
};

const none: GripPage = {
  has: false,
  name: '',
  width: GRIP_WIDTH,
  height: GRIP_HEIGHT,
  dot: DOT,
  boxes: [],
};

/** The shape page a token names: each chord's box in its key, or `has` false for a token that names none. */
export const gripPageOf = (token: string): GripPage => {
  const [keyCode = '', ...codes] = token.split('_');
  const key = KEYS.get(keyCode);
  if (key === undefined || codes.length === 0) return none;
  const boxes: Array<GripBox> = [];
  for (const code of codes) {
    const chord = chordOf(code);
    const fingering = chord === undefined ? undefined : fingered(chord, key);
    if (chord === undefined || fingering === undefined) return none;
    boxes.push(boxOf(chord, key, fingering));
  }
  return { ...none, has: true, name: boxes.map((box) => box.name).join(' '), boxes };
};
