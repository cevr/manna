/**
 * Standard guitar tuning and the reading of a heard pitch against it.
 *
 * The strings sit in equal temperament from A4 = 440 Hz. A reading names
 * the nearest equal-tempered note and how far the pitch lies from it, and
 * the nearest string (in cents, so the target the tuner shows is always the
 * string the player is closest to) and how far it lies from that string.
 */

export type StringId = 'E2' | 'A2' | 'D3' | 'G3' | 'B3' | 'E4';

export interface GuitarString {
  readonly id: StringId;
  readonly hz: number;
}

export interface Reading {
  /** The nearest equal-tempered note's name, sharps only (`C#`, not `Db`). */
  readonly note: string;
  /** Its scientific octave: A4 is 440 Hz, middle C is C4. */
  readonly octave: number;
  /** Signed cents from that note, in [-50, 50]; positive is sharp. */
  readonly cents: number;
  /** The string nearest the pitch, in cents. */
  readonly string: StringId;
  /** Signed cents from that string; positive is sharp. */
  readonly stringCents: number;
  /** Within `IN_TUNE_CENTS` of the string, inclusive. */
  readonly inTune: boolean;
}

const A4 = 440;
const hzFrom = (semitonesFromA4: number) => A4 * 2 ** (semitonesFromA4 / 12);

/** Standard tuning, low to high. */
export const STRINGS: ReadonlyArray<GuitarString> = [
  { id: 'E2', hz: hzFrom(-29) },
  { id: 'A2', hz: hzFrom(-24) },
  { id: 'D3', hz: hzFrom(-19) },
  { id: 'G3', hz: hzFrom(-14) },
  { id: 'B3', hz: hzFrom(-10) },
  { id: 'E4', hz: hzFrom(-5) },
];

/** A string is in tune within this many cents of its pitch, either side, inclusive. */
export const IN_TUNE_CENTS = 5;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const centsBetween = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);

/** The reading of a pitch `hz` (positive, finite) against the note grid and the six strings. */
export const reading = (hz: number): Reading => {
  const semitones = 12 * Math.log2(hz / A4);
  const nearest = Math.round(semitones);
  const midi = 69 + nearest;
  let target = STRINGS[0] ?? { id: 'E2', hz: hzFrom(-29) };
  let stringCents = centsBetween(hz, target.hz);
  for (const string of STRINGS) {
    const away = centsBetween(hz, string.hz);
    if (Math.abs(away) < Math.abs(stringCents)) {
      target = string;
      stringCents = away;
    }
  }
  return {
    note: NAMES[((midi % 12) + 12) % 12] ?? 'C',
    octave: Math.floor(midi / 12) - 1,
    cents: (semitones - nearest) * 100,
    string: target.id,
    stringCents,
    inTune: Math.abs(stringCents) <= IN_TUNE_CENTS,
  };
};
