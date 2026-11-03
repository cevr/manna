import { describe, expect, it } from 'bun:test';

import { sung } from '@manna/hymnal/hymn';
import { Array as Arr, Option } from 'effect';
import bundled from 'virtual:hymnal-timing';

import { readPlaybackHymns } from '../../vite/chords';
import { type Timeline, placeAt, timingBook } from './timeline';

const PASS_MS = 15_945.102;

const passStart = (k: number) => Math.round(k * PASS_MS);

const firsts = Option.match(
  Arr.findFirst(readPlaybackHymns(), (hymn) => hymn.number === 663),
  {
    onNone: () => [],
    onSome: (hymn) => {
      const lines = sung(hymn);
      return Arr.range(1, 6).map((k) => lines.findIndex((line) => line.verse === k));
    },
  },
);

const timelineOf663 = (): Timeline => Option.getOrThrow(timingBook(bundled).of(663));

const passFaults = (timeline: Timeline): ReadonlyArray<string> => [
  ...['line count'].filter(() => timeline.lines.length !== 7),
  ...timeline.lines.flatMap((line, i) => [`line ${i} unplayed`].filter(() => !line.played)),
  ...firsts.flatMap((first, k) =>
    Option.match(Arr.get(timeline.lines, first), {
      onNone: () => [`stanza ${k + 1}: no line ${first}`],
      onSome: (line) =>
        [`stanza ${k + 1} starts at ${line.start}`].filter(
          () => Math.abs(line.start - passStart(k)) > 1,
        ),
    }),
  ),
  ...[`end ${timeline.end}`].filter(() => Math.abs(timeline.end - passStart(6)) > 2),
];

const stanzaOf = (line: number) => firsts.findLastIndex((first) => first <= line);

const placeFaults = (timeline: Timeline): ReadonlyArray<string> =>
  Arr.range(0, 5).flatMap((k) => {
    const start = passStart(k);
    const next = passStart(k + 1);
    const times = [start + 1, Math.round((start + next) / 2), next - 2];
    return times.flatMap((ms) => {
      const { line } = placeAt(timeline, ms);
      return [`at ${ms}: line ${line}, not stanza ${k + 1}`].filter(
        () => line < 0 || stanzaOf(line) !== k,
      );
    });
  });

describe("hymn 663's follow", () => {
  it('has six stanzas, the first of two lines', () => {
    expect(firsts).toEqual([0, 2, 3, 4, 5, 6]);
  });

  it('lights all seven lines, each stanza from its pass start, to the sixth pass end', () => {
    expect(passFaults(timelineOf663())).toEqual([]);
  });

  it("places each pass's start, middle and end on that pass's stanza", () => {
    expect(placeFaults(timelineOf663())).toEqual([]);
  });
});
