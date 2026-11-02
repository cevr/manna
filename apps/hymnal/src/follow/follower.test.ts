import { describe, expect, it } from 'bun:test';
import { type Hymn, PER_BEAT, sung } from '@manna/hymnal/hymn';
import { Array as Arr, Option } from 'effect';
import bundled from 'virtual:hymnal-timing';

import { readPlaybackHymns } from '../../vite/chords';
import { encodeTiming } from '../../vite/timing';

import { followerOf, type Host, LEAD, type Report } from './follower';
import { OFF, WHOLE } from './marks';
import { placeAt, type TimedLine, type Timeline, timelineOf, timingBook } from './timeline';

const line = (start: number, syllables: ReadonlyArray<number>): TimedLine => ({
  start,
  until: start + 1000,
  played: true,
  even: false,
  syllables,
  words: syllables.map((_, k) => k),
});

/** Three lines a second each from 1 s: two words, then a line with no note times, then two words. */
const three: Timeline = {
  lines: [line(1000, [1000, 1500]), line(2000, []), line(3000, [3000, 3400])],
  first: 1000,
  end: 4000,
};

/** A follower over `timeline` on a hand-moved clock: what it scrolled to and logged. */
const harness = (timeline: Timeline = three) => {
  let now = 0;
  let timers: Array<{ at: number; run: () => void }> = [];
  const scrolled: Array<number> = [];
  const logged: Array<string> = [];
  const host: Host = {
    now: () => now,
    wake: (ms, run) => {
      const timer = { at: now + ms, run };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
    scrollTo: (to) => scrolled.push(to),
    log: (event) => logged.push(event),
  };
  const follower = followerOf(timeline, host);
  /** Moves the clock to `to`, running each timer due on the way. */
  const advance = (to: number) => {
    for (;;) {
      const due = timers.filter((t) => t.at <= to).toSorted((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = due.at;
      due.run();
    }
    now = to;
  };
  const marks = () => timeline.lines.map((_, k) => follower.marks.markOf(k));
  const report = (told: Report) => follower.report(told);
  return { advance, marks, report, scrolled, logged, follower };
};

const playing = (at: number): Report => ({ _tag: 'Here', at, state: 'playing' });

describe('followerOf', () => {
  it('distinguishes a timed rest from an untimed whole line', () => {
    const h = harness({
      lines: [line(1000, [1300]), line(2000, [])],
      first: 1000,
      end: 3000,
    });
    h.report(playing(1000));
    expect(h.marks()).toEqual([-1, OFF]);
    h.advance(299);
    expect(h.marks()).toEqual([-1, OFF]);
    h.advance(300);
    expect(h.marks()).toEqual([0, OFF]);
    h.advance(1000);
    expect(h.marks()).toEqual([OFF, WHOLE]);
  });

  it('marks nothing before the first sung line, then each line and syllable as it is sung', () => {
    const h = harness();
    h.report(playing(0));
    expect(h.marks()).toEqual([OFF, OFF, OFF]);
    h.advance(1000);
    expect(h.marks()).toEqual([0, OFF, OFF]);
    h.advance(1600);
    expect(h.marks()).toEqual([1, OFF, OFF]);
    h.advance(2100);
    expect(h.marks()).toEqual([OFF, WHOLE, OFF]);
    h.advance(3500);
    expect(h.marks()).toEqual([OFF, OFF, 1]);
    h.advance(4100);
    expect(h.marks()).toEqual([OFF, OFF, OFF]);
  });

  it('marks the sung syllable, not its word, and a line with no syllable times whole (F1b)', () => {
    // Line 0: syllables at 1000 and 1500 in one word, 2000 in the next; line 1 even, marked whole.
    const small = Option.getOrThrow(timelineOf('1,1000,2000,0.500,500;3,2000,1000'));
    const h = harness(small);
    const at = (ms: number) => {
      h.advance(ms);
      return h.marks();
    };
    h.report(playing(0));
    expect(at(999)).toEqual([OFF, OFF]);
    expect(at(1000)).toEqual([0, OFF]);
    expect(at(1499)).toEqual([0, OFF]);
    expect(at(1500)).toEqual([1, OFF]);
    expect(at(2000)).toEqual([2, OFF]);
    expect(at(3000)).toEqual([OFF, WHOLE]);
    expect(at(4000)).toEqual([OFF, OFF]);
  });

  it('scrolls to each line LEAD ms before it is sung, once each', () => {
    const h = harness();
    h.report(playing(0));
    h.advance(1000 - LEAD - 1);
    expect(h.scrolled).toEqual([]);
    h.advance(1000 - LEAD);
    expect(h.scrolled).toEqual([0]);
    h.advance(3000 - LEAD);
    expect(h.scrolled).toEqual([0, 1, 2]);
    h.advance(5000);
    expect(h.scrolled).toEqual([0, 1, 2]);
  });

  it('holds the marks and never scrolls while paused', () => {
    const h = harness();
    h.report({ _tag: 'Here', at: 1600, state: 'paused' });
    expect(h.marks()).toEqual([1, OFF, OFF]);
    h.advance(10_000);
    expect(h.marks()).toEqual([1, OFF, OFF]);
    expect(h.scrolled).toEqual([]);
  });

  it('runs on between reports and is not moved back by a report a little behind', () => {
    const h = harness();
    h.report(playing(1000));
    h.advance(600);
    h.report(playing(1450));
    expect(h.marks()).toEqual([1, OFF, OFF]);
  });

  it('moves the marks at once on a seek and scrolls to the line sung there', () => {
    const h = harness();
    h.report(playing(1000));
    h.advance(1100);
    h.report(playing(3100));
    expect(h.marks()).toEqual([OFF, OFF, 0]);
    expect(h.scrolled.at(-1)).toBe(2);
  });

  it('holds the scroll on a drag but keeps the marks moving; the pill scrolls to the line sung now', () => {
    const h = harness();
    h.report(playing(1000));
    h.follower.drag();
    expect(h.follower.held.get()).toBe(true);
    expect(h.logged.at(-1)).toBe('pause reason=drag');
    const before = h.scrolled.length;
    // The player reported 1000 ms at host time 0, so host time 2500 is 3500 ms into the hymn.
    h.advance(2500);
    expect(h.marks()).toEqual([OFF, OFF, 1]);
    expect(h.scrolled.length).toBe(before);
    h.follower.resume();
    expect(h.follower.held.get()).toBe(false);
    expect(h.logged.at(-1)).toBe('resume reason=pill');
    expect(h.scrolled.at(-1)).toBe(2);
  });

  it('ends a hand pause on a seek and scrolls to the line sung there', () => {
    const h = harness();
    h.report(playing(3000));
    h.follower.drag();
    h.advance(100);
    h.report(playing(1100));
    expect(h.follower.held.get()).toBe(false);
    expect(h.logged).toContain('resume reason=seek');
    expect(h.scrolled.at(-1)).toBe(0);
  });

  it('ends a hand pause on a seek however small, and scrolls back to the line sung there', () => {
    const h = harness();
    h.report(playing(1000));
    // Host time 1000 is 2000 ms into the hymn: line 1 is sung and shown.
    h.advance(1000);
    expect(h.scrolled.at(-1)).toBe(1);
    h.follower.drag();
    const before = h.scrolled.length;
    // A seek 100 ms on lies inside the clock's slack: only the seek itself tells the follow.
    h.follower.seek();
    h.report(playing(2100));
    expect(h.follower.held.get()).toBe(false);
    expect(h.logged.at(-1)).toBe('resume reason=seek');
    expect(h.scrolled.slice(before)).toEqual([1]);
  });

  it('drops a hand pause when the player pauses or leaves, and a drag while paused holds nothing', () => {
    const h = harness();
    let told = 0;
    h.follower.held.subscribe(() => (told += 1));
    h.report(playing(1000));
    h.follower.drag();
    h.report({ _tag: 'Here', at: 1000, state: 'paused' });
    expect(h.follower.held.get()).toBe(false);
    h.follower.drag();
    expect(h.follower.held.get()).toBe(false);
    h.report(playing(1000));
    h.follower.drag();
    h.report({ _tag: 'Away' });
    expect(h.follower.held.get()).toBe(false);
    expect(told).toBe(4);
    expect(h.logged.filter((event) => event.startsWith('resume'))).toEqual([]);
  });

  it('clears the marks and logs the end when the player leaves the hymn', () => {
    const h = harness();
    h.report(playing(1000));
    h.report({ _tag: 'Away' });
    expect(h.marks()).toEqual([OFF, OFF, OFF]);
    expect(h.logged.at(-1)).toBe('end');
    expect(h.logged[0]).toBe('line i=0 of=3 at=1000');
  });
});

describe('followerOf at a tempo, Sound off (unit tempo, A3)', () => {
  /** One poll of the player, ms of the host's clock. */
  const POLL = 250;
  const hymn = Option.getOrThrow(timingBook(bundled).of(100));

  // 0.8 is the spec's case; 1.2 holds the wake: a follower that waits the hymn's ms as the
  // host's lights each line late above 100 %.
  it.each([0.8, 1.2])(
    'lights the line sung at first + %p t over the whole of hymn 100, and never steps back',
    (rate) => {
      const h = harness(hymn);
      const lit = () => {
        const line = h.follower.marks.line();
        return { line, syllable: h.follower.marks.markOf(line) };
      };
      const expected = (t: number) => placeAt(hymn, hymn.first + rate * t).line;
      let last = { line: -1, syllable: -1 };
      /** The lit line at host time `t` is the one the hymn's place puts there, and no earlier one. */
      const check = (t: number) => {
        const now = lit();
        expect({ t, line: now.line }).toEqual({ t, line: expected(t) });
        if (now.line < 0) return;
        const back =
          now.line < last.line || (now.line === last.line && now.syllable < last.syllable);
        expect({ t, back }).toEqual({ t, back: false });
        last = now;
      };
      const length = (hymn.end - hymn.first) / rate;
      for (let t = 0; t < length; t += POLL) {
        h.advance(t);
        if (t > 0) check(t);
        h.report({ _tag: 'Here', at: hymn.first + rate * t, state: 'playing', rate });
        check(t);
        h.advance(t + POLL / 2);
        check(t + POLL / 2);
      }
    },
  );
});

describe('the bundled timing of a hand-made hymn 11, through the follower', () => {
  // Hymn 11's stanzas are line level; its line 1 (stanza 1, line index 1) has note times.
  const hymn = Option.getOrThrow(Arr.findFirst(readPlaybackHymns(), (one) => one.number === 11));
  const timing = Option.getOrThrow(Option.fromUndefinedOr(hymn.timing));
  const line1 = Option.getOrThrow(Arr.get(timing.lines, 1));
  /** Hymn 11 with line 1's syllable times replaced. */
  const withLine1 = (syllables: ReadonlyArray<number>): Hymn => ({
    ...hymn,
    timing: {
      ...timing,
      lines: Option.getOrThrow(Arr.modify(timing.lines, 1, (line) => ({ ...line, syllables }))),
    },
  });
  const timelineFor = (one: Hymn): Timeline =>
    Option.getOrThrow(timelineOf(Option.getOrThrow(encodeTiming(one))));
  const base = timelineFor(hymn);
  /** Line 1's mark with the player paused at `at` ms. */
  const markAt = (timeline: Timeline, at: number) => {
    const h = harness(timeline);
    h.report({ _tag: 'Here', at, state: 'paused' });
    return h.follower.marks.markOf(1);
  };

  it('lights a line-level part’s line by its note times', () => {
    expect(sung(hymn)[1]?.part).toMatchObject({ _tag: 'Sung', level: 'line' });
    const line = Option.getOrThrow(Arr.get(base.lines, 1));
    expect(line.syllables.length).toBe(line1.syllables.length);
    expect(markAt(base, line.syllables[1] ?? 0)).toBe(1);
  });

  it('marks a line whole when its times are out of order, outside the line or short a syllable', () => {
    const [first = 0, ...rest] = line1.syllables;
    const broken = {
      'out of order': line1.syllables.toReversed(),
      'before the line': [line1.start - PER_BEAT, ...rest],
      'at its until': [...line1.syllables.slice(0, -1), line1.until],
      'short a syllable': rest,
      'a syllable over': [first, ...line1.syllables],
    };
    const lines = Option.getOrThrow(
      Arr.modify(base.lines, 1, (line) => ({ ...line, syllables: [], words: [] })),
    );
    const start = base.lines[1]?.start ?? 0;
    for (const [name, syllables] of Object.entries(broken)) {
      const timeline = timelineFor(withLine1(syllables));
      // Only that line changes, to whole: its span and flags and every other line stay as bundled.
      expect({ name, lines: timeline.lines }).toEqual({ name, lines });
      expect({ name, mark: markAt(timeline, start) }).toEqual({ name, mark: WHOLE });
    }
  });

  it('carries two syllables on one note as one start, and lights the later of them', () => {
    const [a = 0, , ...rest] = line1.syllables;
    const timeline = timelineFor(withLine1([a, a, ...rest]));
    const line = Option.getOrThrow(Arr.get(timeline.lines, 1));
    const [s0 = 0, s1 = 0, s2 = 0] = line.syllables;
    expect(line.syllables.length).toBe(line1.syllables.length);
    expect(s1).toBe(s0);
    expect(s2).toBeGreaterThan(s1);
    expect(placeAt(timeline, s0)).toMatchObject({ line: 1, syllable: 1, nextAt: s2 });
    expect(markAt(timeline, s0)).toBe(1);
  });
});
