/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/maxCognitiveComplexity, eslint/complexity, effect/noAsyncFunction -- the current app's follow is imported after the stand-ins its import graph needs; both sides run one plain loop over a seeded history, and a broken rule throws naming its seed and history as JSON. */

/**
 * The port's follow (`followDesk`, run as `features/follow.contract` runs
 * it) beside the current app's (`follower.ts`'s `followerOf`, told the
 * player's state by `report.ts`'s `reportOf` as `useFollow` tells it: a
 * show as a count-in starts, a seek at each new seek count), over seeded
 * histories on hymns read from the current app's bundled timing at run time
 * (`vite/timing.ts`, words and syllables kept): Play, Pause, Resume, a
 * seek, a turn of the tempo, a count-in, the reader's own scroll, Resume
 * follow, a turn away to another hymn and back, the app hidden and shown,
 * and time going by. The contract's clock is the test's: a wake runs when
 * its time has come while the page is shown, as `followWakeCheck` does each
 * frame, and not while hidden. After each step both give every line the
 * same mark, the same scrolls in order (line and whether it moves), the same
 * Resume follow, and the port asks no wake while nothing moves.
 */

import { describe, expect, it } from 'bun:test';
import { type Host, followerOf } from '@manna/hymnal-app/follow/follower';
import { OFF } from '@manna/hymnal-app/follow/marks';
import { timelineOf } from '@manna/hymnal-app/follow/timeline';
import { readTiming } from '@manna/hymnal-app/vite/timing';

import { current } from '../player/current.testing.ts';
import { book } from '../hymns/book.testing.ts';
import { type Random, below, pick, seeded } from '../test/random.ts';
import { type FollowView, type Told, followDesk } from './follow.ts';
import { sungOf } from './marks.ts';

const { player } = await current();
const { reportOf } = await import('@manna/hymnal-app/follow/report');
const { Player } = player;

const HISTORIES = 60;
const STEPS = 30;

const timing = new Map(readTiming());
const hymns = book.hymns.filter((hymn) => timing.has(hymn.number)).slice(0, 120);

type Phase = 'none' | 'playing' | 'paused' | 'buffering';

interface World {
  number: number;
  phase: Phase;
  at: number;
  rate: number;
  counting: boolean;
  seek: number;
}

type Step =
  | { readonly _tag: 'Play'; readonly at: number; readonly counting: boolean }
  | { readonly _tag: 'Pause' }
  | { readonly _tag: 'Resume' }
  | { readonly _tag: 'Buffer' }
  | { readonly _tag: 'Seek'; readonly to: number }
  | { readonly _tag: 'Rate'; readonly rate: number }
  | { readonly _tag: 'CountEnds' }
  | { readonly _tag: 'Drag' }
  | { readonly _tag: 'ResumeFollow' }
  | { readonly _tag: 'Away' }
  | { readonly _tag: 'Back' }
  | { readonly _tag: 'Hidden'; readonly ms: number }
  | { readonly _tag: 'Wait'; readonly ms: number };

const stepOf = (random: Random, end: number): Step => {
  const roll = below(random, 13);
  if (roll === 0) return { _tag: 'Play', at: below(random, end), counting: random() < 0.3 };
  if (roll === 1) return { _tag: 'Pause' };
  if (roll === 2) return { _tag: 'Resume' };
  if (roll === 3) return { _tag: 'Buffer' };
  if (roll === 4) return { _tag: 'Seek', to: below(random, end) };
  if (roll === 5) return { _tag: 'Rate', rate: pick(random, [0.5, 0.8, 1, 1.25, 1.5]) };
  if (roll === 6) return { _tag: 'CountEnds' };
  if (roll === 7) return { _tag: 'Drag' };
  if (roll === 8) return { _tag: 'ResumeFollow' };
  if (roll === 9) return { _tag: pick(random, ['Away', 'Back'] as const) };
  if (roll === 10) return { _tag: 'Hidden', ms: below(random, 9000) };
  return { _tag: 'Wait', ms: below(random, 7000) };
};

/** The current app's player state for the world, on a track of hymn `number`. */
const stateOf = (world: World) => {
  const track = { number: world.number, title: '', stanzas: [] } as never;
  if (world.phase === 'none') return Player.Idle();
  if (world.phase === 'playing')
    return Player.Playing({ track, at: world.at / 1000, length: { _tag: 'None' } as never });
  if (world.phase === 'buffering') return Player.Buffering({ track, at: world.at / 1000 } as never);
  return Player.Paused({ track, at: world.at / 1000 } as never);
};

