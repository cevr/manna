/**
 * Where a guitarist strikes each chord change of a sung line, as pure
 * functions over one line's sung syllables (each its start, length and
 * melody key in the file's ticks), its chord changes as they come in the
 * file, and the file's meters. The compiler places every guitar chord by
 * `strong` when the melody confirms the grid (On the beat), then folds
 * brief changes for Simpler, or keeps the original anchors for File.
 * The other rules are the chordfeel study's candidates.
 *
 * Every rule keeps a line's chords in order and moves a change only later
 * in its line: never onto or past the next change's place today, never to
 * or past the line's end. A change at the line's very start moves only when
 * a different chord sounds before the line (`before`); its first syllable
 * then shows that chord held over. When a rule finds no place, the change
 * stays where it is.
 *
 * The beat grid comes from the meters' ticks, bars counted from each
 * meter's start. A compound meter (6/8, 9/8, 12/8, 6/4) beats in dotted
 * notes. The strong beats are each bar's first beat and, in a bar of four
 * beats (4/4, 12/8, 4/2), its third.
 *
 * Pure: no file, Bun or Node access.
 */

import * as Chord from './chord.js';
import { type Hymn, PER_BEAT, sung } from './hymn.js';
import type { TimeSignature } from './midi.js';
import { Schema } from 'effect';

/** Placement changes anchors; chord spelling is a separate reader choice. */
export const Placement = Schema.Literals(['beat', 'simpler', 'file']);
export type Placement = typeof Placement.Type;

export interface Syllable {
  /** When it is sung, in ticks. */
  readonly start: number;
  /** How long it is sung, in ticks: its first note's start to its last note's end. */
  readonly length: number;
  /** The melody's MIDI key at its start, when the tune has a note there. */
  readonly key: number | undefined;
}

export interface Change {
  /** The syllable it is shown on, by its place in the line. */
  readonly syllable: number;
  /** Ticks after that syllable's start: 0 is on the syllable itself. */
  readonly at: number;
  readonly chord: Chord.Chord;
}

export interface Line {
  readonly syllables: readonly Syllable[];
  readonly changes: readonly Change[];
  /** The tick the next sung line starts at: the line's last chord sounds until then. */
  readonly until: number;
  /** The chord sounding before the line starts, when one does. */
  readonly before: Chord.Chord | undefined;
}

export interface Grid {
  readonly ticksPerBeat: number;
  /** Every meter from the tick it starts, the first at tick 0. */
  readonly meters: readonly TimeSignature[];
  /** The key's tonic as a pitch class: chord degrees are above it. */
  readonly tonic: number;
}

export interface Beat {
  /** The bar, from 0 at the file's start. */
  readonly bar: number;
  /** The beat within the bar, from 0; for a tick off the beat, the beat it falls in. */
  readonly beat: number;
  readonly on: boolean;
  readonly strong: boolean;
}

export const RULES = [
  { id: 'strong', label: 'R1 strong beat', says: 'A change moves to the next strong beat.' },
  { id: 'beat', label: 'R1b any beat', says: 'A change off the beat moves to the next beat.' },
  {
    id: 'tone',
    label: 'R2 melody chord tone',
    says: 'A change moves to the first syllable whose melody note is a tone of its chord.',
  },
  {
    id: 'length',
    label: 'R3 minimum length',
    says: 'A change lasting less than a beat folds into the chord before it (a first change, into the one after).',
  },
  {
    id: 'long',
    label: 'R4 long note',
    says: 'A change moves to the next syllable that lasts longer than the syllable before it.',
  },
  {
    id: 'strong+length',
    label: 'R1 then R3',
    says: 'The strong beat, then any change that leaves shorter than a beat folds.',
  },
  {
    id: 'tone-on-strong',
    label: 'R2 on R1',
    says: 'The first strong beat whose melody note is a chord tone; else the strong beat.',
  },
  {
    id: 'strong+long',
    label: 'R1 then R4',
    says: 'The strong beat, then the first syllable from there that lasts longer than the one before it.',
  },
] as const;

export type RuleId = (typeof RULES)[number]['id'];

// --- The beat grid ---

const isCompound = (meter: TimeSignature) => meter.numerator > 3 && meter.numerator % 3 === 0;
const beatsInBar = (meter: TimeSignature) =>
  isCompound(meter) ? meter.numerator / 3 : meter.numerator;
const beatTicks = (grid: Grid, meter: TimeSignature) =>
  ((grid.ticksPerBeat * 4) / meter.denominator) * (isCompound(meter) ? 3 : 1);
