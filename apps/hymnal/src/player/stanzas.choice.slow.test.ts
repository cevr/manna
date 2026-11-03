/* oxlint-disable effect/noTernary, effect/noNullish -- the acceptance oracle writes the refrain binding, the cut and the toggle out as plain branches over plain numbers, apart from the product's code, so the two cannot share a mistake. */

/**
 * Acceptance (stanzas A1): the stanza choice over every compiled hymn and
 * every subset of its stanzas.
 *
 * - The binding: each sung line belongs to a stanza, or to none (0, the
 *   hymn's own refrain, always kept), by the oracle's own table from the
 *   hymn's refrain order, never from the words' sections: after-each, the
 *   stanza before; first-and-after-each, the opening refrain 0 and each other
 *   the stanza before; before-each, the stanza after; first-and-last, both 0;
 *   after-last, 0. The table is held to `sung` over the chosen stanzas alone.
 * - `keptOf(sections, choice)`: a line is kept when its stanza is chosen or it
 *   belongs to none; the empty choice keeps every line; a number outside
 *   1..N changes nothing.
 * - `cutOf(timeline, kept)`: the same lines, `first` and tempo; kept lines
 *   keep their lengths and syllable offsets and run on one after another
 *   from `first`; a skipped line has no length and no syllables and sits at
 *   the next kept line's start (or the cut's end); the end is `first` plus
 *   the kept lengths. `recordingAt` takes a sung (cut) time to the
 *   recording's, `sungAt` the reverse: the lead before `first` and the tail
 *   past the end are kept as they are, and a recording time inside a skipped
 *   line is the next kept start. `placeAt` on the cut finds each kept line
 *   and syllable where the full timeline did, and never a skipped line.
 * - `toggle(choice, stanza, count)` over every stored choice of N = 2..7
 *   stanzas: from all, a tap turns that stanza off; the last chosen stanza
 *   cannot be turned off; a choice of every stanza is stored as `[]`.
 *
 * Numbers only: no hymn's words are read into a message or printed. Lines
 * are named by index, stanzas by number.
 *
 * Slow: about 0.3 s over 9,475 cuts, past what the app's unit-test task
 * may add, so it runs in `test:slow`.
 *
 * Final path: `apps/hymnal/src/player/stanzas.choice.slow.test.ts`.
 */

import { describe, expect, it } from 'bun:test';
import { type Hymn, sung } from '@manna/hymnal/hymn';
import { Array as Arr, Option } from 'effect';
import bundled from 'virtual:hymnal-timing';

import { readPlaybackHymns } from '../../vite/chords';
import { placeAt, type TimedLine, type Timeline, timelineOf } from '../follow/timeline';
import { hymns as words } from '../hymns/hymns';
import * as Stanzas from './stanzas';

/** How many wrong cases a failure lists. */
const SHOWN = 12;

const playback = new Map(readPlaybackHymns().map((hymn) => [hymn.number, hymn]));
const sectionsOf = new Map(words.map((hymn) => [hymn.number, hymn.sections]));
const encodedOf = new Map(bundled);

/** Hymn `number`'s decoded timeline, as the follow reads it from the bundle. */
const timelineAt = (number: number): Timeline =>
  Option.getOrThrow(Option.flatMap(Option.fromUndefinedOr(encodedOf.get(number)), timelineOf));

/** One sung line in the oracle's table: the stanza it belongs to (0 for none) and its part and place there. */
interface Owned {
  readonly owner: number;
  /** `<stanza>:<line>` for a stanza's line, `R:<line>` for the refrain's. */
  readonly key: string;
}

/** The oracle's table: each sung line of `hymn`, in sung order, with the stanza it belongs to. */
const tableOf = (hymn: Hymn): ReadonlyArray<Owned> => {
  const stanza = (n: number): Array<Owned> =>
    (hymn.stanzas[n - 1]?.lines ?? []).map((_, line) => ({ owner: n, key: `${n}:${line}` }));
  const refrain = (owner: number): Array<Owned> =>
    (hymn.refrain?.part.lines ?? []).map((_, line) => ({ owner, key: `R:${line}` }));
  const numbers = hymn.stanzas.map((_, index) => index + 1);
  const order = hymn.refrain?.order;
  if (order === undefined) return numbers.flatMap(stanza);
  if (order === 'after-each') return numbers.flatMap((n) => [...stanza(n), ...refrain(n)]);
  if (order === 'first-and-after-each')
    return [...refrain(0), ...numbers.flatMap((n) => [...stanza(n), ...refrain(n)])];
  if (order === 'before-each') return numbers.flatMap((n) => [...refrain(n), ...stanza(n)]);
  if (order === 'first-and-last') return [...refrain(0), ...numbers.flatMap(stanza), ...refrain(0)];
  return [...numbers.flatMap(stanza), ...refrain(0)];
};

