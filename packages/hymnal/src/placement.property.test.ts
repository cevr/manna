import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Chord from './chord.js';
import { compiled } from './compiled-fixture.js';
import { type Hymn, PER_BEAT, type Syllable, sung, type Timing } from './hymn.js';
import * as Midi from './midi.js';
import * as Placement from './placement.js';

/**
 * The compiler's placement rule, R1 (owner, 2026-10-24): a guitar change
 * moves to the next strong beat (a bar's first beat, and the third in a bar
 * of four), never onto or past the next change and never out of its line.
 * Held here over lines drawn from a fixed seed, and over every sung line of
 * the compiled set.
 */

/** A fixed-seed source of numbers in [0, 1) (mulberry32), so each run draws the same lines. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const METERS = [
  [4, 4],
  [3, 4],
  [2, 2],
  [6, 8],
  [9, 8],
  [12, 8],
  [3, 2],
  [4, 2],
  [6, 4],
] as const;

const QUALITIES: readonly Chord.Quality[] = ['', 'm', '7', 'sus4', 'dim'];

/** Eight ticks a quarter, so a bar is at most 64 ticks and every tick can be looked at. */
const TPB = 8;
const SLACK = TPB / 16;

interface Drawn {
  readonly line: Placement.Line;
  readonly grid: Placement.Grid;
}

/** One line on one or two meters: syllables on eighths, changes on syllables or between. */
const draw = (random: () => number): Drawn => {
  const int = (n: number) => Math.floor(random() * n);
  const pick = <A>(items: readonly A[]): A => items[int(items.length)] as A;
  const meter = (tick: number) => {
    const [numerator, denominator] = pick(METERS);
    return { tick, numerator, denominator };
  };
  const meters = random() < 0.2 ? [meter(0), meter(TPB * (2 + int(8)))] : [meter(0)];
  const grid: Placement.Grid = { ticksPerBeat: TPB, meters, tonic: int(12) };
  const syllables: Placement.Syllable[] = [];
  let tick = (TPB / 2) * int(8);
  for (let k = 0, count = 1 + int(10); k < count; k++) {
    const gap = (TPB / 2) * (1 + int(4));
    syllables.push({
      start: tick,
      length: gap - (random() < 0.3 ? TPB / 2 : 0),
      key: 60 + int(12),
    });
    tick += gap;
  }
  const until = tick;
  const chord = () => ({ root: int(12), quality: pick(QUALITIES) });
  const changes: Placement.Change[] = [];
  syllables.forEach((s, k) => {
    const next = syllables[k + 1]?.start ?? until;
    if (k > 0 && random() < 0.5) return;
    changes.push({ syllable: k, at: 0, chord: chord() });
    if (random() < 0.3 && next - s.start > TPB / 2)
      changes.push({ syllable: k, at: TPB / 2, chord: chord() });
  });
  return {
    line: { syllables, changes, until, before: random() < 0.7 ? chord() : undefined },
    grid,
  };
};

/** Every strong beat's tick strictly between `from` and `to`, found tick by tick with `beatAt`. */
const strongBetween = (grid: Placement.Grid, from: number, to: number) => {
  const out: number[] = [];
  for (let t = Math.ceil(from + SLACK + 1e-9); t < to - SLACK; t++)
    if (Placement.beatAt(grid, t).strong) out.push(t);
  return out;
};

/** A change kept where it was: a line's opening chord with nothing different sounding before it. */
const opensHeld = (line: Placement.Line, change: Placement.Change) =>
  change.syllable === 0 &&
  change.at === 0 &&
  (line.before === undefined || Chord.equals(line.before, change.chord));

