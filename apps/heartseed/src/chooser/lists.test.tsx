/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- the chooser's lists, driven one awaited tap at a time, the model's undefined read as none. */

/**
 * The chooser's lists, header and footer (hspassage C6, C7) as a reader
 * meets them, through `test/chooser-rig.tsx`. Its seam: `ChooserScreen`,
 * judged after every tap against the rule written plainly
 * (`test/choose-model.ts`, the books named by the canon and counted from
 * the KJV's own rows), and on every frame against the screen's rules.
 *
 * It catches the books out of canon order or split wrong between the
 * testaments, a book's chapters off by one, a verse missing or checked
 * outside the range, a heading or back wrong at any step, a back that keeps
 * the range, a footer's reference or count wrong, its cap missing, `Plant`
 * with no range, a fixed control inside the scroll view, and a step that
 * opens at the last step's scroll offset (books to chapters, chapters to
 * verses, or a back), which hid a chapter's first verses live. It misses
 * `Plant`'s answers: `plant.test.tsx` owns them.
 */

import { describe, expect, it } from 'bun:test';

import {
  backRule,
  booksOf,
  chooserWant,
  OPENED,
  tapRule,
  type Choosing,
} from '../test/choose-model';
import { bookName, mountChooser, TARGETS } from '../test/chooser-rig';
import { below, random } from '../test/garden-model';
import { device } from '../test/one';
import { CORPUS, countIn } from '../test/passages-rig';

/** The taps that build each kind of range in a chapter of `count` verses: the kind's name and its taps. */
const rangesIn = (
  next: () => number,
  count: number,
): ReadonlyArray<readonly [string, number[]]> => {
  const middle = 1 + below(next, count);
  const kinds: Array<readonly [string, number[]]> = [
    ['the first verse', [1]],
    ['a middle verse', [middle]],
    ['the last verse', [count]],
    ['the one verse cleared', [middle, middle]],
  ];
  if (count >= 2) kinds.push(['2-19 verses', [1, Math.min(count, 2 + below(next, 18))]]);
  if (count >= 20) kinds.push(['20 verses', [count - 19, count]]);
  if (count >= 21) {
    kinds.push(['clipped forward', [1, count]]);
    kinds.push(['clipped back', [count, 1]]);
  }
  kinds.push(['a restart', [1, Math.min(count, 2), middle]]);
  return kinds;
};

describe('the chooser’s lists', () => {
  it('lists the 66 books in canon order under two labels, 39 then 27, and a book’s chapters', async () => {
    device.launch(new Map());
    const rig = await mountChooser();
    const books = booksOf(CORPUS);
    expect([books.old.length, books.new.length]).toEqual([39, 27]);
    expect(await rig.settle(chooserWant(CORPUS, OPENED))).toBeUndefined();
    const next = random(66);
    const sample = [19, 31, 57, 66, ...Array.from({ length: 4 }, () => 1 + below(next, 66))];
    const wrong: string[] = [];
    for (const book of sample) {
      await rig.tap(bookName(book));
      const state: Choosing = {
        step: { at: 'chapters', book },
        chosen: undefined,
        line: undefined,
      };
      if ((await rig.settle(chooserWant(CORPUS, state))) !== undefined) wrong.push(bookName(book));
      await rig.tap('Books');
      if ((await rig.settle(chooserWant(CORPUS, OPENED))) !== undefined)
        wrong.push(`back from ${bookName(book)}`);
    }
    expect(wrong).toEqual([]);
    expect(rig.faults).toEqual([]);
    await rig.tap('Your field');
    expect(await rig.settle('closed')).toBeUndefined();
    expect(rig.left.count).toBe(1);
    await rig.leave();
  });

  it('shows every verse of a chapter, checked over each kind of range, with its reference, count and cap; each back clears it', async () => {
    device.launch(new Map());
    const rig = await mountChooser();
    const next = random(41_10);
    const wrong: string[] = [];
    for (const target of TARGETS) {
      const name = bookName(target.book);
      const count = countIn(target.book, target.chapter);
      await rig.tap(name);
      await rig.tap(`${name} ${target.chapter}`);
      let state: Choosing = {
        step: { at: 'verses', ...target },
        chosen: undefined,
        line: undefined,
      };
      if ((await rig.settle(chooserWant(CORPUS, state))) !== undefined)
        wrong.push(`${name} ${target.chapter} opened`);
      for (const [kind, taps] of rangesIn(next, count)) {
        for (const verse of taps) {
          await rig.tapVerseAt(verse);
          state = { ...state, chosen: tapRule(state.chosen, verse, count) };
        }
        if ((await rig.settle(chooserWant(CORPUS, state))) !== undefined)
          wrong.push(`${name} ${target.chapter}: ${kind}`);
        while (state.chosen !== undefined) {
          await rig.tapVerseAt(state.chosen.first);
          state = { ...state, chosen: tapRule(state.chosen, state.chosen.first, count) };
        }
      }
      state = { ...state, chosen: { first: 1, last: 1 } };
      await rig.tapVerseAt(1);
      if (count >= 2) {
        await rig.tapVerseAt(2);
        state = { ...state, chosen: tapRule(state.chosen, 2, count) };
      }
      await rig.tap('Chapters');
      state = backRule(state) ?? OPENED;
      if ((await rig.settle(chooserWant(CORPUS, state))) !== undefined)
        wrong.push(`${name}: back to the chapters`);
      await rig.tap(`${name} ${target.chapter}`);
      state = { step: { at: 'verses', ...target }, chosen: undefined, line: undefined };
      if ((await rig.settle(chooserWant(CORPUS, state))) !== undefined)
        wrong.push(`${name}: the range kept across a back`);
      await rig.tap('Chapters');
      await rig.tap('Books');
    }
    expect(wrong).toEqual([]);
    expect(rig.faults).toEqual([]);
    await rig.leave();
  });

  it('opens each step at its top, going in and coming back, wherever the last step was scrolled', async () => {
    device.launch(new Map());
    const rig = await mountChooser();
    const scroller = () =>
      [...rig.host.querySelectorAll('div')].find((node) => {
        const style = getComputedStyle(node);
        return /auto|scroll/.test(`${style.overflowY} ${style.overflow}`);
      });
    const steps = [
      ['Psalms', 'Psalms 119'],
      ['Psalms 119', 'Psalms 119:176'],
      ['Chapters', 'Psalms 119'],
      ['Books', 'Romans'],
      ['Romans', 'Romans 16'],
    ] as const;
    const kept: string[] = [];
    for (const [label, then] of steps) {
      const before = scroller();
      if (before !== undefined) before.scrollTop = 600;
      await rig.tap(label);
      await rig.until(() => rig.control(then) !== undefined);
      const top = scroller()?.scrollTop;
      if (top !== 0) kept.push(`${label}: ${top}`);
    }
    expect(kept).toEqual([]);
    expect(rig.faults).toEqual([]);
    await rig.leave();
  });
});