/** The keys of `sung` over `chosen`'s stanzas alone, each stanza named by its number in the whole hymn. */
const sungKeysOver = (hymn: Hymn, chosen: ReadonlyArray<number>): ReadonlyArray<string> => {
  const parts = chosen.flatMap((n) => Option.toArray(Option.fromUndefinedOr(hymn.stanzas[n - 1])));
  if (!Arr.isReadonlyArrayNonEmpty(parts)) return [];
  return sung({ ...hymn, stanzas: parts }).map((line) =>
    line.verse === 'refrain' ? `R:${line.line}` : `${chosen[line.verse - 1]}:${line.line}`,
  );
};

/** Every non-empty subset of 1..count, each ascending. */
const subsetsOf = (count: number): ReadonlyArray<ReadonlyArray<number>> => {
  const all: Array<Array<number>> = [];
  for (let mask = 1; mask < 2 ** count; mask++) {
    const subset: Array<number> = [];
    for (let n = 1; n <= count; n++) if ((mask & (2 ** (n - 1))) !== 0) subset.push(n);
    all.push(subset);
  }
  return all;
};

/** The oracle's kept flags: a line is kept when it belongs to none or to a chosen stanza. */
const keptByTable = (
  table: ReadonlyArray<Owned>,
  chosen: ReadonlyArray<number>,
): ReadonlyArray<boolean> =>
  table.map(({ owner }) => owner === 0 || chosen.length === 0 || chosen.includes(owner));

/** The oracle's cut: each line's start on the cut and the cut's end. */
const cutStartsOf = (timeline: Timeline, kept: ReadonlyArray<boolean>) => {
  const starts: Array<number> = [];
  let at = timeline.first;
  for (const [index, line] of timeline.lines.entries()) {
    starts.push(at);
    if (kept[index] === true) at += line.until - line.start;
  }
  const end = at;
  let next = end;
  for (let index = timeline.lines.length - 1; index >= 0; index--) {
    if (kept[index] === true) next = starts[index] ?? next;
    else starts[index] = next;
  }
  return { starts, end };
};

/** A hymn read once: its table, its sections, its timeline and where `placeAt` puts each kept syllable on it. */
interface Read {
  readonly number: number;
  readonly hymn: Hymn;
  readonly table: ReadonlyArray<Owned>;
  readonly timeline: Timeline;
  /** Per line, each syllable time whose place on the full timeline is that line, with that place. */
  readonly syllablePlaces: ReadonlyArray<
    ReadonlyArray<{ readonly at: number; readonly place: ReturnType<typeof placeAt> }>
  >;
}

const reads: ReadonlyArray<Read> = [...playback.values()].map((hymn) => {
  const timeline = timelineAt(hymn.number);
  return {
    number: hymn.number,
    hymn,
    table: tableOf(hymn),
    timeline,
    syllablePlaces: timeline.lines.map((line, index) =>
      line.syllables
        .map((at) => ({ at, place: placeAt(timeline, at) }))
        .filter(({ place }) => place.line === index),
    ),
  };
});

const sectionsAt = (number: number) =>
  Option.getOrThrow(Option.fromUndefinedOr(sectionsOf.get(number)));

/** One cut under check: the product's, and the oracle's starts and end beside it. */
interface Case {
  readonly read: Read;
  readonly kept: ReadonlyArray<boolean>;
  readonly label: string;
  readonly starts: ReadonlyArray<number>;
  readonly end: number;
  readonly cut: ReturnType<typeof Stanzas.cutOf>;
}

/** The cut's line count, first line, end and tempo. */
const outlineWrongs = ({ read, label, end, cut }: Case): Array<string> => {
  const { timeline } = read;
  const wrong: Array<string> = [];
  if (cut.timeline.lines.length !== timeline.lines.length)
    wrong.push(`${label}: ${cut.timeline.lines.length} lines, not ${timeline.lines.length}`);
  if (cut.timeline.first !== timeline.first) wrong.push(`${label}: first ${cut.timeline.first}`);
  if (cut.timeline.end !== end) wrong.push(`${label}: end ${cut.timeline.end}, not ${end}`);
  if (cut.timeline.tempo.microsPerQuarter !== timeline.tempo.microsPerQuarter)
    wrong.push(`${label}: tempo changed`);
  return wrong;
};