const isStrongBeat = (meter: TimeSignature, beat: number) => {
  const beats = beatsInBar(meter);
  return beat === 0 || (beats === 4 && beat === 2);
};
/** The files strike notes up to a few ticks off the grid. */
const slackOf = (grid: Grid) => grid.ticksPerBeat / 16;

/** The meter sounding at a tick, and the bars before it began. */
const meterAt = (grid: Grid, tick: number) => {
  let bars = 0;
  let meter = grid.meters[0] ?? { tick: 0, numerator: 4, denominator: 4 };
  for (const [i, m] of grid.meters.entries()) {
    if (m.tick > tick + slackOf(grid)) break;
    const previous = grid.meters[i - 1];
    if (previous !== undefined) {
      const bar = beatTicks(grid, previous) * beatsInBar(previous);
      bars += Math.ceil((m.tick - previous.tick) / bar - 1e-9);
    }
    meter = m;
  }
  return { meter, bars };
};

/** Where a tick falls on the meters' grid. */
export const beatAt = (grid: Grid, tick: number): Beat => {
  const { meter, bars } = meterAt(grid, tick);
  const beat = beatTicks(grid, meter);
  const perBar = beatsInBar(meter);
  const offset = tick - meter.tick;
  const nearest = Math.round(offset / beat);
  const on = Math.abs(offset - nearest * beat) <= slackOf(grid);
  const index = on ? nearest : Math.floor(offset / beat);
  const at = { bar: bars + Math.floor(index / perBar), beat: index % perBar };
  return { ...at, on, strong: on && isStrongBeat(meter, at.beat) };
};

/** The beat ticks after `from` and before `to`: every beat, or the strong ones alone. */
const beatsBetween = (grid: Grid, from: number, to: number, strong: boolean): number[] => {
  const out: number[] = [];
  const slack = slackOf(grid);
  grid.meters.forEach((meter, i) => {
    const end = Math.min(to, grid.meters[i + 1]?.tick ?? to);
    const beat = beatTicks(grid, meter);
    for (let k = Math.max(0, Math.floor((from - meter.tick) / beat)); ; k++) {
      const tick = meter.tick + k * beat;
      if (tick >= end - slack) break;
      if (tick <= from + slack) continue;
      if (!strong || isStrongBeat(meter, k % beatsInBar(meter))) out.push(tick);
    }
  });
  return out;
};

/** The first strong beat's tick after `from` and before `to`, when one comes. */
export const nextStrong = (grid: Grid, from: number, to: number): number | undefined =>
  beatsBetween(grid, from, to, true)[0];

/** A beat's length at a tick: a quarter in 4/4, a dotted quarter in 6/8, a half in 3/2. */
const beatLengthAt = (grid: Grid, tick: number) => beatTicks(grid, meterAt(grid, tick).meter);

// --- The bar grid the melody confirms ---

/** The meters the hymnal's files carry: their strong beats are the grids a melody is held against. */
const METERS: readonly TimeSignature[] = (
  [
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
    [2, 4],
    [3, 4],
    [4, 4],
    [6, 4],
    [9, 4],
    [3, 8],
    [4, 8],
    [6, 8],
    [9, 8],
    [12, 8],
  ] satisfies ReadonlyArray<readonly [number, number]>
).map(([numerator, denominator]) => ({ tick: 0, numerator, denominator }));

/** The ticks from one strong beat to the next in a meter: a bar, or half a bar of four beats. */
const strongEvery = (grid: Grid, meter: TimeSignature) =>
  beatTicks(grid, meter) * (beatsInBar(meter) === 4 ? 2 : beatsInBar(meter));

/**
 * The ticks a line's melody leans on: each syllable held two beats or more
 * (one dotted beat in a compound meter), and the line's last, where its
 * phrase comes to rest.
 */
const accentsOf = (grid: Grid, lines: readonly (readonly Syllable[])[]): number[] =>
  lines.flatMap((line) =>
    line.flatMap((s, k) => {
      const meter = meterAt(grid, s.start).meter;
      const long = beatTicks(grid, meter) * (isCompound(meter) ? 1 : 2);
      return k === line.length - 1 || s.length >= long - slackOf(grid) ? [s.start] : [];
    }),
  );

/**
 * Whether a melody confirms the grid's bars: its accents (`accentsOf`) fall
 * on the grid's strong beats at least as often as on the strong beats of any
 * other bar, shifted by any eighth: every meter's whose strong beats are as
 * far apart as the grid's or further, so a denser grid never wins by
 * density alone. A file whose tick 0 is not a printed downbeat, or whose
 * meter is not the printed one, puts its strong beats where the tune does
 * not lean, and some other bar fits the tune better. A melody with no
 * accent confirms nothing.
 */
