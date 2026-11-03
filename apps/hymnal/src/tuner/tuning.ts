export type StringId = 'E2' | 'A2' | 'D3' | 'G3' | 'B3' | 'E4';

export interface GuitarString {
  readonly id: StringId;
  readonly hz: number;
}

export interface Reading {
  readonly note: string;
  readonly octave: number;
  readonly cents: number;
  readonly string: StringId;
  readonly stringCents: number;
  readonly inTune: boolean;
}

const A4 = 440;
const hzFrom = (semitonesFromA4: number) => A4 * 2 ** (semitonesFromA4 / 12);

export const STRINGS: ReadonlyArray<GuitarString> = [
  { id: 'E2', hz: hzFrom(-29) },
  { id: 'A2', hz: hzFrom(-24) },
  { id: 'D3', hz: hzFrom(-19) },
  { id: 'G3', hz: hzFrom(-14) },
  { id: 'B3', hz: hzFrom(-10) },
  { id: 'E4', hz: hzFrom(-5) },
];

export const IN_TUNE_CENTS = 5;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const centsBetween = (hz: number, ref: number) => 1200 * Math.log2(hz / ref);

const LOW_E: GuitarString = { id: 'E2', hz: hzFrom(-29) };

const stringOf = (id: StringId): GuitarString =>
  STRINGS.find((string) => string.id === id) ?? LOW_E;

const readAgainst = (hz: number, target: GuitarString): Reading => {
  const semitones = 12 * Math.log2(hz / A4);
  const nearest = Math.round(semitones);
  const midi = 69 + nearest;
  const stringCents = centsBetween(hz, target.hz);
  return {
    note: NAMES[((midi % 12) + 12) % 12] ?? 'C',
    octave: Math.floor(midi / 12) - 1,
    cents: (semitones - nearest) * 100,
    string: target.id,
    stringCents,
    inTune: Math.abs(stringCents) <= IN_TUNE_CENTS,
  };
};

export const reading = (hz: number): Reading => {
  let target = STRINGS[0] ?? LOW_E;
  for (const string of STRINGS)
    if (Math.abs(centsBetween(hz, string.hz)) < Math.abs(centsBetween(hz, target.hz)))
      target = string;
  return readAgainst(hz, target);
};

export const readingOn = (hz: number, string: StringId): Reading =>
  readAgainst(hz, stringOf(string));
