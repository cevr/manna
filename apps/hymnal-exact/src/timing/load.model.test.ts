/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/maxCognitiveComplexity, eslint/complexity, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noNewPromise, effect/noUnknownParameters -- both parts run one plain loop over a seeded history, awaiting each read the history settles in turn, and a broken rule throws naming its seed and history as JSON. */

/**
 * The words' times loaded on first use (`load.ts`), over seeded histories
 * with the read handed in, on hymns read from the current app's timing at
 * run time (`vite/timing.ts`):
 *
 * - The loader alone: hymns opened and played, a neighbour turned to, a
 *   read that is slow, fails, comes back with lines that are not the
 *   bundled ones, or arrives after the reader left the hymn, one hymn
 *   asked twice at once, and a relaunch. A hymn is read once a launch
 *   while its read runs or has arrived; a failed or broken read is kept as
 *   nothing and read again only at the next ask, never by itself; the
 *   words are the whole string once read, and nothing before.
 * - The follow fed by it (`followedOf`, the seam `app.ts` gives
 *   `followDesk`) beside two that never change: one fed the bundled
 *   lines-only timing, one the whole timing from the start. The words
 *   arrive at any step: before Play, mid-line while playing, while the
 *   reader's scroll holds the page, during a held seek, and while another
 *   hymn's page is shown; the page is told again when its hymn's words
 *   arrive, as `features/timing.contract` tells it. At every step the sung
 *   line, the scrolls asked (in order), Resume follow and the hold are the
 *   lines-only follow's, so the words' arrival moves no line and asks no
 *   scroll; the mark is the lines-only one's until the shown hymn's words
 *   are here and the whole one's after (but for a hold begun before them,
 *   which keeps the mark it froze).
 */

import { describe, expect, it } from 'bun:test';
import { timelineOf } from '@manna/hymnal-app/follow/timeline';
import { readTiming } from '@manna/hymnal-app/vite/timing';

import { book } from '../hymns/book.ts';
import { type Random, below, pick, seeded } from '../test/random.ts';
import { type FollowView, type Told, followDesk } from '../follow/follow.ts';
import { followedOf } from '../follow/sources.ts';
import { linesOnly } from './files.ts';
import { timingLoader } from './load.ts';

const LOADER_HISTORIES = 60;
const FOLLOW_HISTORIES = 120;
const STEPS = 36;

const full = new Map(readTiming());
const lines = [...full].map(([number, encoded]) => [number, linesOnly(encoded)] as const);
const bundled = new Map(lines);
const numbers = [...full.keys()];
const withWords = numbers.filter((n) => full.get(n) !== bundled.get(n));
const without = numbers.filter((n) => full.get(n) === bundled.get(n));

/** A read the history settles: its hymn, and how it ends. */
interface Read {
  readonly number: number;
  readonly answer: (text: string) => void;
  readonly fail: () => void;
}

/** Every answer already given has reached the loader and its callers: a few turns of the microtask queue. */
const settle = async () => {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
};

/** A read handed to the loader that waits for the history to settle it, counting what it was asked. */
const readsOf = () => {
  const open: Array<Read> = [];
  const asked: Array<number> = [];
  const read = (number: number) =>
    new Promise<string>((answer, reject) => {
      asked.push(number);
      open.push({ number, answer, fail: () => reject(new Error('no file')) });
    });
  return { open, asked, read };
};

type LoaderStep =
  | { readonly _tag: 'Ask'; readonly number: number }
  | { readonly _tag: 'AskTwice'; readonly number: number }
  | { readonly _tag: 'Arrive'; readonly k: number }
  | { readonly _tag: 'Fail'; readonly k: number }
  | { readonly _tag: 'Broken'; readonly k: number }
  | { readonly _tag: 'Relaunch' };

const loaderStepOf = (random: Random, hymns: ReadonlyArray<number>): LoaderStep => {
  const roll = below(random, 12);
  const number = pick(random, hymns);
  if (roll < 4) return { _tag: 'Ask', number };
  if (roll === 4) return { _tag: 'AskTwice', number };
  if (roll < 8) return { _tag: 'Arrive', k: below(random, 4) };
  if (roll === 8) return { _tag: 'Fail', k: below(random, 4) };
  if (roll === 9) return { _tag: 'Broken', k: below(random, 4) };
  if (roll === 10) return { _tag: 'Relaunch' };
  return { _tag: 'Ask', number };
};