/** Kept line `index`: its start on the cut, its length, its syllables' offsets and its flags. */
const keptLineWrong = (line: TimedLine, got: TimedLine, start: number): boolean => {
  const shift = start - line.start;
  return (
    got.start !== start ||
    got.until !== start + (line.until - line.start) ||
    got.played !== line.played ||
    got.even !== line.even ||
    got.syllables.join() !== line.syllables.map((at) => at + shift).join() ||
    got.words.join() !== line.words.join()
  );
};

/** A skipped line: no length and no syllables, at the next kept start. */
const skippedLineWrong = (got: TimedLine, start: number): boolean =>
  got.start !== start || got.until !== start || got.syllables.length > 0 || got.words.length > 0;

/** Each line of the cut against the oracle's. */
const lineWrongs = ({ read, kept, label, starts, cut }: Case): Array<string> =>
  read.timeline.lines.flatMap((line, index) => {
    const got = cut.timeline.lines[index];
    const start = starts[index] ?? NaN;
    if (got === undefined) return [];
    const bad =
      kept[index] === true ? keptLineWrong(line, got, start) : skippedLineWrong(got, start);
    if (!bad) return [];
    return [`${label}: line ${index} at ${got.start}..${got.until}, not ${start}`];
  });

/** The lead before `first` and the tail past the end map as they are. */
const edgeWrongs = ({ read, label, end, cut }: Case): Array<string> => {
  const { timeline } = read;
  const wrong: Array<string> = [];
  for (const at of [0, timeline.first - 1].filter((t) => t >= 0 && t < timeline.first)) {
    if (cut.recordingAt(at) !== at) wrong.push(`${label}: recordingAt lead ${at}`);
    if (cut.sungAt(at) !== at) wrong.push(`${label}: sungAt lead ${at}`);
  }
  for (const past of [0, 1000]) {
    if (cut.recordingAt(end + past) !== timeline.end + past)
      wrong.push(`${label}: recordingAt tail +${past}`);
    if (cut.sungAt(timeline.end + past) !== end + past)
      wrong.push(`${label}: sungAt tail +${past}`);
  }
  return wrong;
};

/** A line's first, middle and last ms, as offsets from its start. */
const offsetsOf = (line: TimedLine): ReadonlyArray<number> => {
  const length = line.until - line.start;
  return [0, Math.floor(length / 2), length - 1];
};

/** Kept line `index`: both maps and their round trip at its first, middle and last ms. */
const keptMapWrongs = (c: Case, index: number, line: TimedLine, start: number): Array<string> =>
  offsetsOf(line).flatMap((offset) => {
    const sungTime = start + offset;
    const recording = line.start + offset;
    const wrong: Array<string> = [];
    if (c.cut.recordingAt(sungTime) !== recording)
      wrong.push(`${c.label}: recordingAt line ${index} +${offset}`);
    if (c.cut.sungAt(recording) !== sungTime)
      wrong.push(`${c.label}: sungAt line ${index} +${offset}`);
    if (c.cut.sungAt(c.cut.recordingAt(sungTime)) !== sungTime)
      wrong.push(`${c.label}: round trip line ${index} +${offset}`);
    return wrong;
  });

/** Kept line `index`: `placeAt` finds it at its first and last ms, and each syllable where the full timeline did. */
const keptPlaceWrongs = (c: Case, index: number, line: TimedLine, start: number): Array<string> => {
  const wrong: Array<string> = [];
  const atStart = placeAt(c.cut.timeline, start).line;
  const atLast = placeAt(c.cut.timeline, start + (line.until - line.start) - 1).line;
  if (atStart !== index || atLast !== index)
    wrong.push(`${c.label}: placeAt line ${index} gives ${atStart} and ${atLast}`);
  const shift = start - line.start;
  for (const { at, place } of c.read.syllablePlaces[index] ?? []) {
    const got = placeAt(c.cut.timeline, at + shift);
    if (
      got.line !== index ||
      got.syllable !== place.syllable ||
      got.word !== place.word ||
      got.nextAt !== place.nextAt + shift
    )
      wrong.push(`${c.label}: placeAt line ${index} syllable ${place.syllable}`);
  }
  return wrong;
};

