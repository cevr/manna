import { sung } from '@manna/hymnal/hymn';
import * as Timing from '@manna/hymnal/timing';
import { Array as Arr, Clock, Effect, Match, Option, Stream, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { TestClock } from 'effect/testing';

import { readPlaybackHymns } from '../../vite/chords';
import { type Verses, versesOf } from '../../vite/timing';
import type { PlaybackApi, Status } from '../player/player';
import { scoreClock } from '../player/sound';
import { audioUrl } from '../remote';

import { book } from './book';
import { followerOf, type Host } from './follower';
import { OFF, WHOLE } from './marks';

const POLL = 250;

const hymns = readPlaybackHymns();

interface Laid {
  readonly start: number;
  readonly until: number;
  readonly times: Option.Option<ReadonlyArray<number>>;
}

interface OnNotes {
  readonly tune: string;
  readonly notes: ReadonlyArray<number>;
}

const onNotes = (verses: Verses, times: ReadonlyArray<number>): Option.Option<OnNotes> =>
  Option.flatMap(
    Arr.findFirst(verses, (verse) => Arr.some(verse, (note) => note.at === times[0])),
    (verse) =>
      Option.map(
        Option.all(times.map((time) => Arr.findFirstIndex(verse, (note) => note.at === time))),
        (notes) => ({
          tune: verse.map((note) => `${note.at - (verse[0]?.at ?? 0)}:${note.key}`).join(' '),
          notes,
        }),
      ),
  );

const laidOf = (number: number): ReadonlyArray<Laid> => {
  const hymn = Option.getOrThrow(Arr.findFirst(hymns, (one) => one.number === number));
  const timing = Option.getOrThrow(Option.fromUndefinedOr(hymn.timing));
  const seconds = Timing.secondsAt(timing);
  const ms = (time: number) => Math.round(seconds(time) * 1000);
  const parts = sung(hymn);
  const fit = timing.lines.map((line, i) =>
    Option.flatMap(Arr.get(parts, i), (at) =>
      Match.value(at.part).pipe(
        Match.tag('Sung', (part) => {
          const times = line.syllables.map(ms);
          const ok =
            line.played &&
            !line.even &&
            times.length > 0 &&
            times.length === (part.lines[at.line]?.length ?? 0) &&
            times.every(
              (time, k) => time >= (times[k - 1] ?? ms(line.start)) && time < ms(line.until),
            );
          return Option.liftPredicate(
            {
              place: `${at.verse === 'refrain'}/${at.line}`,
              refrain: at.verse === 'refrain',
              sure: part.level === 'syllable',
              ticks: line.syllables,
            },
            () => ok,
          );
        }),
        Match.orElse(() => Option.none()),
      ),
    ),
  );
  const loose = fit.some((one) => Option.exists(one, (line) => !line.sure));
  const verses = Match.value(loose).pipe(
    Match.when(true, () => versesOf(hymn)),
    Match.orElse(() => []),
  );
  const placed = fit.map((one) =>
    Option.map(one, (line) => ({ ...line, on: onNotes(verses, line.ticks) })),
  );
  const agrees = (i: number) =>
    Option.exists(Arr.get(placed, i).pipe(Option.flatten), (line) =>
      Option.exists(line.on, (own) =>
        placed.every((other, k) =>
          Option.match(other, {
            onNone: () => true,
            onSome: (them) =>
              k === i ||
              them.place !== line.place ||
              Option.exists(
                them.on,
                (on) =>
                  on.tune !== own.tune ||
                  Match.value(line.refrain).pipe(
                    Match.when(true, () => on.notes.join() === own.notes.join()),
                    Match.orElse(() => Math.abs((on.notes[0] ?? 0) - (own.notes[0] ?? 0)) <= 1),
                  ),
              ),
          }),
        ),
      ),
    );
  return timing.lines.map((line, i) => ({
    start: ms(line.start),
    until: ms(line.until),
    times: Option.liftPredicate(line.syllables.map(ms), () =>
      Option.exists(Arr.get(fit, i).pipe(Option.flatten), (one) => one.sure || agrees(i)),
    ),
  }));
};

const lineAt = (laid: ReadonlyArray<Laid>, t: number): number => {
  const k = Arr.findLastIndex(laid, (line) => line.start <= t);
  return Option.match(k, {
    onNone: () => -1,
    onSome: (i) =>
      Match.value(t < (laid[i]?.until ?? 0)).pipe(
        Match.when(true, () => i),
        Match.orElse(() => -1),
      ),
  });
};

const markAt = (laid: ReadonlyArray<Laid>, i: number, t: number): number => {
  if (lineAt(laid, t) !== i) return OFF;
  return Option.match(
    Option.flatMap(Arr.get(laid, i), (line) => line.times),
    {
      onNone: () => WHOLE,
      onSome: (times) =>
        Option.getOrElse(
          Arr.findLastIndex(times, (time) => time <= t),
          () => -1,
        ),
    },
  );
};

const followed = (number: number) => {
  const timeline = Option.getOrThrow(book.of(number));
  let now = 0;
  const host: Host = {
    now: () => now,
    wake: () => () => {},
    scrollTo: () => {},
    log: () => {},
  };
  const follower = followerOf(timeline, host);
  return {
    lines: timeline.lines.length,
    tell: (when: number, at: number, state: 'playing' | 'paused') => {
      now = when;
      follower.report({ _tag: 'Here', at, state });
    },
    marks: () => Arr.makeBy(timeline.lines.length, (k) => follower.marks.markOf(k)),
    markOf: follower.marks.markOf,
    line: follower.marks.line,
  };
};

const recording = (length: number): PlaybackApi => {
  let state: Status['state'] = 'idle';
  let at = 0;
  let since = 0;
  const read = Effect.map(Clock.currentTimeMillis, (now): Status => {
    if (state === 'playing') at = Math.min(length, at + now - since);
    since = now;
    if (state === 'playing' && at >= length) state = 'ended';
    return { state, positionMs: at, durationMs: length };
  });
  const then = (change: () => void) =>
    Effect.flatMap(read, () => {
      change();
      return read;
    });
  return {
    play: (_uri, fromMs) =>
      then(() => {
        at = fromMs;
        state = 'playing';
      }),
    pause: then(() => {
      state = 'paused';
    }),
    resume: then(() => {
      state = 'playing';
    }),
    seek: (ms) =>
      then(() => {
        at = ms;
      }),
    status: read,
    stop: Effect.asVoid(
      then(() => {
        state = 'idle';
      }),
    ),
    connection: Stream.make(true),
    announce: () => Effect.void,
    remote: Stream.empty,
  };
};

const played = (number: number, on: boolean, to: number) =>
  Effect.scoped(
    Effect.gen(function* () {
      const sound = yield* SubscriptionRef.make(on);
      const api = yield* scoreClock(recording(600_000), book.of, sound);
      const follow = followed(number);
      const laid = laidOf(number);
      yield* api.play(audioUrl(number), 0);
      const polls: Array<{
        readonly at: number;
        readonly got: ReadonlyArray<number>;
        readonly want: ReadonlyArray<number>;
      }> = [];
      for (;;) {
        const status = yield* api.status;
        const when = yield* Clock.currentTimeMillis;
        follow.tell(when, status.positionMs, 'playing');
        polls.push({
          at: status.positionMs,
          got: follow.marks(),
          want: Arr.makeBy(follow.lines, (k) => markAt(laid, k, status.positionMs)),
        });
        if (status.positionMs > to) return polls;
        yield* TestClock.adjust(POLL);
      }
    }),
  );

describe('wordlight: hymn 11, the owner’s place (stanza 1, line index 1, at 0:27)', () => {
  it.effect('with Sound on, line 1 lights the syllable sung at 27 000 ms, not the whole line', () =>
    Effect.gen(function* () {
      const laid = laidOf(11);
      expect(lineAt(laid, 27_000)).toBe(1);
      expect(Option.isSome(Option.flatMap(Arr.get(laid, 1), (line) => line.times))).toBe(true);
      const polls = yield* played(11, true, 30_000);
      const at27 = Option.getOrThrow(Arr.findFirst(polls, (poll) => poll.at === 27_000));
      expect(at27.got[1]).toBe(markAt(laid, 1, 27_000));
      expect(at27.got[1]).toBeGreaterThanOrEqual(0);
    }),
  );

  for (const on of [true, false])
    it.effect(
      `with Sound ${Match.value(on).pipe(
        Match.when(true, () => 'on'),
        Match.orElse(() => 'off'),
      )}, every poll through stanza 1's first three lines lights the rule's syllable, and the light moves on`,
      () =>
        Effect.gen(function* () {
          const polls = yield* played(11, on, 33_000);
          const faults = polls.flatMap(({ at, got, want }) =>
            Arr.filter([`at ${at}: got ${got.join(',')} want ${want.join(',')}`], () =>
              got.some((mark, k) => mark !== want[k]),
            ),
          );
          expect(faults).toEqual([]);
          const lit = polls.map(({ got }) => got[1] ?? OFF).filter((mark) => mark >= 0);
          expect(new Set(lit).size).toBeGreaterThan(1);
          expect(lit.every((mark, k) => k === 0 || mark >= (lit[k - 1] ?? 0))).toBe(true);
        }),
    );
});

const fractions = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
};