/** Why a line's placed changes break R1, or nothing. */
const breaches = (line: Placement.Line, grid: Placement.Grid): string[] => {
  const placed = Placement.apply('strong', line, grid);
  const out: string[] = [];
  if (placed.length !== line.changes.length)
    return [`${placed.length} changes for ${line.changes.length}`];
  placed.forEach((change, i) => {
    const was = line.changes[i];
    if (was === undefined) return;
    const at = `change ${i}`;
    if (!Chord.equals(change.chord, was.chord)) out.push(`${at}: another chord`);
    if (line.syllables[change.syllable] === undefined || change.at < 0)
      out.push(`${at}: off the line`);
    const from = Placement.tickOf(line, was);
    const to = Placement.tickOf(line, change);
    const next = line.changes[i + 1];
    const limit = Math.min(
      next === undefined ? line.until : Placement.tickOf(line, next),
      line.until,
    );
    if (to < from - SLACK) out.push(`${at}: moved earlier`);
    if (to > from + SLACK && to >= limit - SLACK) out.push(`${at}: moved onto or past its limit`);
    if (opensHeld(line, was)) {
      if (to !== from) out.push(`${at}: a held opening moved`);
      return;
    }
    const strong = Placement.beatAt(grid, to).strong;
    const first = strongBetween(grid, from, limit)[0];
    if (!Placement.beatAt(grid, from).strong && first !== undefined && Math.abs(to - first) > SLACK)
      out.push(`${at}: at ${to}, not the strong beat at ${first}`);
    if (first === undefined && !Placement.beatAt(grid, from).strong && to !== from)
      out.push(`${at}: moved with no strong beat before its limit`);
    if (to !== from && !strong) out.push(`${at}: moved off a strong beat`);
    if (Placement.beatAt(grid, from).strong && to !== from)
      out.push(`${at}: moved from a strong beat`);
  });
  return out;
};

/**
 * A melody that leans on a one-meter grid's strong beats: from each strong
 * beat to the next, one held note or a run of eighths, and each line ends on
 * a held note, so every syllable held two beats or more and every line's
 * last starts on a strong beat. With the grid's beat in ticks.
 */
const leaning = (grid: Placement.Grid, random: () => number) => {
  const strong: number[] = [];
  for (let t = 0; strong.length < 2 + Math.floor(random() * 10); t++)
    if (Placement.beatAt(grid, t).strong) strong.push(t);
  let beat = 1;
  while (!Placement.beatAt(grid, beat).on) beat++;
  const lines: Placement.Syllable[][] = [[]];
  strong.slice(0, -1).forEach((from, i) => {
    const to = strong[i + 1] ?? from;
    const line = lines.at(-1) ?? [];
    const ends = i === strong.length - 2 || random() < 0.3;
    if (ends || random() < 0.5) line.push({ start: from, length: to - from, key: undefined });
    else
      for (let t = from; t < to; t += TPB / 2)
        line.push({ start: t, length: TPB / 2, key: undefined });
    if (ends && i < strong.length - 2) lines.push([]);
  });
  return { lines, beat };
};

describe('R1 over drawn lines', () => {
  it.effect(
    "keeps each line's chords in order, each moved to the first strong beat before its limit",
    () =>
      Effect.sync(() => {
        const random = seeded(20261024);
        const found: string[] = [];
        for (let n = 0; n < 1500 && found.length < 10; n++) {
          const { line, grid } = draw(random);
          for (const breach of breaches(line, grid)) found.push(`line ${n}: ${breach}`);
        }
        expect(found).toEqual([]);
      }),
  );

  it.effect(
    "confirms a grid a melody leans on, and not the same grid a beat off the melody's bars",
    () =>
      Effect.sync(() => {
        const random = seeded(474259);
        const found: string[] = [];
        for (let n = 0; n < 400 && found.length < 10; n++) {
          const { grid } = draw(random);
          const one: Placement.Grid = { ...grid, meters: grid.meters.slice(0, 1) };
          const { lines, beat } = leaning(one, random);
          const shifted = lines.map((line) => line.map((s) => ({ ...s, start: s.start + beat })));
          const meter = `${one.meters[0]?.numerator}/${one.meters[0]?.denominator}`;
          if (!Placement.confirms(one, lines)) found.push(`melody ${n} in ${meter}: not confirmed`);
          if (Placement.confirms(one, shifted))
            found.push(`melody ${n} in ${meter}: confirmed a beat off`);
        }
        expect(found).toEqual([]);
      }),
  );

  it.effect('finds the next strong beat as the beat grid reads each tick', () =>
    Effect.sync(() => {
      const random = seeded(7);
      const found: string[] = [];
      for (let n = 0; n < 800 && found.length < 10; n++) {
        const { grid } = draw(random);
        const from = Math.floor(random() * 200);
        const to = from + Math.floor(random() * 120);
        const want = strongBetween(grid, from, to)[0];
        const got = Placement.nextStrong(grid, from, to);
        const near = got !== undefined && want !== undefined && Math.abs(got - want) <= SLACK;
        if (!(got === want || near)) found.push(`(${from}, ${to}): ${got} for ${want}`);
      }
      expect(found).toEqual([]);
    }),
  );
});

