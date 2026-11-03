import { Array as Arr, Order, Schema } from 'effect';

import type { TimedLine, Timeline } from '../follow/timeline';
import type { Section } from '../hymns/text';

const ascending = (numbers: ReadonlyArray<number>) =>
  Arr.zip(numbers, numbers.slice(1)).every(([before, after]) => before < after) ||
  'stanza numbers in ascending order, each once';

export const Choice = Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))).check(
  Schema.makeFilter(ascending),
);
export type Choice = typeof Choice.Type;

export const ALL: Choice = [];

const ownerOf = (section: Section): number => {
  if (section.kind === 'stanza') return section.n;
  return section.stanza;
};

export const countOf = (sections: ReadonlyArray<Section>): number =>
  sections.filter((section) => section.kind === 'stanza').length;

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

export interface Skip {
  readonly from: number;
  readonly to: number;
}

export interface Cut {
  readonly timeline: Timeline;
  readonly recordingAt: (sung: number) => number;
  readonly sungAt: (recording: number) => number;
  readonly skips: ReadonlyArray<Skip>;
}

const same = (ms: number) => ms;

export const whole = (timeline: Timeline): Cut => ({
  timeline,
  recordingAt: same,
  sungAt: same,
  skips: [],
});

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

export const cutOf = (timeline: Timeline, kept: ReadonlyArray<boolean>): Cut => {
  if (kept.length !== timeline.lines.length) return whole(timeline);
  if (kept.every((flag) => flag)) return whole(timeline);
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
  const skips = timeline.lines.flatMap((line, index) => {
    if (kept[index] === true || (index > 0 && kept[index - 1] !== true)) return [];
    return [{ from: line.start, to: recordingAt(Arr.getUnsafe(lines, index).start) }];
  });
  return { timeline: { ...timeline, lines, end }, recordingAt, sungAt, skips };
};

const stored = (chosen: ReadonlyArray<number>, count: number): Choice => {
  if (chosen.length === count) return ALL;
  return chosen;
};

export const toggle = (choice: Choice, stanza: number, count: number): Choice => {
  if (stanza < 1 || stanza > count) return choice;
  const chosen = chosenOf(choice, count);
  if (!chosen.includes(stanza)) return stored(Arr.sort([...chosen, stanza], Order.Number), count);
  if (chosen.length === 1) return stored(chosen, count);
  return stored(
    chosen.filter((n) => n !== stanza),
    count,
  );
};

export const chosenOf = (choice: Choice, count: number): ReadonlyArray<number> => {
  const chosen = choice.filter((n) => n >= 1 && n <= count);
  if (chosen.length === 0) return Arr.range(1, count);
  return chosen;
};
