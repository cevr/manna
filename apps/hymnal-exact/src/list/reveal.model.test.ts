/* oxlint-disable effect/noTernary -- a Bun test in an Exact app's folder imports no effect (docs/exact.md): a generated history picks plainly. */

/**
 * The port's pinned tab row (`listTabsStep`, src/list/reveal.ts) against the
 * current app's (`home/PinnedTabs.tsx`'s `useTabReveal` over
 * `home/reveal.ts`), over generated histories of the list's offsets (slow
 * drags, flings, bounces past the top, offsets at, just above and just
 * below the resting place), the app's own moves of the list (a tab chosen,
 * a tile picked, the rail: the move, then the list's report where it
 * landed, or none when it did not move) and the reader's touches. After
 * every step both say the same: shown, in reach, and the points of the
 * list's top the row covers once its slide ends. The declaration Exact's
 * type check reads is held to the source.
 */

import { describe, expect, it } from 'bun:test';
import * as one from '@manna/hymnal-app/home/reveal';

import type * as RevealDecl from './decl/reveal';
import { revealSources, type TabsAt } from './reveal.ts';

type Held<T> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? { bivariant(...args: P): R }['bivariant']
    : T[K];
};

const held = {
  travel: one.travel,
  revealTimes: one.revealTimes,
  hidden: one.hidden,
  revealAt: one.revealAt,
  jumped: one.jumped,
  touched: one.touched,
  inReach: one.inReach,
  shownHeight: one.shownHeight,
} satisfies Held<typeof RevealDecl>;

/** A step of a history: the list's report, the app's move (landing at `at`, or staying put), or the reader's touch. */
type Step =
  | { readonly kind: 'scroll'; readonly at: number }
  | { readonly kind: 'move'; readonly at: number; readonly moved: boolean }
  | { readonly kind: 'choose' }
  | { readonly kind: 'touch' };

/**
 * The current app's row, as `useTabReveal` runs it: the state turned on
 * each offset, the slide's end (`progress`: set to 0 at once at or above
 * the resting place outside a hold, else to the row's turn), the app's
 * `jump` then the list's offset set where it lands, and the touch.
 */
const oneRow = (rest: number, height: number) => {
  let state = one.hidden(rest);
  let progress = 0;
  let scroll = 0;
  const report = (now: number) => {
    const next = one.revealAt(state, now, rest);
    if (!next.held && now <= rest) progress = 0;
    else if (next.shown !== state.shown) progress = Number(next.shown);
    state = next;
    scroll = now;
  };
  return {
    step: (step: Step) => {
      if (step.kind === 'scroll') report(step.at);
      if (step.kind === 'move') {
        const at = step.moved ? step.at : scroll;
        state = one.jumped(state, at);
        if (at !== scroll) report(at);
      }
      if (step.kind === 'choose') {
        state = one.jumped(state, 0);
        if (scroll !== 0) report(0);
      }
      if (step.kind === 'touch') {
        const next = one.touched(state, scroll, rest);
        if (state.shown && !next.shown) progress = 0;
        state = next;
      }
    },
    seen: () => ({
      shown: state.shown,
      reach: one.inReach(state, scroll, rest),
      cover: one.shownHeight(progress, height, scroll, rest),
      at: scroll,
    }),
  };
};

/** The port's row: what the view sends for each step, and the last answer. */
const portRow = (rest: number, height: number) => {
  const { listTabsStep } = revealSources();
  let last: TabsAt = listTabsStep(['open', 0, rest, height]);
  return {
    step: (step: Step) => {
      if (step.kind === 'scroll') last = listTabsStep(['scroll', step.at, rest, height]);
      if (step.kind === 'move') {
        last = listTabsStep(['here', 0, 0, 0]);
        if (step.moved && step.at !== last.at)
          last = listTabsStep(['scroll', step.at, rest, height]);
      }
      if (step.kind === 'choose') {
        const stood = last.at;
        last = listTabsStep(['jump', 0, 0, 0]);
        if (stood !== 0) last = listTabsStep(['scroll', 0, rest, height]);
      }
      if (step.kind === 'touch') last = listTabsStep(['touch', 0, 0, 0]);
    },
    seen: () => ({ shown: last.shown, reach: last.reach, cover: last.cover, at: last.at }),
  };
};