const runLoader = async (seed: number) => {
  const random = seeded(seed);
  const hymns = [pick(random, withWords), pick(random, withWords), pick(random, without)];
  const history: Array<LoaderStep> = [];
  const broke = (why: string, more: unknown = {}) => {
    throw new Error(JSON.stringify({ seed, why, hymns, history, more }, null, 1).slice(0, 6000));
  };
  let loader = timingLoader(bundled);
  let reads = readsOf();
  /** Per hymn this launch: reads asked, and whether its words arrived. */
  let launch = new Map<number, { asks: number; reads: number; here: boolean }>();
  const of = (n: number) => {
    const known = launch.get(n) ?? { asks: 0, reads: 0, here: false };
    launch.set(n, known);
    return known;
  };

  for (let s = 0; s < STEPS; s += 1) {
    const step = loaderStepOf(random, hymns);
    history.push(step);
    const before = reads.asked.length;
    if (step._tag === 'Ask' || step._tag === 'AskTwice') {
      void loader.load(step.number, reads.read);
      if (step._tag === 'AskTwice') void loader.load(step.number, reads.read);
      of(step.number).asks += 1;
      await settle();
      const running = reads.open.filter((r) => r.number === step.number).length;
      if (running > 1) broke('two reads of one hymn at once', { running });
      if (of(step.number).here && reads.asked.length !== before)
        broke('a hymn whose words are here was read again');
    } else if (step._tag === 'Relaunch') {
      for (const read of reads.open) read.fail();
      await settle();
      loader = timingLoader(bundled);
      reads = readsOf();
      launch = new Map();
    } else {
      const read = reads.open[step.k % Math.max(1, reads.open.length)];
      if (read === undefined) continue;
      reads.open.splice(reads.open.indexOf(read), 1);
      const encoded = full.get(read.number) ?? '';
      if (step._tag === 'Arrive') read.answer(encoded);
      else if (step._tag === 'Fail') read.fail();
      else read.answer(`${encoded};1,0,1`);
      await settle();
      if (step._tag === 'Arrive') of(read.number).here = true;
      if (step._tag !== 'Arrive' && reads.asked.length !== before)
        broke('a failed read was tried again by itself');
    }
    for (const n of hymns) {
      const words = loader.words(n);
      const want = of(n).here ? full.get(n) : undefined;
      if (words !== want) broke('the words are not what arrived', { n, words, want });
      of(n).reads = reads.asked.filter((m) => m === n).length;
      if (of(n).reads > of(n).asks) broke('more reads than asks', { n, launch: [...launch] });
    }
  }
  for (const read of reads.open) read.fail();
  await settle();
};

type Phase = 'none' | 'playing' | 'paused';

type FollowStep =
  | { readonly _tag: 'Play'; readonly at: number }
  | { readonly _tag: 'Pause' }
  | { readonly _tag: 'Resume' }
  | { readonly _tag: 'Seek'; readonly to: number }
  | { readonly _tag: 'Drag' }
  | { readonly _tag: 'ResumeFollow' }
  | { readonly _tag: 'Hold' }
  | { readonly _tag: 'Lift' }
  | { readonly _tag: 'Turn' }
  | { readonly _tag: 'Back' }
  | { readonly _tag: 'Arrive'; readonly k: number }
  | { readonly _tag: 'Fail'; readonly k: number }
  | { readonly _tag: 'Wait'; readonly ms: number };

const followStepOf = (random: Random, end: number): FollowStep => {
  const roll = below(random, 14);
  if (roll === 0) return { _tag: 'Play', at: below(random, end) };
  if (roll === 1) return { _tag: 'Pause' };
  if (roll === 2) return { _tag: 'Resume' };
  if (roll === 3) return { _tag: 'Seek', to: below(random, end) };
  if (roll === 4) return { _tag: 'Drag' };
  if (roll === 5) return { _tag: 'ResumeFollow' };
  if (roll === 6) return { _tag: 'Hold' };
  if (roll === 7) return { _tag: 'Lift' };
  if (roll === 8) return { _tag: pick(random, ['Turn', 'Back'] as const) };
  if (roll === 9 || roll === 10) return { _tag: 'Arrive', k: below(random, 3) };
  if (roll === 11) return { _tag: 'Fail', k: below(random, 3) };
  return { _tag: 'Wait', ms: below(random, 5000) };
};