const run = (seed: number) => {
  const random = seeded(seed);
  const hymn = pick(random, hymns);
  const decoded = timelineOf(timing.get(hymn.number) ?? '');
  if (decoded._tag === 'None') return;
  const page = hymn.number;
  const choice: ReadonlyArray<number> = [];
  const timeline = decoded.value;
  const sung = sungOf(timeline, hymn.sections, choice);

  let now = 1000;
  let shown = true;
  const world: World = { number: 0, phase: 'none', at: 0, rate: 1, counting: false, seek: 0 };
  const history: Array<Step> = [];

  let timers: Array<{ at: number; run: () => void }> = [];
  const theirScrolls: Array<string> = [];
  let pending: Array<string> = [];
  /** The current app's scrolls asked in one of the port's calls: the contract acts on the last, once. */
  const flush = () => {
    const last = pending.at(-1);
    if (last !== undefined) theirScrolls.push(last);
    pending = [];
  };
  const host: Host = {
    now: () => now,
    wake: (ms, wake) => {
      const timer = { at: now + ms, run: wake };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
    scrollTo: (line, moves) => pending.push(`${line} ${moves}`),
    log: () => {},
  };
  const theirs = followerOf(sung, host);
  let counted = false;
  let heard = 0;

  const desk = followDesk((number) => (number === page ? { hymn, timeline } : undefined));
  const ourScrolls: Array<string> = [];
  let seen = 0;
  let view: FollowView = desk.view();
  const took = (next: FollowView) => {
    view = next;
    if (view.scroll > seen) {
      seen = view.scroll;
      if (view.scrollLine >= 0) ourScrolls.push(`${view.scrollLine} ${view.scrollMoves}`);
    }
  };

  const told = (): Told => ({ ...world });
  const tell = () => {
    took(desk.report(now, page, choice, told()));
    if (world.seek !== heard) {
      heard = world.seek;
      theirs.seek();
    }
    const report = reportOf(page, stateOf(world), world.rate, world.counting);
    const starts = world.counting && report._tag === 'Here' && !counted;
    counted = world.counting && report._tag === 'Here';
    theirs.report(report);
    if (starts) theirs.show();
    flush();
  };

  /** Time moves to `to`: the current app's timers run as they come, the port's wake while shown. */
  const advance = (to: number) => {
    for (;;) {
      const due = timers.filter((t) => t.at <= to).toSorted((a, b) => a.at - b.at)[0];
      const ours = view.wake > 0 && shown ? view.stamp + view.wakeIn : Number.POSITIVE_INFINITY;
      if (due === undefined && ours > to) break;
      if (due !== undefined && due.at <= ours) {
        timers = timers.filter((t) => t !== due);
        now = due.at;
        due.run();
        flush();
      } else {
        now = ours;
        took(desk.wake(now, view.wake));
      }
    }
    now = to;
  };

  /** The player's place moves on while it plays, as its reports say it at each report. */
  const moved = (ms: number) => {
    if (world.phase === 'playing' && !world.counting) world.at += ms * world.rate;
  };

  const check = () => {
    const marks = sung.lines.map((_, k) => theirs.marks.markOf(k));
    const ours = sung.lines.map((_, k) => (k === view.line ? view.mark : OFF));
    const same = {
      marks: ours,
      scrolls: ourScrolls,
      held: view.held,
      idle: world.phase !== 'playing' || world.counting ? view.wake === 0 : true,
    };
    const want = { marks, scrolls: theirScrolls, held: theirs.held.get(), idle: true };
    if (JSON.stringify(same) !== JSON.stringify(want))
      throw new Error(
        JSON.stringify({ seed, hymn: page, history, ours: same, theirs: want }, null, 1).slice(
          0,
          6000,
        ),
      );
  };

  for (let s = 0; s < STEPS; s += 1) {
    const step = stepOf(random, timeline.end);
    history.push(step);
    if (step._tag === 'Play') {
      world.number = page;
      world.phase = 'playing';
      world.at = step.counting ? timeline.first : step.at;
      world.counting = step.counting;
      tell();
    } else if (step._tag === 'Pause' && world.phase === 'playing') {
      world.phase = 'paused';
      tell();
    } else if (
      step._tag === 'Resume' &&
      (world.phase === 'paused' || world.phase === 'buffering')
    ) {
      world.phase = 'playing';
      tell();
    } else if (step._tag === 'Buffer' && world.phase === 'playing') {
      world.phase = 'buffering';
      tell();
    } else if (step._tag === 'Seek' && world.phase !== 'none') {
      world.at = step.to;
      world.seek += 1;
      tell();
    } else if (step._tag === 'Rate') {
      world.rate = step.rate;
      tell();
    } else if (step._tag === 'CountEnds' && world.counting) {
      world.counting = false;
      tell();
    } else if (step._tag === 'Drag' && view.here && !view.held) {
      took(desk.drag(now));
      theirs.drag();
      flush();
    } else if (step._tag === 'ResumeFollow' && view.held) {
      took(desk.resume(now));
      theirs.resume();
      flush();
    } else if (step._tag === 'Away' && world.number === page) {
      world.number = page + 1;
      tell();
    } else if (step._tag === 'Back' && world.number !== page && world.phase !== 'none') {
      world.number = page;
      tell();
    } else if (step._tag === 'Hidden') {
      shown = false;
      advance(now + step.ms);
      moved(step.ms);
      shown = true;
      advance(now);
    } else if (step._tag === 'Wait') {
      advance(now + step.ms);
      moved(step.ms);
    }
    check();
  }
};

describe('the port’s follow beside the current app’s follower', () => {
  it('marks, scrolls and holds as the current one over seeded histories', () => {
    expect(hymns.length).toBeGreaterThan(100);
    for (let seed = 1; seed <= HISTORIES; seed += 1) run(seed);
  });
});