const MIDI = new URL('../data/midi/', import.meta.url).pathname;
const pad = (n: number) => String(n).padStart(3, '0');

interface Loaded {
  readonly hymn: Hymn;
  readonly grid: Placement.Grid;
  /** Whether its melody confirms the file's bars, the grid R1 strikes on. */
  readonly confirmed: boolean;
}

/**
 * The time-signature events a MIDI file may hold: each `FF 58 04` run in its
 * bytes. A byte of 0xFF starts a meta event or sits inside one's data, so the
 * count is never short.
 */
const signatures = (bytes: Uint8Array) => {
  let count = 0;
  for (let i = bytes.indexOf(0xff); i !== -1; i = bytes.indexOf(0xff, i + 1))
    if (bytes[i + 1] === 0x58 && bytes[i + 2] === 0x04) count++;
  return count;
};

/** Each compiled hymn, with its file's meters in the timing's units. */
const load = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const hymns = yield* compiled;
  return yield* Effect.forEach(
    hymns,
    (hymn) =>
      Effect.gen(function* () {
        const bytes = yield* fs.readFile(`${MIDI}${pad(hymn.number)}.mid`);
        const meters = [{ tick: 0, ...hymn.meter }];
        // Only a file with more than one time signature is read whole: the hymn keeps its first.
        if (signatures(bytes) > 1) {
          const midi = yield* Midi.parse(bytes);
          const units = (tick: number) => (tick * PER_BEAT) / midi.ticksPerBeat;
          meters.push(...midi.timeSignatures.slice(1).map((m) => ({ ...m, tick: units(m.tick) })));
        }
        const grid: Placement.Grid = { ticksPerBeat: PER_BEAT, meters, tonic: 0 };
        const confirmed = Placement.confirms(grid, Placement.judgedLines(hymn));
        return { hymn, grid, confirmed } satisfies Loaded;
      }),
    { concurrency: 16 },
  );
});

/** The hymns, read once as the file loads, for every test here: each read is 695 files. */
// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays for it inside its time limit
const loaded = await Effect.runPromise(load.pipe(Effect.provide(BunServices.layer)));

/** One stored line on the timeline, in the timing's units, as R1 read it. */
interface Walked {
  readonly at: string;
  readonly line: Placement.Line;
  /** The last chord sung before it, when one was. */
  readonly held: Chord.Chord | undefined;
  /** The next sung line's start: the time the line owns, its rest included. */
  readonly next: number;
  /** Whether it is the first line of its laying, whose opening R1 never moves. */
  readonly opens: boolean;
  /** Whether its first printed syllable shows a chord as it starts. */
  readonly shows: boolean;
  /** Its full harmony's changes, each at its tick. */
  readonly full: ReadonlyArray<{ readonly tick: number; readonly chord: Chord.Chord }>;
}

type Sung = ReturnType<typeof sung>[number];

/**
 * Whether the line at `i` is stored where it is sung: a stanza's lines, and
 * the refrain's where it is stored from (after stanza 1, or after the last
 * stanza for a refrain sung after the last alone).
 */
const storedAt = (hymn: Hymn, all: readonly Sung[], timing: Timing): ((i: number) => boolean) => {
  const order = hymn.refrain?.order;
  const lastOnly = order === 'first-and-last' || order === 'after-last';
  const refrainAt = all.flatMap((line, i) =>
    line.verse === 'refrain' && line.line === 0 && timing.lines[i]?.played === true ? [i] : [],
  );
  const from = lastOnly ? refrainAt.at(-1) : refrainAt[0];
  const count = hymn.refrain?.part.lines.length ?? 0;
  return (i) =>
    all[i]?.verse !== 'refrain' || (from !== undefined && i >= from && i < from + count);
};

/** A line's placement input as the compiler read it: its sung syllables alone, a shared one carrying none. */
const inputOf = (
  syllables: readonly Syllable[],
  time: Timing['lines'][number],
  before: Chord.Chord | undefined,
): Placement.Line => {
  const sungAt = syllables.flatMap((s, k) => (s.notes > 0 ? [k] : []));
  const k = sungAt.at(-1) ?? -1;
  const last = syllables[k];
  const end =
    last === undefined
      ? time.until
      : (time.syllables[k] ?? time.start) + Math.round(last.beats * PER_BEAT);
  return {
    syllables: sungAt.map((k) => ({
      start: time.syllables[k] ?? 0,
      length: Math.round((syllables[k]?.beats ?? 0) * PER_BEAT),
      key: undefined,
    })),
    changes: sungAt.flatMap((k, j) =>
      (syllables[k]?.guitar ?? []).map((c) => ({
        syllable: j,
        at: Math.round(c.at * PER_BEAT),
        chord: c.chord,
      })),
    ),
    until: Math.min(end, time.until),
    before,
  };
};

