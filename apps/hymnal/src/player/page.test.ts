/**
 * The page shown, over generated stacks: 1000 seeded runs of up to 40 of a
 * reader's steps (a hymn page pushed, any of three hymns, the same one
 * twice allowed; a sheet opened over the top page and closed; a page turn
 * on the top page; a back), and the stack's own (a lower page's effects run
 * again with no focus). The stack plays each step as React Navigation's
 * native stack does: a screen's effects run while it is focused, the one
 * before the last, or the one a sheet lies over, and are cleaned up while it
 * is paused; the events of one step come in any order. After every step, the
 * page shown is the top hymn page of the stack (the page under an open
 * sheet), and none while the stack holds no hymn page.
 */

import { describe, expect, it } from 'bun:test';

import { Array as Arr, Effect, Equal, Option, Random } from 'effect';

import { type Page, PageEvent, pagesAfter, shownAmong } from './page';

type Screen =
  | { readonly _tag: 'Home' }
  | { readonly _tag: 'Sheet' }
  | { readonly _tag: 'Hymn'; readonly page: Page };

const HYMNS = [3, 100, 373];

const hymnPage = (number: number): Screen => ({
  _tag: 'Hymn',
  page: { mark: Symbol(number), track: { number, title: `Hymn ${number}` } },
});

/** Whether the screen at `i` runs its effects: focused, before the last, or under a sheet. */
const runs = (stack: ReadonlyArray<Screen>, i: number) =>
  i >= stack.length - 2 || stack[i + 1]?._tag === 'Sheet';

const marksRunning = (stack: ReadonlyArray<Screen>) =>
  new Map(
    stack.flatMap(
      (screen, i) =>
        (screen._tag === 'Hymn' && runs(stack, i) && [[screen.page.mark, i] as const]) || [],
    ),
  );

/** The events the stack's change from `before` to `after` makes, a page's own in order, pages shuffled. */
const changed = (
  before: ReadonlyArray<Screen>,
  after: ReadonlyArray<Screen>,
): Effect.Effect<ReadonlyArray<PageEvent>> => {
  const was = marksRunning(before);
  const now = marksRunning(after);
  const pages = new Map(
    [...before, ...after].flatMap(
      (screen) => (screen._tag === 'Hymn' && [[screen.page.mark, screen.page] as const]) || [],
    ),
  );
  const groups: Array<ReadonlyArray<PageEvent>> = [];
  for (const mark of was.keys()) if (!now.has(mark)) groups.push([PageEvent.Unmounted({ mark })]);
  for (const [mark, i] of now)
    if (!was.has(mark))
      groups.push([
        PageEvent.Mounted({
          page: Option.getOrThrow(Option.fromUndefinedOr(pages.get(mark))),
          focused: i === after.length - 1,
        }),
      ]);
  return Effect.map(Random.shuffle(groups), (shuffled) => shuffled.flat());
};

type Step = 'push' | 'sheet' | 'turn' | 'back' | 'remount';

/** The top hymn page: the last screen, or the one under the sheet. */
const topHymn = (stack: ReadonlyArray<Screen>): Option.Option<number> =>
  Option.flatMap(
    Arr.findLast(stack, (screen) => screen._tag === 'Hymn'),
    (screen) => (screen._tag === 'Hymn' && Option.some(screen.page.track.number)) || Option.none(),
  );

