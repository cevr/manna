/**
 * The stanzas a reader chooses to sing, and the hymn as Play then sings it.
 * Pure: no clock, no React.
 *
 * - `Choice`: the chosen stanza numbers, ascending, each once; `[]` is all
 *   of them, as a hymn plays until a choice is made.
 * - `keptOf`: which sung lines a choice keeps. A stanza's lines go with its
 *   number; a refrain's with the stanza its section names (`text.ts`), and a
 *   refrain that names 0 is the hymn's own, kept with any choice. A number
 *   outside the hymn's stanzas chooses nothing.
 * - `cutOf`: the timeline with the lines a choice skips taken out of its
 *   time, and the two maps between the cut's time (sung time, what the
 *   player and the follow read) and the recording's. The lead before the
 *   first sung line and the tail past the end are kept as they are; the kept
 *   lines run on one after another from the first, each as long as it was,
 *   its syllables where they were in it; a skipped line has no length and no
 *   syllables and sits at the next kept line's start, so `placeAt` never
 *   lands on it. Its `skips` are the recording's spans a sounding player
 *   seeks across (`sound.ts`).
 * - `toggle`: a tap on a stanza's chip; `countOf`, how many chips a hymn has.
 */

import { Array as Arr, Order, Schema } from 'effect';

import type { TimedLine, Timeline } from '~/follow/timeline';
import type { Section } from '~/hymns/text';

const ascending = (numbers: ReadonlyArray<number>) =>
  Arr.zip(numbers, numbers.slice(1)).every(([before, after]) => before < after) ||
  'stanza numbers in ascending order, each once';

/** A stored choice of stanzas: their numbers, ascending, each once; `[]` is every stanza. */
export const Choice = Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))).check(
  Schema.makeFilter(ascending),
);
export type Choice = typeof Choice.Type;

/** Every stanza: the choice a hymn plays until one is made. */
export const ALL: Choice = [];

/** The stanza a section's lines go with: its own number, or the one its refrain names (0 for the hymn's own). */
const ownerOf = (section: Section): number => {
  if (section.kind === 'stanza') return section.n;
  return section.stanza;
};

/** How many stanzas `sections` hold: the chips a hymn's choice is made from. */
export const countOf = (sections: ReadonlyArray<Section>): number =>
  sections.filter((section) => section.kind === 'stanza').length;

/** Whether each sung line of `sections`, in order, is sung under `choice`. */
export const keptOf = (
  sections: ReadonlyArray<Section>,
  choice: Choice,
): ReadonlyArray<boolean> => {
  const count = countOf(sections);
  const chosen = new Set(choice.filter((n) => n >= 1 && n <= count));
  return sections.flatMap((section) => {
    const owner = ownerOf(section);
    const kept = chosen.size === 0 || owner === 0 || chosen.has(owner);
    return section.lines.map(() => kept);
  });
};

/** A span of the recording a cut does not sing, from `from` up to `to`, in recording ms. */
export interface Skip {
  readonly from: number;
  readonly to: number;
}

/** A timeline cut to a choice, and its maps between sung (cut) time and recording time, in ms. */
export interface Cut {
  readonly timeline: Timeline;
  /** The recording's time of a sung time: inside a kept line, the same place in it in the recording. */
  readonly recordingAt: (sung: number) => number;
  /** The sung time of a recording time: inside a skipped line, the next kept line's start. */
  readonly sungAt: (recording: number) => number;
  /**
   * The recording's spans the cut skips, in order: each run of skipped lines, from its first
   * line's start to the next kept line's start, or to the timeline's end, where the tail starts.
   */
  readonly skips: ReadonlyArray<Skip>;
}

const same = (ms: number) => ms;

/** The cut that keeps every line: the timeline itself. */
export const whole = (timeline: Timeline): Cut => ({
  timeline,
  recordingAt: same,
  sungAt: same,
  skips: [],
});