/** A seeded run of numbers, so a failing history comes back the same. */
const seeded = (start: number) => {
  let seed = start;
  return (below: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % below;
  };
};

/** A history from the list's top: drags of each pace either way, flings, bounces, the offsets round the resting place, moves and touches. */
const history = (next: (below: number) => number, rest: number): ReadonlyArray<Step> => {
  const out: Array<Step> = [];
  let at = 0;
  const near = [rest - 1, rest - 0.5, rest, rest + 0.5, rest + 1, rest + one.travel];
  for (let run = 0; run < 40; run += 1) {
    const pick = next(20);
    if (pick === 0) out.push({ kind: 'touch' });
    else if (pick === 1) {
      at = next(3) === 0 ? 0 : next(6000);
      out.push({ kind: 'move', at, moved: next(4) !== 0 });
    } else if (pick === 2) {
      at = near[next(near.length)] ?? rest;
      out.push({ kind: 'scroll', at });
    } else if (pick === 4) {
      at = 0;
      out.push({ kind: 'choose' });
    } else if (pick === 3) {
      at = -1 - next(60);
      out.push({ kind: 'scroll', at });
    } else {
      const run = drag(next, at);
      out.push(...run);
      at = run.at(-1)?.at ?? at;
    }
  }
  return out;
};

/** A drag or a fling one way from `from`, frame by frame: steps of a few points either side of the travel, or of hundreds. */
const drag = (
  next: (below: number) => number,
  from: number,
): ReadonlyArray<{ readonly kind: 'scroll'; readonly at: number }> => {
  const out: Array<{ readonly kind: 'scroll'; readonly at: number }> = [];
  const way = next(2) === 0 ? 1 : -1;
  const fling = next(8) === 0;
  const steps = 1 + next(8);
  let at = from;
  for (let step = 0; step < steps; step += 1) {
    const by = fling ? 300 + next(1700) : 1 + next(one.travel + 3);
    at = Math.min(6000, Math.max(-60, at + way * by));
    out.push({ kind: 'scroll', at });
  }
  return out;
};

describe('the pinned tab row against the current app’s', () => {
  it('holds its declaration to the source', () => {
    expect(Object.keys(held).length).toBe(8);
  });

  it('says the same after every step of generated histories', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const next = seeded(seed);
      const rest = [49, 57, 96][next(3)] ?? 49;
      const height = [48, 56, 80][next(3)] ?? 48;
      const ours = portRow(rest, height);
      const theirs = oneRow(rest, height);
      for (const [index, step] of history(next, rest).entries()) {
        ours.step(step);
        theirs.step(step);
        const said = { seed, index, step, ...ours.seen() };
        expect(said).toEqual({ seed, index, step, ...theirs.seen() });
      }
    }
  });

  it('turns on an upward scroll of the travel deep in the list, and the app’s move turns nothing until a touch', () => {
    const rest = 49;
    const ours = portRow(rest, 48);
    for (const at of [500, 1500, 3000]) ours.step({ kind: 'scroll', at });
    expect(ours.seen().shown).toBe(false);
    ours.step({ kind: 'scroll', at: 3000 - one.travel });
    expect(ours.seen()).toEqual({ shown: true, reach: true, cover: 48, at: 3000 - one.travel });
    ours.step({ kind: 'move', at: 0, moved: true });
    expect(ours.seen()).toEqual({ shown: true, reach: false, cover: 0, at: 0 });
    ours.step({ kind: 'scroll', at: 900 });
    expect(ours.seen().reach).toBe(true);
    ours.step({ kind: 'touch' });
    ours.step({ kind: 'scroll', at: 900 + one.travel });
    expect(ours.seen().shown).toBe(false);
  });
});
