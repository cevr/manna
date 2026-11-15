/* oxlint-disable effect/noTernary, effect/noNullish -- a Bun test in an Exact app's folder imports no effect (docs/exact.md), so the model branches plainly and a hymn the book lacks is `undefined`. */

/**
 * The reader's lists, model-based. Generated sequences of `open`, `star`,
 * `unstar` and `relaunch`, with stale and unknown numbers, run against the
 * port's sources over a stand-in for the view's kept states (what
 * `persist` stores and reads back) and against a reference model written
 * here. On every step: Recent holds each hymn once, newest first, never
 * more than `RECENT`; the shelf is its first `RECENT_SHOWN` hymns;
 * Favourites is a set, shown ascending; a relaunch changes neither; and the
 * lists equal the current app's `visited` and `toggleFavourite` applied to
 * the same sequence.
 */

import { describe, expect, test } from 'bun:test';

import { RECENT, RECENT_SHOWN, toggleFavourite, visited } from '@manna/hymnal-app/reader/lists';

import { book } from '../hymns/book.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';
import { homeSources } from './sources.ts';

type Step =
  | { readonly kind: 'open'; readonly segment: string }
  | { readonly kind: 'star' | 'unstar'; readonly n: number }
  | { readonly kind: 'relaunch' };

const known = new Set(book.hymns.map((hymn) => hymn.number));
const titles = new Map(book.hymns.map((hymn) => [hymn.number, hymn.title]));

/** A hymn number, or now and then one no hymn has. */
const numberOf = (random: Random): number =>
  below(random, 8) === 0 ? pick(random, [0, -2, 696, 700, 12345]) : 1 + below(random, 40);

/** A route's segment: a hymn's number as the list writes it, or one a stale link writes. */
const segmentOf = (random: Random): string =>
  below(random, 6) === 0
    ? pick(random, ['007', '0', '696', 'abc', '', '1.5', '-3'])
    : `${numberOf(random)}`;

const stepOf = (random: Random): Step => {
  const roll = below(random, 10);
  if (roll < 5) return { kind: 'open', segment: segmentOf(random) };
  if (roll < 7) return { kind: 'star', n: numberOf(random) };
  if (roll < 9) return { kind: 'unstar', n: numberOf(random) };
  return { kind: 'relaunch' };
};

/** A kept list as an earlier version or a hand could leave it: numbers no hymn has among the hymns. */
const keptOf = (random: Random): Array<number> =>
  Array.from({ length: below(random, 8) }, () => numberOf(random));

/** The reference model: Recent and Favourites as the rules say, written plainly. */
interface Model {
  recent: Array<number>;
  favourites: Array<number>;
}

const modelStep = (model: Model, step: Step): Model => {
  if (step.kind === 'open') {
    const n = Number(step.segment);
    if (!/^[1-9]\d*$/.test(step.segment) || !known.has(n)) return model;
    return { ...model, recent: [n, ...model.recent.filter((m) => m !== n)].slice(0, 50) };
  }
  if (step.kind === 'relaunch' || !known.has(step.n)) return model;
  const has = model.favourites.includes(step.n);
  if (step.kind === 'star' && has) return model;
  if (step.kind === 'unstar' && !has) return model;
  const favourites = has
    ? model.favourites.filter((m) => m !== step.n)
    : [...model.favourites, step.n].toSorted((a, b) => a - b);
  return { ...model, favourites };
};

/** The current app's own rules over the same step, as its screens call them. */
const currentStep = (lists: Model, step: Step): Model => {
  if (step.kind === 'open') {
    const hymn = book.hymns.find((each) => `${each.number}` === step.segment);
    return hymn === undefined
      ? lists
      : { ...lists, recent: [...visited(lists.recent, hymn.number)] };
  }
  if (step.kind === 'relaunch' || !known.has(step.n)) return lists;
  const has = lists.favourites.includes(step.n);
  if ((step.kind === 'star') === has) return lists;
  return { ...lists, favourites: [...toggleFavourite(lists.favourites, step.n)] };
};

describe('the reader’s lists', () => {
  test('over generated sequences, against the model and the current app’s rules', () => {
    const random = seeded(1844);
    for (let run = 0; run < 100; run++) {
      const sorted = [...new Set(keptOf(random))].toSorted((a, b) => a - b);
      let kept: Model = { recent: [...new Set(keptOf(random))], favourites: sorted };
      let model = kept;
      let current = kept;
      let home = homeSources(book);
      for (let at = 0; at < 60; at++) {
        const step = stepOf(random);
        const before = kept;
        if (step.kind === 'open')
          kept = { ...kept, recent: home.recentAfter([kept.recent, step.segment]).numbers };
        else if (step.kind === 'relaunch') home = homeSources(book);
        else if ((step.kind === 'star') !== kept.favourites.includes(step.n))
          kept = { ...kept, favourites: home.favouritesAfter([kept.favourites, step.n]).numbers };
        model = modelStep(model, step);
        current = currentStep(current, step);
        const shown = home.recentRows([kept.recent]);
        const where = { run, at, step };

        expect({ ...where, kept }).toEqual({ ...where, kept: model });
        expect({ ...where, kept }).toEqual({ ...where, kept: current });
        expect(new Set(kept.recent).size).toBe(kept.recent.length);
        expect(kept.recent.length).toBeLessThanOrEqual(RECENT);
        expect(new Set(kept.favourites).size).toBe(kept.favourites.length);
        expect(kept.favourites).toEqual(kept.favourites.toSorted((a, b) => a - b));
        if (step.kind === 'relaunch') expect(kept).toEqual(before);
        if (
          step.kind === 'open' &&
          known.has(Number(step.segment)) &&
          /^[1-9]\d*$/.test(step.segment)
        )
          expect(kept.recent[0]).toBe(Number(step.segment));

        const all = kept.recent.flatMap((n) => {
          const title = titles.get(n);
          return title === undefined ? [] : [{ number: n, title }];
        });
        expect(shown.all).toEqual(all);
        expect(shown.shelf).toEqual(all.slice(0, RECENT_SHOWN));
        expect(shown.shelf.length).toBeLessThanOrEqual(5);
      }
    }
  });
});
