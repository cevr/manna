import { describe, expect, it } from 'bun:test';
import { Array as Arr, Effect, Option } from 'effect';

import { type Timeline, timelineOf } from '../src/follow/timeline.ts';
import { readPlaybackHymns } from '../vite/chords.ts';
import { encodeTiming, versesOf } from '../vite/timing.ts';
import { countInMsOf, sungOf } from './follow';

const full = Arr.findFirst(readPlaybackHymns(), (hymn) => hymn.number === 78).pipe(
  Option.flatMap((hymn) => encodeTiming(hymn, () => versesOf(hymn))),
  Option.flatMap(timelineOf),
  Option.getOrThrow,
);

describe('the count-in', () => {
  it('is one bar of the first tempo at 100 %, and nothing without one', () => {
    expect(countInMsOf(full, true)).toBe(3000);
    expect(countInMsOf(full, false)).toBe(0);
  });
});

describe('the stanzas flag', () => {
  const lengths = (timeline: Timeline) => timeline.lines.map((line) => line.until - line.start);

  it('judges a run against the timeline cut to the stanzas the list names', () => {
    const cut = Effect.runSync(sungOf(78, full, '1,3'));
    expect(cut.end).toBe(59031);
    expect(cut.lines).toHaveLength(full.lines.length);
    const empty = lengths(cut)
      .map((length, index) => ({ length, index }))
      .filter((it) => it.length === 0)
      .map((it) => it.index);
    expect(empty).toEqual([...Arr.range(8, 15), ...Arr.range(24, 31)]);
  });

  it('judges a run with no list against the whole timeline', () => {
    const whole = Effect.runSync(sungOf(78, full, ''));
    expect(whole).toBe(full);
    expect(whole.end).toBe(110636);
  });

  it('refuses a timeline whose lines are not the words’ lines', () => {
    const short = { ...full, lines: full.lines.slice(1) };
    const failed = Effect.runSync(Effect.flip(sungOf(78, short, '1,3')));
    expect(failed.reason).toContain('lines');
  });
});