/** Each line's start on the cut: kept lines one after another from `first`, a skipped line at the next kept start. */
const startsOf = (timeline: Timeline, kept: ReadonlyArray<boolean>) => {
  const starts: Array<number> = [];
  let at = timeline.first;
  for (const [index, line] of timeline.lines.entries()) {
    starts.push(at);
    if (kept[index] === true) at += line.until - line.start;
  }
  const end = at;
  let next = end;
  for (let index = starts.length - 1; index >= 0; index--) {
    if (kept[index] === true) next = Arr.getUnsafe(starts, index);
    else starts[index] = next;
  }
  return { starts, end };
};

/** Line `line` moved to start at `start`: kept, as long as it was; skipped, no length and no syllables. */
const laidAt = (line: TimedLine, start: number, kept: boolean): TimedLine => {
  if (!kept) return { ...line, start, until: start, syllables: [], words: [] };
  const shift = start - line.start;
  return {
    ...line,
    start,
    until: line.until + shift,
    syllables: line.syllables.map((at) => at + shift),
  };
};

/** `timeline` with only the lines `kept` marks sung; `kept` holds one flag per line. */
export const cutOf = (timeline: Timeline, kept: ReadonlyArray<boolean>): Cut => {
  if (timeline.lines.every((_, index) => kept[index] === true)) return whole(timeline);
  const { starts, end } = startsOf(timeline, kept);
  const lines = timeline.lines.map((line, index) =>
    laidAt(line, Arr.getUnsafe(starts, index), kept[index] === true),
  );
  const recordingAt = (sung: number): number => {
    if (sung < timeline.first) return sung;
    if (sung >= end) return timeline.end + (sung - end);
    const index = lines.findIndex(
      (line, at) => kept[at] === true && line.start <= sung && sung < line.until,
    );
    if (index < 0) return timeline.end;
    return Arr.getUnsafe(timeline.lines, index).start + (sung - Arr.getUnsafe(lines, index).start);
  };
  const sungAt = (recording: number): number => {
    if (recording < timeline.first) return recording;
    if (recording >= timeline.end) return end + (recording - timeline.end);
    const index = timeline.lines.findIndex(
      (line) => line.start <= recording && recording < line.until,
    );
    if (index < 0) return end;
    const start = Arr.getUnsafe(lines, index).start;
    if (kept[index] !== true) return start;
    return start + (recording - Arr.getUnsafe(timeline.lines, index).start);
  };
  // A skipped line lies at the next kept start, whose recording time ends the run it begins.
  const skips = timeline.lines.flatMap((line, index) => {
    if (kept[index] === true || (index > 0 && kept[index - 1] !== true)) return [];
    return [{ from: line.start, to: recordingAt(Arr.getUnsafe(lines, index).start) }];
  });
  return { timeline: { ...timeline, lines, end }, recordingAt, sungAt, skips };
};

/** A choice as stored: every stanza of `count` chosen is `[]`. */
const stored = (chosen: ReadonlyArray<number>, count: number): Choice => {
  if (chosen.length === count) return ALL;
  return chosen;
};

/**
 * `choice` after a tap on stanza `stanza` of a hymn of `count` stanzas: a
 * chosen stanza goes, an unchosen one comes. From all (`[]`), the tapped
 * stanza goes. The last chosen stanza stays: a choice is never empty.
 */
export const toggle = (choice: Choice, stanza: number, count: number): Choice => {
  if (stanza < 1 || stanza > count) return choice;
  const chosen = chosenOf(choice, count);
  if (!chosen.includes(stanza)) return stored(Arr.sort([...chosen, stanza], Order.Number), count);
  if (chosen.length === 1) return choice;
  return stored(
    chosen.filter((n) => n !== stanza),
    count,
  );
};

/** The stanzas `choice` sings of a hymn of `count`: each of them for `[]`. */
export const chosenOf = (choice: Choice, count: number): ReadonlyArray<number> => {
  if (choice.length === 0) return Arr.range(1, count);
  return choice;
};
