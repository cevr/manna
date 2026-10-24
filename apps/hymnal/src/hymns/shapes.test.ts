/**
 * The fingerings a guitarist knows by name: the open chords, the F barre at
 * the first fret, the Bm barre at the second, and C7 with its fingers. Each
 * is written as a chart writes it: the frets from the low E ("x32010") and
 * the fingers ("-32-1-", `-` for none), with the barre and the box's first
 * fret.
 */

import { describe, expect, it } from 'bun:test';
import * as Chord from '@bible/hymnal/chord';
import { Match, Option } from 'effect';

import { playedKey } from './chords';
import { type Barre, describe as words, type Fingering, fingeringOf, type Play } from './shapes';

const C_MAJOR: Chord.Key = { tonic: 'C', minor: false };

/** A chord named in C major: its root's name and its quality. */
const named = (root: string, quality: Chord.Quality): Chord.Chord => ({
  root: Chord.pitchClass(root),
  quality,
});

const fretChar = (fret: number) => fret.toString(16);

const fretOf: (play: Play) => string = Match.type<Play>().pipe(
  Match.tagsExhaustive({
    Muted: () => 'x',
    Open: () => '0',
    Fretted: (play) => fretChar(play.fret),
  }),
);

const fingerOf = (play: Play) => {
  if (play._tag === 'Fretted') return String(play.finger);
  return '-';
};

/** A fingering as a chart writes it. */
const chart = (fingering: Fingering) => ({
  frets: fingering.strings.map(fretOf).join(''),
  fingers: fingering.strings.map(fingerOf).join(''),
  barre: fingering.barre,
  first: fingering.first,
});

const unbarred = Option.none<Barre>();

const of = (root: string, quality: Chord.Quality) =>
  chart(Option.getOrThrow(fingeringOf(named(root, quality), C_MAJOR)));

describe('the open chords', () => {
  const open: ReadonlyArray<readonly [string, Chord.Quality, string, string]> = [
    ['C', '', 'x32010', '-32-1-'],
    ['G', '', '320003', '21---3'],
    ['D', '', 'xx0232', '---132'],
    ['A', '', 'x02220', '--123-'],
    ['E', '', '022100', '-231--'],
    ['A', 'm', 'x02210', '--231-'],
    ['E', 'm', '022000', '-23---'],
    ['D', 'm', 'xx0231', '---231'],
    ['G', '7', '320001', '32---1'],
    ['D', '7', 'xx0212', '---213'],
    ['E', '7', '020100', '-2-1--'],
    ['A', '7', 'x02020', '--2-3-'],
    ['B', '7', 'x21202', '-213-4'],
  ];
  for (const [root, quality, frets, fingers] of open)
    it(`plays ${root}${quality} open, ${frets} with fingers ${fingers}`, () => {
      expect(of(root, quality)).toEqual({ frets, fingers, barre: unbarred, first: 1 });
    });
});

describe('the barre chords', () => {
  it('plays F as the E form barred at the first fret, 2 on the G, 3 on the A, 4 on the D', () => {
    expect(of('F', '')).toEqual({
      frets: '133211',
      fingers: '134211',
      barre: Option.some({ fret: 1, finger: 1, from: 0, to: 5 }),
      first: 1,
    });
  });

  it('plays Bm as the A form barred at the second fret, 2 on the B, 3 on the D, 4 on the G', () => {
    expect(of('B', 'm')).toEqual({
      frets: 'x24432',
      fingers: '-13421',
      barre: Option.some({ fret: 2, finger: 1, from: 1, to: 5 }),
      first: 1,
    });
  });

  it('starts the box at the barre when it reaches above the fourth fret (Ab, the E form at 4)', () => {
    expect(of('Ab', '')).toEqual({
      frets: '466544',
      fingers: '134211',
      barre: Option.some({ fret: 4, finger: 1, from: 0, to: 5 }),
      first: 4,
    });
  });
});

describe('C7', () => {
  it('is x32310: 3 on the A, 2 on the D, 4 on the G, 1 on the B', () => {
    expect(of('C', '7')).toEqual({ frets: 'x32310', fingers: '-3241-', barre: unbarred, first: 1 });
  });
});

describe('the chord the page shows', () => {
  it('fingers the IV of A-flat under capo 1 as C, the chord the page shows', () => {
    const played = playedKey({ tonic: 'Ab', minor: false }, { transpose: 0, capo: 1 });
    const four = Option.getOrThrow(fingeringOf({ root: 5, quality: '' }, played));
    expect(chart(four).frets).toBe('x32010');
  });

  it('plays a slash chord over its bass: G/B with the B on the A string', () => {
    const fingering = Option.getOrThrow(fingeringOf({ root: 7, quality: '', bass: 11 }, C_MAJOR));
    expect(chart(fingering).frets).toBe('x20003');
    expect(fingering.playedAs).toEqual(Option.none());
  });
});

describe('the words a screen reader reads', () => {
  it('names the chord, each string from the low E, and the capo', () => {
    const fingering = Option.getOrThrow(fingeringOf(named('C', ''), C_MAJOR));
    expect(words(fingering, 'C', Option.none(), 1)).toBe(
      'C. low E muted; A fret 3, finger 3; D fret 2, finger 2; G open; B fret 1, finger 1; high E open. capo 1',
    );
  });

  it('names the barre', () => {
    const fingering = Option.getOrThrow(fingeringOf(named('F', ''), C_MAJOR));
    expect(words(fingering, 'F', Option.none(), 0)).toContain(
      'finger 1 across low E to high E at fret 1',
    );
  });
});