/** Skipped line `index`: a recording time inside it is the next kept start, and `placeAt` there is no skipped line. */
const skippedMapWrongs = (
  c: Case,
  index: number,
  line: TimedLine,
  start: number,
): Array<string> => {
  const wrong = offsetsOf(line)
    .filter((offset) => c.cut.sungAt(line.start + offset) !== start)
    .map((offset) => `${c.label}: sungAt skipped line ${index} +${offset}`);
  const there = placeAt(c.cut.timeline, start).line;
  if (there !== -1 && c.kept[there] !== true)
    wrong.push(`${c.label}: placeAt gives skipped line ${there}`);
  return wrong;
};

/** Every line's times on both clocks and its place. */
const mapWrongs = (c: Case): Array<string> =>
  c.read.timeline.lines.flatMap((line, index) => {
    const start = c.starts[index] ?? NaN;
    if (c.kept[index] === true)
      return [...keptMapWrongs(c, index, line, start), ...keptPlaceWrongs(c, index, line, start)];
    return skippedMapWrongs(c, index, line, start);
  });

/** What is wrong with the product's cut of `read` keeping `kept`, as numbers only. */
const cutWrongs = (read: Read, kept: ReadonlyArray<boolean>, label: string): Array<string> => {
  const { starts, end } = cutStartsOf(read.timeline, kept);
  const c: Case = { read, kept, label, starts, end, cut: Stanzas.cutOf(read.timeline, kept) };
  const outline = outlineWrongs(c);
  if (outline.length > 0) return outline;
  return [...lineWrongs(c), ...edgeWrongs(c), ...mapWrongs(c)];
};

describe('the oracle', () => {
  it('lays every hymn’s lines as sung, and keeps over each subset what sung over its stanzas alone sings', () => {
    const wrong: Array<string> = [];
    let subsets = 0;
    for (const read of reads) {
      const full = sung(read.hymn).map((line) =>
        line.verse === 'refrain' ? `R:${line.line}` : `${line.verse}:${line.line}`,
      );
      if (full.join() !== read.table.map(({ key }) => key).join())
        wrong.push(`hymn ${read.number}: table`);
      if (full.length !== read.timeline.lines.length) wrong.push(`hymn ${read.number}: timeline`);
      for (const chosen of subsetsOf(read.hymn.stanzas.length)) {
        subsets += 1;
        const kept = keptByTable(read.table, chosen);
        const keys = read.table.filter((_, index) => kept[index] === true).map(({ key }) => key);
        if (keys.join() !== sungKeysOver(read.hymn, chosen).join())
          wrong.push(`hymn ${read.number} [${chosen.join(',')}]`);
      }
    }
    expect({ hymns: reads.length, subsets, wrong: wrong.slice(0, SHOWN) }).toEqual({
      hymns: 695,
      subsets: 9475,
      wrong: [],
    });
  });
});

describe('the lines a choice keeps', () => {
  it('are, for every hymn and every subset of its stanzas, the chosen stanzas’ lines and the refrains the order binds to them or to none', () => {
    const wrong: Array<string> = [];
    for (const read of reads) {
      const sections = sectionsAt(read.number);
      const count = read.hymn.stanzas.length;
      for (const chosen of subsetsOf(count)) {
        const expected = keptByTable(read.table, chosen).join();
        if (Stanzas.keptOf(sections, chosen).join() !== expected)
          wrong.push(`hymn ${read.number} [${chosen.join(',')}]`);
        if (Stanzas.keptOf(sections, [0, ...chosen, count + 1]).join() !== expected)
          wrong.push(`hymn ${read.number} [0,${chosen.join(',')},${count + 1}]`);
      }
    }
    expect(wrong.slice(0, SHOWN)).toEqual([]);
  });

  it('are every line for the empty choice, on every hymn', () => {
    const wrong = reads
      .filter((read) => {
        const kept = Stanzas.keptOf(sectionsAt(read.number), []);
        return kept.length !== read.timeline.lines.length || kept.some((one) => !one);
      })
      .map((read) => read.number);
    expect(wrong.slice(0, SHOWN)).toEqual([]);
  });

  it('are lines 0 to 7 and 16 to 23 of hymn 78 for stanzas 1 and 3 (four stanzas, the refrain after each)', () => {
    const kept = Stanzas.keptOf(sectionsAt(78), [1, 3]);
    const indices = kept.flatMap((one, index) => (one ? [index] : []));
    expect({ lines: kept.length, indices }).toEqual({
      lines: 32,
      indices: [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23],
    });
  });
});

