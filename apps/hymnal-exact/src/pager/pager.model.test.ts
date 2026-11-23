/* oxlint-disable effect/noTernary, effect/noNullish -- a Bun test in an Exact app's folder imports no effect (docs/exact.md), so the model branches plainly. */

/**
 * The pager, model-based. Generated readers open a hymn from a home list,
 * a search's results, the Recent screen or a link, then swipe left and
 * right, short and flung, past the ends, and go Back. Each step runs on the
 * port's sources (`pagerAround`, `pagerSettle`) over the pages they drew,
 * and on a small model of the current app's pager built on its own
 * `pageSource` and `settledAt`: after every step the same hymn is shown,
 * with the same neighbours, the route is one stack entry over the list,
 * and Back is the list. A property over every list length and place holds
 * the ends: no wrap, and nothing past them.
 */

import { describe, expect, test } from 'bun:test';

import * as one from '@manna/hymnal-app/reader/pager';

import { book } from '../hymns/book.ts';
import { below, pick, type Random, seeded } from '../test/random.ts';
import type * as PagerDecl from './decl/pager';
import { around, pagesFor, settled } from './pager.ts';
import { pagerSources } from './sources.ts';

/** The declaration Exact's type check reads holds to the current app's module. */
type Held<T> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? { bivariant(...args: P): R }['bivariant']
    : T[K];
};

const held = {
  pageSource: one.pageSource,
  settledAt: one.settledAt,
  onPage: one.onPage,
  backEdge: one.backEdge,
} satisfies Held<typeof PagerDecl>;

const sources = pagerSources(book);
const every = book.hymns.map((hymn) => hymn.number);
const WIDTH = 390;

/**
 * The current app's own `Option`s, made from its answers (this folder
 * imports no effect): a `some` of any value takes the prototype of the
 * `some` its `settledAt` answers.
 */
type From = Parameters<typeof one.pageSource>[0];
const someProto: object = Object.getPrototypeOf(one.settledAt(0, 1, [1]));
const noneProto: object = Object.getPrototypeOf(one.settledAt(0, 1, []));
const some = (value: ReadonlyArray<number>): From =>
  Object.assign(Object.create(someProto), { _tag: 'Some', value });
const none: From = Object.create(noneProto);
const valueOf = (option: ReturnType<typeof one.settledAt>): number | undefined =>
  option._tag === 'Some' ? option.value : undefined;

/** Where a reader opens a hymn: the list it pressed the row in, or none (a link, the bar, the drums). */
type Source =
  | { readonly kind: 'list'; readonly list: ReadonlyArray<number> }
  | { readonly kind: 'link' };

/** A list a reader presses a row in: home's Sections (every hymn), a search's results, Recent. */
const sourceOf = (random: Random): Source => {
  const kind = below(random, 4);
  if (kind === 0) return { kind: 'list', list: every };
  if (kind === 1) {
    const length = 1 + below(random, 12);
    const found = new Set<number>();
    while (found.size < length) found.add(pick(random, every));
    return { kind: 'list', list: [...found] };
  }
  if (kind === 2) {
    const length = 1 + below(random, 30);
    const recent = new Set<number>();
    while (recent.size < length) recent.add(1 + below(random, 40));
    return { kind: 'list', list: [...recent] };
  }
  return { kind: 'link' };
};

/** The port: the stack, the list it came from, and the pages its view draws. */
interface Port {
  stack: Array<string>;
  from: ReadonlyArray<number>;
  drawn: ReadonlyArray<number>;
}

/** The current app's pager: its pages and the place shown. */
interface Model {
  stack: Array<string>;
  list: ReadonlyArray<number>;
  index: number;
}

const routeOf = (stack: ReadonlyArray<string>) => stack.at(-1) ?? '';

/** The pages the port draws for its route, once `pagerAround` answers. */
const drawnFor = (route: string, from: ReadonlyArray<number>) =>
  sources.pagerAround([route.replace('/hymns/', ''), from]).numbers;

/** A hymn opened, on the port and on the model. */
interface Opened {
  readonly port: Port;
  readonly model: Model;
}

const open = (random: Random): Opened => {
  const source = sourceOf(random);
  const list = source.kind === 'list' ? source.list : [];
  const n = list.length > 0 ? pick(random, list) : pick(random, every);
  const route = `/hymns/${n}`;
  const from = source.kind === 'list' ? list : [];
  const pages = one.pageSource(source.kind === 'list' ? some(list) : none, n, every);
  return {
    port: { stack: ['/', route], from, drawn: drawnFor(route, from) },
    model: { stack: ['/', route], list: pages.list, index: pages.index },
  };
};

/**
 * A swipe: `pages` whole pages that way (-1 left to the hymn before, 1
 * right to the next), short of half a page when `short`, landing as a
 * page-stopping snap does (one page a fling) when `flung`.
 */
interface Swipe {
  readonly way: -1 | 1;
  readonly short: boolean;
  readonly flung: boolean;
}