/** One follow desk as `features/follow.contract` runs it: its last answer and the scrolls it asked, in order. */
const deskOf = (words: (number: number) => string | undefined) => {
  const desk = followDesk(followedOf(book, lines, words));
  let view: FollowView = desk.view();
  let seen = 0;
  const scrolls: Array<string> = [];
  const took = (next: FollowView) => {
    view = next;
    if (view.scroll > seen) {
      seen = view.scroll;
      if (view.scrollLine >= 0 && !view.holding)
        scrolls.push(`${view.scrollLine} ${view.scrollMoves}`);
    }
  };
  /** Time moves to `to`: each wake runs as its time comes. */
  const advance = (to: number) => {
    while (view.wake > 0 && view.stamp + view.wakeIn <= to)
      took(desk.wake(view.stamp + view.wakeIn, view.wake));
  };
  return { desk, took, advance, view: () => view, scrolls };
};

const pages = withWords.filter((n) => book.hymns.some((h) => h.number === n + 1));

/** Steps where the whole timing's mark differed from the lines-only one's: the histories reach syllables. */
let differed = 0;

/** When the words arrived, over every history: each case the follow must take a late timeline in. */
const arrivals = new Set<string>();

const runFollow = async (seed: number) => {
  const random = seeded(seed);
  const first = pick(random, pages);
  const decoded = timelineOf(full.get(first) ?? '');
  const decodedEnd = decoded._tag === 'Some' ? decoded.value.end : 0;
  const history: Array<FollowStep> = [];
  const loader = timingLoader(bundled);
  const reads = readsOf();
  const ours = deskOf(loader.words);
  const flat = deskOf(() => undefined);
  const whole = deskOf((n) => full.get(n));
  const all = [ours, flat, whole];

  let now = 1000;
  let page = first;
  const world = { number: 0, phase: 'none' as Phase, at: 0, seek: 0 };
  /** The hold each desk froze its mark in: whether the shown hymn's words were here when it began. */
  let holdWithWords = false;

  const told = (): Told => ({
    number: world.number,
    phase: world.phase,
    at: world.at,
    rate: 1,
    counting: false,
    seek: world.seek,
  });
  const tell = () => {
    for (const one of all) one.took(one.desk.report(now, page, [], told()));
  };
  const open = async (number: number) => {
    page = number;
    void loader.load(number, reads.read);
    tell();
    await settle();
  };
  const broke = (why: string, more: unknown = {}) => {
    throw new Error(
      JSON.stringify({ seed, why, first, page, history, more }, null, 1).slice(0, 6000),
    );
  };

  await open(first);
  for (let s = 0; s < STEPS; s += 1) {
    const step = followStepOf(random, decodedEnd);
    history.push(step);
    const asked = all.map((one) => one.scrolls.length);
    const hadWords = loader.words(page) !== undefined;
    const lineBefore = ours.view().line;
    if (step._tag === 'Play') {
      world.number = page;
      world.phase = 'playing';
      world.at = step.at;
      tell();
    } else if (step._tag === 'Pause' && world.phase === 'playing') {
      world.phase = 'paused';
      tell();
    } else if (step._tag === 'Resume' && world.phase === 'paused') {
      world.phase = 'playing';
      tell();
    } else if (step._tag === 'Seek' && world.phase !== 'none') {
      world.at = step.to;
      world.seek += 1;
      tell();
    } else if (step._tag === 'Drag' && ours.view().here && !ours.view().held) {
      for (const one of all) one.took(one.desk.drag(now));
    } else if (step._tag === 'ResumeFollow' && ours.view().held) {
      for (const one of all) one.took(one.desk.resume(now));
    } else if (step._tag === 'Hold' && !ours.view().holding) {
      holdWithWords = loader.words(page) !== undefined;
      for (const one of all)
        one.took(
          one.desk.pointer(
            now,
            { _tag: 'Down', id: 1, primary: true, button: 0, x: 100, y: 200 },
            true,
          ),
        );
      now += 350;
      for (const one of all) one.advance(now);
      for (const one of all) one.took(one.desk.deadline(now, one.view().armed));
    } else if (step._tag === 'Lift') {
      for (const one of all)
        one.took(one.desk.pointer(now, { _tag: 'Up', id: 1, button: 0, x: 100, y: 200 }, true));
    } else if (step._tag === 'Turn') {
      await open(page + 1);
    } else if (step._tag === 'Back') {
      await open(first);
    } else if (step._tag === 'Arrive' || step._tag === 'Fail') {
      const read = reads.open[step.k % Math.max(1, reads.open.length)];
      if (read !== undefined) {
        reads.open.splice(reads.open.indexOf(read), 1);
        if (step._tag === 'Arrive') read.answer(full.get(read.number) ?? '');
        else read.fail();
        await settle();
        if (step._tag === 'Arrive') {
          const at = ours.view();
          if (read.number !== page) arrivals.add('another page');
          else if (at.holding) arrivals.add('held seek');
          else if (at.held) arrivals.add('scroll held');
          else if (world.phase === 'playing' && at.line >= 0) arrivals.add('playing');
          else if (world.phase === 'none') arrivals.add('before play');
        }
        if (step._tag === 'Arrive' && read.number === page) tell();
      }
    } else if (step._tag === 'Wait') {
      now += step.ms;
      for (const one of all) one.advance(now);
      if (world.phase === 'playing') world.at += step.ms;
    }

    const [o, f, w] = all.map((one) => one.view());
    if (o === undefined || f === undefined || w === undefined) return;
    const same = (v: FollowView) => ({
      line: v.line,
      here: v.here,
      held: v.held,
      holding: v.holding,
      holdLine: v.holdLine,
      countLine: v.countLine,
    });
    const here = loader.words(page) !== undefined;
    const want = here && !(o.holding && !holdWithWords) ? w : f;
    if (JSON.stringify(same(o)) !== JSON.stringify(same(want)))
      broke('the follow is not the one of the timing that is here', {
        here,
        ours: same(o),
        want: same(want),
      });
    if (step._tag === 'Arrive' && o.line !== lineBefore)
      broke('the words’ arrival moved the sung line', { before: lineBefore, after: o.line });
    const [oursNew, flatNew] = [ours, flat].map((one, k) =>
      one.scrolls.slice(asked[k] ?? 0).join(';'),
    );
    const caught = oursNew === '' || ours.scrolls.at(-1) === whole.scrolls.at(-1);
    if (!hadWords && !here && oursNew !== flatNew)
      broke('a scroll before the words is not the lines-only follow’s', {
        ours: oursNew,
        lines: flatNew,
      });
    if ((hadWords || here) && !caught)
      broke('the words asked a scroll the whole timing’s follow does not stand at', {
        ours: ours.scrolls,
        whole: whole.scrolls,
      });
    if (!hadWords && here && o.held && oursNew !== '')
      broke('the words scrolled a page the reader’s scroll holds', { ours: oursNew });
    if (here && w.mark !== f.mark) differed += 1;
    if (o.mark !== want.mark)
      broke('the mark is not the timing’s that is here', {
        here,
        ours: o.mark,
        want: want.mark,
        line: o.line,
      });
  }
  for (const read of reads.open) read.fail();
  await settle();
};

describe('the words’ times, loaded on first use', () => {
  it('reads each hymn once a launch, keeps what arrived, and tries a failed read again only when asked', async () => {
    expect(withWords.length).toBeGreaterThan(600);
    expect(without.length).toBeGreaterThan(0);
    for (let seed = 1; seed <= LOADER_HISTORIES; seed += 1) await runLoader(seed);
  });

  it('marks syllables once the shown hymn’s words arrive, with no line moved and no scroll asked', async () => {
    for (let seed = 1; seed <= FOLLOW_HISTORIES; seed += 1) await runFollow(seed);
    expect(differed).toBeGreaterThan(FOLLOW_HISTORIES);
    expect([...arrivals].toSorted()).toEqual([
      'another page',
      'before play',
      'held seek',
      'playing',
      'scroll held',
    ]);
  });
});