/**
 * Every stored line where the file plays it, in sung order. Lines laid in
 * even shares or not played are left out: their times are not the notes'.
 */
const walked = ({ hymn }: Loaded): Walked[] => {
  const timing = hymn.timing;
  if (timing === undefined) return [];
  const all = sung(hymn);
  const stored = storedAt(hymn, all, timing);
  // The last chord sung so far, and the last in the line's laying (a stanza and the refrain after it).
  let held: Chord.Chord | undefined;
  let laid: Chord.Chord | undefined;
  return all.flatMap((line, i): Walked[] => {
    const [before, opens] = [held, line.verse !== 'refrain' && line.line === 0];
    const syllables = line.part._tag === 'Sung' ? (line.part.lines[line.line] ?? []) : [];
    const last = syllables.flatMap((s) => s.guitar ?? []).at(-1)?.chord;
    const inLaying = opens ? undefined : laid;
    held = last ?? held;
    laid = last ?? inLaying;
    const time = timing.lines[i];
    const kept =
      stored(i) && line.part._tag === 'Sung' && time !== undefined && time.played && !time.even;
    if (!kept || time.syllables.length !== syllables.length) return [];
    const verse = line.verse === 'refrain' ? 'refrain' : `stanza ${line.verse}`;
    return [
      {
        at: `${hymn.number} ${verse} line ${line.line}`,
        line: inputOf(syllables, time, inLaying),
        shows: syllables[0]?.guitar?.[0]?.at === 0,
        full: syllables.flatMap((s, k) =>
          (s.full ?? []).map((c) => ({
            tick: (time.syllables[k] ?? 0) + Math.round(c.at * PER_BEAT),
            chord: c.chord,
          })),
        ),
        held: before,
        next: time.until,
        opens,
      },
    ];
  });
};

/** The times are whole units: a change can sit a unit off the file's tick. */
const UNIT_SLACK = PER_BEAT / 16;

/** Why a stored line breaks R1, or nothing. */
const storedBreaches = (
  { at, line, held, next: owned, opens, shows }: Walked,
  grid: Placement.Grid,
): string[] => {
  const out: string[] = [];
  const first = line.changes[0];
  const start = line.syllables[0]?.start ?? 0;
  if (!shows && !opens && held === undefined && first !== undefined)
    out.push(`${at}: its first syllable shows no chord and none sounds before it`);
  line.changes.forEach((change, i) => {
    const tick = Placement.tickOf(line, change);
    const next = line.changes[i + 1];
    const limit = Math.min(
      next === undefined ? line.until : Placement.tickOf(line, next),
      line.until,
    );
    if (tick < start - UNIT_SLACK || tick >= owned + UNIT_SLACK)
      out.push(`${at}: change ${i} out of its line`);
    if (i === 0 && (opens || opensHeld(line, change))) return;
    if (Placement.beatAt(grid, tick).strong) return;
    const strong = Placement.nextStrong(grid, tick + UNIT_SLACK, limit - UNIT_SLACK);
    if (strong !== undefined)
      out.push(`${at}: change ${i} off the beat, a strong beat before its limit`);
  });
  return out;
};

/**
 * The guitar changes of a stored line that R1 struck later than the file
 * plays them: a change after the line's first, on a strong beat of the
 * file's grid, where the full harmony does not change, to the chord the full
 * harmony already sounds (simplified) since its last change before. Placed
 * where the file plays it, a guitar chord changes with the full harmony or to
 * a chord the full harmony does not sound: none is found in the placement of
 * the hymns below before R1 struck any chord (measured).
 */