const swipeOf = (random: Random): Swipe => ({
  way: below(random, 2) === 0 ? -1 : 1,
  short: below(random, 4) === 0,
  flung: below(random, 2) === 0,
});

/** Where a scroller over `count` pages comes to rest from page `at` after `swipe`. */
const restAt = (at: number, count: number, swipe: Swipe, jitter: number): number => {
  if (swipe.short) return at * WIDTH + swipe.way * (WIDTH / 2 - 1 - jitter);
  const page = Math.min(Math.max(at + swipe.way, 0), count - 1);
  return page * WIDTH + (swipe.flung ? 0 : swipe.way * Math.min(jitter, WIDTH / 2 - 1) * -1);
};

const swipePort = (port: Port, swipe: Swipe, jitter: number): Port => {
  const route = routeOf(port.stack);
  const at = port.drawn.indexOf(Number(route.replace('/hymns/', '')));
  const offset = restAt(at, port.drawn.length, swipe, jitter);
  const { number } = sources.pagerSettle([port.drawn, offset, WIDTH]);
  if (number === 0 || `/hymns/${number}` === route) return port;
  const next = `/hymns/${number}`;
  return { ...port, stack: [...port.stack.slice(0, -1), next], drawn: drawnFor(next, port.from) };
};

const swipeModel = (model: Model, swipe: Swipe, jitter: number): Model => {
  const offset = restAt(model.index, model.list.length, swipe, jitter);
  const n = valueOf(one.settledAt(offset, WIDTH, model.list));
  if (n === undefined) return model;
  const index = model.list.indexOf(n);
  return { ...model, index, stack: [...model.stack.slice(0, -1), `/hymns/${n}`] };
};

const neighboursOf = (model: Model) =>
  model.list.slice(Math.max(0, model.index - 1), model.index + 2);

const agree = (port: Port, model: Model, seed: number, step: number) => {
  const where = `seed ${seed} step ${step}`;
  expect({ where, route: routeOf(port.stack) }).toEqual({ where, route: routeOf(model.stack) });
  expect({ where, drawn: port.drawn }).toEqual({ where, drawn: neighboursOf(model) });
  expect({ where, entries: port.stack.length }).toEqual({ where, entries: 2 });
};

describe('the pager moves as the current app’s does', () => {
  test('the declaration holds to the current app’s pager', () => {
    expect(held.backEdge).toBe(20);
  });

  test('generated readers: the same hymn, the same neighbours, one entry, Back at the list', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const random = seeded(seed);
      let { port, model } = open(random);
      agree(port, model, seed, 0);
      const steps = 1 + below(random, 12);
      for (let step = 1; step <= steps; step += 1) {
        const swipe = swipeOf(random);
        const jitter = below(random, WIDTH / 2);
        port = swipePort(port, swipe, jitter);
        model = swipeModel(model, swipe, jitter);
        agree(port, model, seed, step);
      }
      expect(port.stack.slice(0, -1)).toEqual(['/']);
      expect(model.stack.slice(0, -1)).toEqual(['/']);
    }
  });

  test('every list length and place: the ends do not wrap, and nothing lies past them', () => {
    for (let length = 1; length <= 40; length += 1) {
      const list = every.slice(100, 100 + length);
      for (let index = 0; index < length; index += 1) {
        const n = list[index] ?? 0;
        const pages = one.pageSource(some(list), n, every);
        const drawn = around(list, n, every).numbers;
        expect(drawn).toEqual(pages.list.slice(Math.max(0, pages.index - 1), pages.index + 2));
        expect(drawn[0]).toBe(list[Math.max(0, index - 1)]);
        expect(drawn.at(-1)).toBe(list[Math.min(length - 1, index + 1)]);
        const at = drawn.indexOf(n);
        expect<number | undefined>(settled((at - 1) * WIDTH, WIDTH, drawn)).toEqual(
          drawn[Math.max(0, at - 1)],
        );
        expect<number | undefined>(settled((at + 1) * WIDTH, WIDTH, drawn)).toEqual(
          drawn[Math.min(drawn.length - 1, at + 1)],
        );
        expect<number | undefined>(settled(-WIDTH * 3, WIDTH, drawn)).toEqual(drawn[0]);
        expect<number | undefined>(settled(WIDTH * 9, WIDTH, drawn)).toEqual(drawn.at(-1));
      }
    }
  });

  test('a list that does not hold the hymn pages through every hymn, as a link does', () => {
    expect(pagesFor([5, 9], 7, every)).toEqual({ list: every, index: every.indexOf(7) });
    expect(around([], 1, every).numbers).toEqual([1, 2]);
    expect(around([], every.at(-1) ?? 0, every).numbers).toEqual(every.slice(-2));
    expect(sources.pagerAround(['007', []]).numbers).toEqual([]);
    expect(sources.pagerAround(['999', []]).numbers).toEqual([]);
    expect(sources.pagerSettle([[], 0, WIDTH]).number).toBe(0);
  });
});