export const confirms = (grid: Grid, lines: readonly (readonly Syllable[])[]): boolean => {
  const accents = accentsOf(grid, lines);
  if (accents.length === 0) return false;
  const slack = slackOf(grid);
  const onGrid = accents.filter((tick) => beatAt(grid, tick).strong).length;
  const least = Math.min(...grid.meters.map((meter) => strongEvery(grid, meter)));
  const periods = [...new Set(METERS.map((meter) => strongEvery(grid, meter)))].filter(
    (period) => period >= least - slack,
  );
  const step = grid.ticksPerBeat / 2;
  return periods.every((period) => {
    for (let phase = 0; phase < period - slack; phase += step) {
      const on = accents.filter((tick) => {
        const r = (((tick - phase) % period) + period) % period;
        return r <= slack || period - r <= slack;
      }).length;
      if (on > onGrid) return false;
    }
    return true;
  });
};

/**
 * The lines a compiled hymn's bar grid is judged on, each its sung
 * syllables in the timing's units: stanza 1's played lines, and the
 * refrain's when it is sung right after stanza 1.
 */
export const judgedLines = (hymn: Hymn): Syllable[][] => {
  const timing = hymn.timing;
  if (timing === undefined) return [];
  const all = sung(hymn);
  const end = all.findIndex((line) => line.verse !== 1 && line.verse !== 'refrain');
  const order = hymn.refrain?.order;
  const after = order === 'after-each' || order === 'first-and-after-each';
  return all.slice(0, end === -1 ? all.length : end).flatMap((line, i) => {
    const time = timing.lines[i];
    const refrainFirst = line.verse === 'refrain' && !all.slice(0, i).some((l) => l.verse === 1);
    if (line.part._tag !== 'Sung' || time === undefined || !time.played || time.even) return [];
    if (line.verse === 'refrain' && (!after || refrainFirst)) return [];
    const syllables = line.part.lines[line.line] ?? [];
    if (syllables.length !== time.syllables.length) return [];
    const out = syllables.flatMap((s, k): Syllable[] => {
      const start = time.syllables[k];
      if (s.notes === 0 || start === undefined) return [];
      return [{ start, length: Math.round(s.beats * PER_BEAT), key: undefined }];
    });
    return out.length === 0 ? [] : [out];
  });
};