describe('wordlight: the rule over every hymn', () => {
  it.effect(
    'every line whose note times may light it lights its sung syllable at each syllable start, between starts and at generated times; any other line is marked whole',
    () =>
      Effect.sync(() => {
        const faults: Array<string> = [];
        let lit = 0;
        let whole = 0;
        const next = fractions(11);
        for (const hymn of hymns) {
          const laid = laidOf(hymn.number);
          const follow = followed(hymn.number);
          if (follow.lines !== laid.length) {
            faults.push(`${hymn.number}: ${follow.lines} lines, the score lays ${laid.length}`);
            continue;
          }
          const probes: Array<{ readonly i: number; readonly t: number }> = [];
          laid.forEach((line, i) => {
            if (line.until <= line.start) return;
            Option.match(line.times, {
              onNone: () => {
                whole += 1;
                probes.push({ i, t: line.start });
              },
              onSome: (times) => {
                lit += 1;
                const between = times.map((time, k) => (time + (times[k + 1] ?? line.until)) / 2);
                const generated = Arr.makeBy(
                  3,
                  () => line.start + Math.floor(next() * (line.until - line.start)),
                );
                for (const t of [...times, ...between, ...generated])
                  if (t >= line.start && t < line.until) probes.push({ i, t });
              },
            });
          });
          for (const { i, t } of probes.toSorted((a, b) => a.t - b.t)) {
            follow.tell(0, t, 'paused');
            const line = lineAt(laid, t);
            const got = Match.value(line).pipe(
              Match.when(-1, () => OFF),
              Match.orElse((k) => follow.markOf(k)),
            );
            const wanted = Match.value(line).pipe(
              Match.when(-1, () => OFF),
              Match.orElse((k) => markAt(laid, k, t)),
            );
            if (follow.line() !== line || got !== wanted)
              faults.push(
                `${hymn.number} line ${i} at ${t}: line ${follow.line()} mark ${got}, want line ${line} mark ${wanted}`,
              );
          }
        }
        expect(faults.slice(0, 20)).toEqual([]);
        expect(lit).toBeGreaterThanOrEqual(15_085);
        expect(whole).toBeGreaterThan(0);
      }),
  );
});