describe('the cut timeline', () => {
  it('keeps the kept lines’ lengths and syllables back to back from the first line, and maps sung and recording time both ways, for every hymn and every subset', () => {
    const wrong: Array<string> = [];
    let cuts = 0;
    for (const read of reads)
      for (const chosen of subsetsOf(read.hymn.stanzas.length)) {
        cuts += 1;
        if (wrong.length >= SHOWN) continue;
        const kept = keptByTable(read.table, chosen);
        wrong.push(...cutWrongs(read, kept, `hymn ${read.number} [${chosen.join(',')}]`));
      }
    expect({ cuts, wrong: wrong.slice(0, SHOWN) }).toEqual({ cuts: 9475, wrong: [] });
  });

  it('is the timeline itself when every line is kept, on every hymn', () => {
    const wrong: Array<string> = [];
    for (const read of reads) {
      const { timeline } = read;
      const all = timeline.lines.map(() => true);
      wrong.push(...cutWrongs(read, all, `hymn ${read.number} all`));
      const cut = Stanzas.cutOf(timeline, all);
      const times = [0, timeline.first, ...timeline.lines.map((line) => line.start + 1)];
      for (const at of [...times, timeline.end, timeline.end + 1000])
        if (cut.recordingAt(at) !== at || cut.sungAt(at) !== at)
          wrong.push(`hymn ${read.number}: ${at}`);
    }
    expect(wrong.slice(0, SHOWN)).toEqual([]);
  });

  it('ends hymn 78 at 59031 ms for stanzas 1 and 3, and plays stanza 3 from where the recording sings it', () => {
    const timeline = timelineAt(78);
    const cut = Stanzas.cutOf(timeline, Stanzas.keptOf(sectionsAt(78), [1, 3]));
    const stanza3 = cut.timeline.lines[16]?.start ?? NaN;
    expect({
      end: cut.timeline.end,
      fullEnd: timeline.end,
      stanza3: cut.recordingAt(stanza3),
      skipped: cut.timeline.lines[8]?.until === stanza3,
    }).toEqual({
      end: 59031,
      fullEnd: 110636,
      stanza3: timeline.lines[16]?.start ?? NaN,
      skipped: true,
    });
  });
});

/** The oracle's toggle over a stored choice of `count` stanzas. */
const toggled = (
  choice: ReadonlyArray<number>,
  stanza: number,
  count: number,
): ReadonlyArray<number> => {
  const all = Array.from({ length: count }, (_, index) => index + 1);
  const chosen = choice.length === 0 ? all : choice;
  if (chosen.includes(stanza)) {
    if (chosen.length === 1) return choice;
    return chosen.filter((n) => n !== stanza);
  }
  const next = [...chosen, stanza].toSorted((a, b) => a - b);
  return next.length === count ? [] : next;
};

describe('a tap on a stanza', () => {
  it('turns it off or on, never the last chosen one off, and stores every stanza as [], for every stored choice of 2 to 7 stanzas', () => {
    const wrong: Array<string> = [];
    let checked = 0;
    for (let count = 2; count <= 7; count++) {
      const stored = [[], ...subsetsOf(count).filter((subset) => subset.length < count)];
      for (const choice of stored)
        for (let stanza = 1; stanza <= count; stanza++) {
          checked += 1;
          const got = Stanzas.toggle(choice, stanza, count);
          const expected = toggled(choice, stanza, count);
          if (got.join() !== expected.join())
            wrong.push(`${count} [${choice.join(',')}] tap ${stanza}: [${got.join(',')}]`);
        }
    }
    expect({ checked, wrong: wrong.slice(0, SHOWN) }).toEqual({ checked: 1509, wrong: [] });
  });

  it('turns stanza 2 off from all, then 4, then keeps 3 when 1 and 3 are turned off in turn', () => {
    const steps: Array<ReadonlyArray<number>> = [];
    let choice: ReadonlyArray<number> = [];
    for (const stanza of [2, 4, 1, 3, 1, 2, 4]) {
      choice = Stanzas.toggle(choice, stanza, 4);
      steps.push(choice);
    }
    expect(steps).toEqual([[1, 3, 4], [1, 3], [3], [3], [1, 3], [1, 2, 3], []]);
  });
});