// --- Chord tones ---

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Each quality's intervals above its root. */
const TONES: Record<Chord.Quality, readonly number[]> = {
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

/** Whether a MIDI key is a tone of a chord, its degrees above the tonic. */
export const isChordTone = (grid: Grid, chord: Chord.Chord, key: number): boolean => {
  const degree = mod12(key - grid.tonic);
  return (
    TONES[chord.quality].some((interval) => mod12(chord.root + interval) === degree) ||
    chord.bass === degree
  );
};

// --- Moving changes ---

/** A change's tick. */
export const tickOf = (line: Line, change: Change): number =>
  (line.syllables[change.syllable]?.start ?? 0) + change.at;

/** The syllable sung at a tick, and the ticks into it. */
const placeAt = (line: Line, tick: number, slack: number): Omit<Change, 'chord'> => {
  let syllable = 0;
  line.syllables.forEach((s, k) => {
    if (s.start <= tick + slack) syllable = k;
  });
  const start = line.syllables[syllable]?.start ?? tick;
  return { syllable, at: Math.abs(tick - start) <= slack ? 0 : tick - start };
};

/** Syllable onsets from `from` (inclusive) to before `to`, by place. */
const onsetsBetween = (line: Line, from: number, to: number, slack: number): number[] =>
  line.syllables.flatMap((s, k) => (s.start >= from - slack && s.start < to - slack ? [k] : []));

/** A target finder: the tick a change at `tick` (its index `i`) moves to before `limit`, if any. */
type Target = (
  line: Line,
  grid: Grid,
  i: number,
  tick: number,
  limit: number,
) => number | undefined;

const strongTarget: Target = (_line, grid, _i, tick, limit) =>
  beatAt(grid, tick).strong ? tick : nextStrong(grid, tick, limit);

const beatTarget: Target = (_line, grid, _i, tick, limit) =>
  beatAt(grid, tick).on ? tick : beatsBetween(grid, tick, limit, false)[0];

const toneTarget: Target = (line, grid, i, tick, limit) => {
  const change = line.changes[i];
  if (change === undefined) return undefined;
  const slack = slackOf(grid);
  const sounding = line.syllables[placeAt(line, tick, slack).syllable]?.key;
  if (sounding !== undefined && isChordTone(grid, change.chord, sounding)) return tick;
  const k = onsetsBetween(line, tick, limit, slack).find((j) => {
    const key = line.syllables[j]?.key;
    return key !== undefined && isChordTone(grid, change.chord, key);
  });
  return k === undefined ? undefined : line.syllables[k]?.start;
};

/** The first syllable from tick on (its own only when the tick is its start) longer than the one before it. */
const longFrom = (line: Line, grid: Grid, tick: number, limit: number) => {
  const k = onsetsBetween(line, tick, limit, slackOf(grid)).find((j) => {
    const [before, here] = [line.syllables[j - 1], line.syllables[j]];
    return before !== undefined && here !== undefined && here.length > before.length;
  });
  return k === undefined ? undefined : line.syllables[k]?.start;
};

const longTarget: Target = (line, grid, _i, tick, limit) => longFrom(line, grid, tick, limit);

const toneOnStrongTarget: Target = (line, grid, i, tick, limit) => {
  const change = line.changes[i];
  if (change === undefined) return undefined;
  const slack = slackOf(grid);
  const k = onsetsBetween(line, tick, limit, slack).find((j) => {
    const s = line.syllables[j];
    return (
      s !== undefined &&
      s.key !== undefined &&
      beatAt(grid, s.start).strong &&
      isChordTone(grid, change.chord, s.key)
    );
  });
  const onset = k === undefined ? undefined : line.syllables[k]?.start;
  return onset ?? strongTarget(line, grid, i, tick, limit);
};

const strongLongTarget: Target = (line, grid, i, tick, limit) => {
  const strong = strongTarget(line, grid, i, tick, limit) ?? tick;
  return longFrom(line, grid, strong, limit) ?? strong;
};

/** Each change moved to its target, bounded by the next change's place today and the line's end. */
const moveEach = (line: Line, grid: Grid, target: Target): Change[] => {
  const slack = slackOf(grid);
  return line.changes.map((change, i) => {
    const tick = tickOf(line, change);
    const opens = change.syllable === 0 && change.at === 0;
    const held = line.before === undefined || Chord.equals(line.before, change.chord);
    if (opens && held) return change;
    const next = line.changes[i + 1];
    const limit = Math.min(next === undefined ? line.until : tickOf(line, next), line.until);
    const to = target(line, grid, i, tick, limit);
    if (to === undefined || to <= tick + slack) return change;
    return { ...placeAt(line, to, slack), chord: change.chord };
  });
};

/**
 * Folds each change that lasts less than a beat into the chord before it;
 * a first change still that short gives its place to the change after it.
 * Only changes from the harmony left sounding are retained.
 */
const foldShort = (line: Line, grid: Grid, changes: readonly Change[]): Change[] => {
  const lengthOf = (i: number, list: readonly Change[]) => {
    const [here, next] = [list[i], list[i + 1]];
    if (here === undefined) return 0;
    return (next === undefined ? line.until : tickOf(line, next)) - tickOf(line, here);
  };
  const out: Change[] = [];
  changes.forEach((change, i) => {
    const short = lengthOf(i, changes) < beatLengthAt(grid, tickOf(line, change));
    if (!short || out.length === 0) out.push(change);
  });
  const [first, second] = out;
  if (
    first !== undefined &&
    second !== undefined &&
    lengthOf(0, out) < beatLengthAt(grid, tickOf(line, first))
  ) {
    out.splice(0, 2, { ...second, syllable: first.syllable, at: first.at });
  }
  return out.filter((change, i) => {
    const previous = out[i - 1];
    return previous === undefined || !Chord.equals(previous.chord, change.chord);
  });
};

const TARGETS: Record<RuleId, (line: Line, grid: Grid) => Change[]> = {
  strong: (line, grid) => moveEach(line, grid, strongTarget),
  beat: (line, grid) => moveEach(line, grid, beatTarget),
  tone: (line, grid) => moveEach(line, grid, toneTarget),
  length: (line, grid) => foldShort(line, grid, line.changes),
  long: (line, grid) => moveEach(line, grid, longTarget),
  'strong+length': (line, grid) => foldShort(line, grid, moveEach(line, grid, strongTarget)),
  'tone-on-strong': (line, grid) => moveEach(line, grid, toneOnStrongTarget),
  'strong+long': (line, grid) => moveEach(line, grid, strongLongTarget),
};

/** A line's changes as a rule places them. */
export const apply = (id: RuleId, line: Line, grid: Grid): Change[] => TARGETS[id](line, grid);

/** Whether a rule puts a line's changes on exactly these syllables, each on the syllable's start. */
export const reproduces = (
  id: RuleId,
  line: Line,
  grid: Grid,
  syllables: readonly number[],
): boolean => {
  const placed = apply(id, line, grid);
  return (
    placed.length === syllables.length &&
    placed.every((change, i) => change.at === 0 && change.syllable === syllables[i])
  );
};