const lateChanges = ({ at, line, full }: Walked, grid: Placement.Grid): string[] =>
  line.changes.slice(1).flatMap((change, i) => {
    const tick = Placement.tickOf(line, change);
    if (!Placement.beatAt(grid, tick).strong) return [];
    if (full.some((f) => Math.abs(f.tick - tick) <= UNIT_SLACK)) return [];
    const sounding = full.filter((f) => f.tick < tick - UNIT_SLACK).at(-1);
    if (sounding === undefined || !Chord.equals(Chord.simplify(sounding.chord), change.chord))
      return [];
    return [`${at}: change ${i + 1} struck after the full harmony reached it`];
  });

describe('R1 over the compiled set', () => {
  it.effect(
    "judges the hymns whose files' bars their melodies do not confirm, the printed ones confirmed",
    () =>
      Effect.sync(() => {
        const unconfirmed = loaded.filter((h) => !h.confirmed).map((h) => h.hymn.number);
        // Each a file whose bars or meter the printed page does not have: tick 0 not the printed
        // downbeat (474), 6/4 bars in a 4/4 file (51, 259), and the rest the review's probe found.
        for (const n of [
          51, 127, 128, 245, 255, 259, 363, 396, 474, 489, 492, 540, 542, 547, 551, 634,
        ])
          expect(unconfirmed).toContain(n);
        // 373's file and page agree: its refrain is struck as the owner strikes it.
        expect(unconfirmed).not.toContain(373);
        // R1 still strikes the chords of nearly every hymn: 102 of 695 are left as their files play.
        expect(unconfirmed.length).toBeLessThan(120);
      }),
  );

  it.effect("moves no guitar change of a hymn whose melody does not confirm its file's bars", () =>
    Effect.sync(() => {
      const hymns = loaded.filter((h) => !h.confirmed);
      const late = hymns.flatMap((h) => {
        const found = walked(h).flatMap((w) => lateChanges(w, h.grid));
        return found.length === 0 ? [] : [{ n: h.hymn.number, found }];
      });
      const report = [
        `late changes by hymn: ${late.map(({ n, found }) => `${n}:${found.length}`).join(' ')}`,
        ...late.flatMap(({ found }) => found.slice(0, 1)),
      ];
      expect(late.length, report.join('\n')).toBe(0);
    }),
  );

  /** Stanza 1's lines of a compiled hymn, each its guitar changes as `[syllable, at]`. */
  const stanzaOne = (hymns: readonly Hymn[], n: number) => {
    const part = hymns.find((h) => h.number === n)?.stanzas[0];
    const lines = part?._tag === 'Sung' ? part.lines : [];
    return lines.map((line) => line.flatMap((s, k) => (s.guitar ?? []).map((c) => [k, c.at])));
  };

  it.effect(
    "keeps 474's guitar chords on the syllables its file plays them, a beat off its bars",
    () =>
      Effect.gen(function* () {
        const lines = stanzaOne(yield* compiled, 474);
        expect(lines.map((line) => line[0])).toEqual([
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ]);
        expect(lines[2]?.map(([k]) => k)).toEqual([0, 2]);
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect("keeps 259's change at syllable 6 of its first line, its bars six quarters long", () =>
    Effect.gen(function* () {
      const line = stanzaOne(yield* compiled, 259)[0] ?? [];
      expect(line.filter(([k]) => k === 6)).toEqual([[6, 0]]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    'puts every guitar change of every played sung line on a strong beat, or none comes before its limit',
    () =>
      Effect.sync(() => {
        const lines = loaded.flatMap((h) => walked(h).map((w) => ({ w, h })));
        const changes = lines.reduce((sum, { w }) => sum + w.line.changes.length, 0);
        // A hymn whose melody does not confirm its file's bars keeps the file's placement.
        const found = lines.flatMap(({ w, h }) => (h.confirmed ? storedBreaches(w, h.grid) : []));
        expect(found.length, found.slice(0, 12).join('\n')).toBe(0);
        // Nearly every one of the 13,318 sung lines is walked: none is left out unseen.
        expect(lines.length).toBeGreaterThan(13_000);
        expect(changes).toBeGreaterThan(70_000);
      }),
  );

  it.effect(
    "puts 373's refrain line 0 chords on syllables 3 and 7, as the owner strikes them",
    () =>
      Effect.gen(function* () {
        const hymn = (yield* compiled).find((h) => h.number === 373);
        const part = hymn?.refrain?.part;
        const line = part?._tag === 'Sung' ? part.lines[0] : undefined;
        const syllables = (line ?? []).flatMap((s, k) => (s.guitar ?? []).map(() => k));
        expect(syllables).toEqual([3, 7]);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
