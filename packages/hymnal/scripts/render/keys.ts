import type { Voices } from '../../src/voices.js';
import { type Part, PIANO_SFZ, type Stem, type Style } from './style.js';

export type Range = NonNullable<Stem['range']>;

export const SAMPLED = new Map<string, Range>([
  [PIANO_SFZ, { low: 21, high: 108 }],
  ['vsco/ViolinEnsSusVib.sfz', { low: 55, high: 86 }],
  ['vsco/ViolaEnsSusVib.sfz', { low: 48, high: 86 }],
  ['vsco/CelloEnsSusVib.sfz', { low: 36, high: 77 }],
  ['vsco/ContrabassSusNV.sfz', { low: 24, high: 60 }],
]);

export interface Move {
  readonly stem: string;
  readonly octave: number;
  readonly folded: number;
}

const PARTS: ReadonlyArray<Part> = ['S', 'A', 'T', 'B'];

const OCTAVES = [0, -12, 12] as const;

const outside = (keys: ReadonlyArray<number>, shift: number, range: Range) =>
  keys.filter((key) => key + shift < range.low || key + shift > range.high).length;

const keyedStem = (stem: Stem, parts: Voices, transpose: number) => {
  const range = SAMPLED.get(stem.sfz);
  if (range === undefined) throw new Error(`no sampled range for ${stem.sfz}`);
  const keys = PARTS.flatMap((part) =>
    stem.parts[part] === undefined
      ? []
      : parts[part].map((n) => n.key + stem.transpose + transpose),
  );
  const octave = OCTAVES.reduce((best, shift) =>
    outside(keys, shift, range) < outside(keys, best, range) ? shift : best,
  );
  const folded = outside(keys, octave, range);
  const keyed: Stem = { ...stem, transpose: stem.transpose + transpose + octave, range };
  const move: ReadonlyArray<Move> =
    octave === 0 && folded === 0 ? [] : [{ stem: stem.name, octave, folded }];
  return { keyed, move };
};

export interface Keyed<S extends Style> {
  readonly style: S;
  readonly moves: ReadonlyArray<Move>;
}

export const keyedStyle = <S extends Style>(
  style: S,
  parts: Voices,
  transpose: number,
): Keyed<S> => {
  if (transpose === 0) return { style, moves: [] };
  const stems = style.stems.map((stem) => keyedStem(stem, parts, transpose));
  return {
    style: { ...style, stems: stems.map((s) => s.keyed) },
    moves: stems.flatMap((s) => s.move),
  };
};

export const moveText = (move: Move) =>
  `${move.stem} ${move.octave > 0 ? '+' : ''}${move.octave}${move.folded > 0 ? ` folded ${move.folded}` : ''}`;
