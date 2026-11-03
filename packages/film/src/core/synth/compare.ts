import { Array as Arr } from 'effect';
import type { Pcm } from '../audio.ts';
import type { SoundEffect } from '../schema.ts';
import type { SoundUse } from '../sfx.ts';
import { describeSound, powerSpectrum } from './analyse.ts';
import { loudness } from './loudness.ts';

const BAND_FFT = 8192;

const NOMINAL = [
  '31.5 Hz',
  '40 Hz',
  '50 Hz',
  '63 Hz',
  '80 Hz',
  '100 Hz',
  '125 Hz',
  '160 Hz',
  '200 Hz',
  '250 Hz',
  '315 Hz',
  '400 Hz',
  '500 Hz',
  '630 Hz',
  '800 Hz',
  '1 kHz',
  '1.25 kHz',
  '1.6 kHz',
  '2 kHz',
  '2.5 kHz',
  '3.15 kHz',
  '4 kHz',
  '5 kHz',
  '6.3 kHz',
  '8 kHz',
  '10 kHz',
  '12.5 kHz',
  '16 kHz',
] as const;

const BANDS = NOMINAL.map((name, i) => ({ name, hz: 1000 * 10 ** ((i - 15) / 10) }));

const EDGE = 10 ** (1 / 20);

const RUMBLE_HZ = 30;

const COUNTED_DB = 40;

const SILENT_SHARE = 1e-12;

const APART_DB = 6;

export interface Profile {
  readonly secs: number;
  readonly integrated: number;
  readonly momentaryMax: number;
  readonly peak: number;
  readonly onset: number;
  readonly hit: number;
  readonly tail: number;
  readonly stands: number;
  readonly centroid: number;
  readonly flatness: number;
  readonly bands: ReadonlyArray<number>;
  readonly rumble: number;
}

export const profileOf = (pcm: Pcm, use: SoundUse): Profile => {
  const described = describeSound(pcm);
  const loud = loudness(pcm);
  const power = new Float64Array(BAND_FFT / 2);
  for (const plane of pcm.channels)
    powerSpectrum(plane, BAND_FFT, use === 'bed' ? 'looped' : 'silent').forEach((p, k) => {
      power[k] = (power[k] ?? 0) + p;
    });
  const binHz = pcm.rate / BAND_FFT;
  const between = (low: number, high: number): number => {
    let sum = 0;
    for (let k = Math.max(1, Math.ceil(low / binHz)); k < power.length && k * binHz < high; k++)
      sum += power[k] ?? 0;
    return sum;
  };
  const total = between(0, Number.POSITIVE_INFINITY);
  const share = (p: number) => (total > 0 ? p / total : 0);
  return {
    secs: described.secs,
    integrated: loud.integrated,
    momentaryMax: loud.momentaryMax,
    peak: loud.peak,
    onset: described.onset,
    hit: described.hit,
    tail: described.end - described.hit,
    stands: described.stands,
    centroid: described.centroid,
    flatness: described.flatness,
    bands: BANDS.map(({ hz }) => share(between(hz / EDGE, hz * EDGE))),
    rumble: share(between(0, RUMBLE_HZ)),
  };
};

const median = (values: Arr.NonEmptyReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

export const medianProfile = (profiles: Arr.NonEmptyReadonlyArray<Profile>): Profile => {
  const of = (read: (p: Profile) => number) => median(Arr.map(profiles, read));
  return {
    secs: of((p) => p.secs),
    integrated: of((p) => p.integrated),
    momentaryMax: of((p) => p.momentaryMax),
    peak: of((p) => p.peak),
    onset: of((p) => p.onset),
    hit: of((p) => p.hit),
    tail: of((p) => p.tail),
    stands: of((p) => p.stands),
    centroid: of((p) => p.centroid),
    flatness: of((p) => p.flatness),
    bands: BANDS.map((_, k) => of((p) => p.bands[k] ?? 0)),
    rumble: of((p) => p.rumble),
  };
};

interface BandRow {
  readonly band: string;
  readonly from: number;
  readonly to: number;
  readonly moved: number;
}

interface Distance {
  readonly bands: ReadonlyArray<BandRow>;
  readonly balance: number;
  readonly apart: ReadonlyArray<BandRow>;
  readonly hit: number;
}

const levelsOf = (bands: ReadonlyArray<number>) => {
  const floor = Math.max(SILENT_SHARE, Math.max(...bands) * 10 ** (-COUNTED_DB / 10));
  return bands.map((share) => ({
    db: 10 * Math.log10(Math.max(share, floor)),
    counts: share >= floor,
  }));
};

export const distance = (from: Profile, to: Profile): Distance => {
  const a = levelsOf(from.bands);
  const b = levelsOf(to.bands);
  const bands = BANDS.flatMap(({ name }, k): ReadonlyArray<BandRow> => {
    const x = a[k];
    const y = b[k];
    if (x === undefined || y === undefined || !(x.counts || y.counts)) return [];
    return [{ band: name, from: x.db, to: y.db, moved: y.db - x.db }];
  });
  const squares = bands.reduce((sum, row) => sum + row.moved * row.moved, 0);
  return {
    bands,
    balance: bands.length > 0 ? Math.sqrt(squares / bands.length) : 0,
    apart: bands.filter((row) => Math.abs(row.moved) > APART_DB),
    hit: to.hit - from.hit,
  };
};

type Sync = NonNullable<SoundEffect['sync']>;

export const HIT_MOVE = 0.02;

export const HEARD_HIT = 3;

const heardHit = (sync: Sync, p: Profile): number => {
  if (sync === 'start') return p.hit;
  if (sync === 'onset') return p.hit - p.onset;
  return 0;
};

interface HitMove {
  readonly median: number;
  readonly worst: number;
  readonly heard: boolean;
}

export const hitMove = (
  sync: Sync,
  from: Arr.NonEmptyReadonlyArray<Profile>,
  to: Arr.NonEmptyReadonlyArray<Profile>,
): HitMove => {
  const heard = (p: Profile) => heardHit(sync, p);
  const base = median(Arr.map(from, heard));
  const moves = Arr.map(to, (p) => heard(p) - base);
  return {
    median: median(Arr.map(to, heard)) - base,
    worst: moves.reduce((worst, move) => (Math.abs(move) > Math.abs(worst) ? move : worst)),
    heard: median(Arr.map(from, (p) => p.stands)) >= HEARD_HIT,
  };
};
