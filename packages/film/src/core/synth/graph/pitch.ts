import { Predicate } from 'effect';
import { exp2 } from './math.ts';
import type { Degree, Key, Pitch } from './nodes.ts';

export const NOTE_NAME = /^[A-G](#|b)?[0-8]$/;

const LETTERS: ReadonlyMap<string, number> = new Map([
  ['C', 0],
  ['D', 2],
  ['E', 4],
  ['F', 5],
  ['G', 7],
  ['A', 9],
  ['B', 11],
]);

const STEPS: Readonly<Record<Key['scale'], ReadonlyArray<number>>> = {
  majorPentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  minorPentatonic: [0, 3, 5, 7, 10],
};

const classOf = (name: string): number => {
  const accidental = name.charAt(1);
  return (
    (LETTERS.get(name.charAt(0)) ?? 0) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
  );
};

const midiHz = (midi: number): number => 440 * exp2((midi - 69) / 12);

const degreeMidi = (degree: Degree, key: Key): number => {
  const steps = STEPS[key.scale];
  const octaves = Math.floor(degree.degree / steps.length);
  const step = steps[degree.degree - octaves * steps.length] ?? 0;
  return 12 * (degree.octave + 1 + octaves) + classOf(key.tonic) + step;
};

export const noteMidi = (note: string): number =>
  12 * (Number(/\d+$/.exec(note)?.[0] ?? Number.NaN) + 1) + classOf(note);

const noteHz = (note: string): number => midiHz(noteMidi(note));

export const pitchHz = (pitch: Pitch, key: Key): number => {
  if (Predicate.isNumber(pitch)) return pitch;
  if (Predicate.isString(pitch)) return noteHz(pitch);
  return midiHz(degreeMidi(pitch, key));
};

export const isDegree = (pitch: Pitch): pitch is Degree => Predicate.isObject(pitch);