/** One run: the steps taken and, after each, the page shown and the top hymn page. */
const runOf = (seed: number) =>
  Effect.runSync(
    Effect.gen(function* () {
      let stack: ReadonlyArray<Screen> = [{ _tag: 'Home' }];
      let pages: ReadonlyArray<Page> = [];
      const seen: Array<{
        readonly step: Step;
        readonly shown: Option.Option<number>;
        readonly top: Option.Option<number>;
      }> = [];
      const length = yield* Random.nextIntBetween(1, 40);
      for (const _ of Array.from({ length })) {
        const top = stack.at(-1);
        const step = yield* Random.choice<ReadonlyArray<Step>>(
          (top?._tag === 'Sheet' && ['sheet', 'remount']) ||
            (top?._tag === 'Hymn' && ['push', 'sheet', 'turn', 'back', 'remount']) || [
              'push',
              'remount',
            ],
        );
        const events: Array<PageEvent> = [];
        if (step === 'remount') {
          // A page under the top hymn page whose effects run has them run again, with no focus.
          const topAt = stack.findLastIndex((screen) => screen._tag === 'Hymn');
          const lower = stack.flatMap(
            (screen, i) =>
              (screen._tag === 'Hymn' && runs(stack, i) && i < topAt && [screen.page]) || [],
          );
          for (const page of Option.toArray(Arr.head(yield* Random.shuffle(lower))))
            events.push(
              PageEvent.Unmounted({ mark: page.mark }),
              PageEvent.Mounted({ page, focused: false }),
            );
        } else {
          const next: ReadonlyArray<Screen> =
            (step === 'push' && [...stack, hymnPage(yield* Random.choice(HYMNS))]) ||
            (step === 'sheet' && top?._tag === 'Sheet' && stack.slice(0, -1)) ||
            (step === 'sheet' && [...stack, { _tag: 'Sheet' } as const]) ||
            (step === 'turn' && [...stack.slice(0, -1), hymnPage(yield* Random.choice(HYMNS))]) ||
            stack.slice(0, -1);
          events.push(...(yield* changed(stack, next)));
          stack = next;
        }
        for (const event of events) pages = pagesAfter(pages, event);
        seen.push({
          step,
          shown: Option.map(shownAmong(pages), (track) => track.number),
          top: topHymn(stack),
        });
      }
      return seen;
    }).pipe(Random.withSeed(seed)),
  );

describe('the page shown', () => {
  it('is the top hymn page of the stack after every step, in 1000 generated runs', () => {
    const runs1000 = Array.from({ length: 1000 }, (_, seed) => ({ seed, seen: runOf(seed) }));
    const wrong = runs1000.flatMap(({ seed, seen }) =>
      seen.flatMap(
        ({ step, shown, top }, k) =>
          (!Equal.equals(shown, top) && [
            `seed ${seed} step ${k} ${step}: shown ${String(shown)}, top ${String(top)}`,
          ]) ||
          [],
      ),
    );
    expect(wrong.slice(0, 5)).toEqual([]);
    // Every kind of step was taken.
    const steps = new Set(runs1000.flatMap(({ seen }) => seen.map(({ step }) => step)));
    expect([...steps].toSorted()).toEqual(['back', 'push', 'remount', 'sheet', 'turn']);
  });

  it('puts a page that mounts focused on top, and one that mounts unfocused under every page', () => {
    const page = (number: number): Page => ({
      mark: Symbol(number),
      track: { number, title: `Hymn ${number}` },
    });
    const [lower, upper, again] = [page(100), page(3), page(100)];
    const shown = (events: ReadonlyArray<PageEvent>) =>
      Option.map(
        shownAmong(events.reduce<ReadonlyArray<Page>>(pagesAfter, [])),
        (track) => track.number,
      );
    // A sheet over hymn 3 closes, and hymn 100's page under it runs its effects again.
    expect(
      shown([
        PageEvent.Mounted({ page: lower, focused: true }),
        PageEvent.Mounted({ page: upper, focused: true }),
        PageEvent.Unmounted({ mark: lower.mark }),
        PageEvent.Mounted({ page: lower, focused: false }),
      ]),
    ).toEqual(Option.some(3));
    // The same hymn pushed twice, then a back from the second.
    expect(
      shown([
        PageEvent.Mounted({ page: lower, focused: true }),
        PageEvent.Mounted({ page: upper, focused: true }),
        PageEvent.Mounted({ page: again, focused: true }),
        PageEvent.Unmounted({ mark: again.mark }),
      ]),
    ).toEqual(Option.some(3));
    expect(shown([])).toEqual(Option.none());
  });
});
