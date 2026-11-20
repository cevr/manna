/* oxlint-disable effect/noNullish -- a Bun test in an Exact app's folder imports no effect (docs/exact.md). */

/**
 * The port's rail against the current app's (`reader/rail-marks.ts`,
 * `reader/Rail.tsx`): its marks are the current app's `marksOf` over the
 * Sections list's rows, every hymn of every topic in the list's order; at
 * every height of a rail the touch lands on the hymn the current app's
 * band gives; a drag's ticks are one per topic passed; the labels are the
 * current app's six; the measures are Rail.tsx's. The declaration Exact's
 * type check reads is held to the source.
 */

import { describe, expect, it } from 'bun:test';
import * as one from '@manna/hymnal-app/reader/rail-marks';

import { book } from '../hymns/book.ts';
import { rowsOf } from '../list/rows.ts';
import { oneFile } from '../look/design.testing.ts';
import { railSources } from './sources.ts';
import type * as RailDecl from './decl/rail-marks';
import {
  BUBBLE,
  BUBBLE_GAP,
  BUBBLE_RADIUS,
  BUBBLE_WIDTH,
  LABELS,
  type Mark,
  marksOf,
  placesOf,
  THUMB,
  touchAt,
} from './rail.ts';

type Held<T> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? { bivariant(...args: P): R }['bivariant']
    : T[K];
};

const held = {
  GUTTER: one.GUTTER,
  LABEL_SIZE: one.LABEL_SIZE,
  LABEL_LINE: one.LABEL_LINE,
  LABEL_SCALE: one.LABEL_SCALE,
  labelAt: one.labelAt,
  markAt: one.markAt,
  crossings: one.crossings,
  labelsOf: one.labelsOf,
  marksOf: one.marksOf,
} satisfies Held<typeof RailDecl>;

/** The Sections list's rows as the current app lays them: a topic's row at each run of one topic, then its hymns (`reader/rows.ts`'s `rowsOf`, no shelves). */
const oneRows = () => {
  const rows: Array<object> = [];
  let topic: string | undefined;
  for (const hymn of book.hymns) {
    if (hymn.topic !== topic) {
      topic = hymn.topic;
      rows.push({ kind: 'topic', key: `topic-${hymn.number}`, name: hymn.topic });
    }
    rows.push({ kind: 'hymn', key: `${hymn.number}`, hymn, source: [], favourite: false });
  }
  return rows as unknown as Parameters<typeof one.marksOf>[0];
};

const theirs = one.marksOf(oneRows(), 0, () => 1);
const ours = marksOf(rowsOf(book, ''));

describe('the rail’s marks', () => {
  it('are the current app’s: each hymn of the topics, in the list’s order, with its topic’s place', () => {
    expect(ours.length).toBe(book.hymns.length);
    expect(ours.map((mark) => [mark.number, mark.section])).toEqual(
      theirs.map((mark) => [mark.number, mark.section]),
    );
  });
});

describe('a touch on the rail', () => {
  it('lands on the hymn of the current app’s band, at every height of rails of several lengths', () => {
    for (const length of [320, 517, 640.5, 812]) {
      for (let y = -20; y <= length + 20; y += 0.5) {
        const at = touchAt(ours, -1, y, length);
        const band = one.markAt(y, length, theirs.length);
        expect(at.at).toBe(band);
        expect(at.number).toBe(theirs[band]?.number ?? -1);
        expect(at.y).toBe(Math.min(length, Math.max(0, y)));
      }
    }
  });

  it('lands on every mark at its band’s middle', () => {
    const length = 700;
    ours.forEach((mark, place) => {
      const y = ((place + 0.5) / ours.length) * length;
      expect(touchAt(ours, -1, y, length).number).toBe(mark.number);
    });
  });

  it('names the topic of the hymn under it, by the list’s own section', () => {
    const sections = rowsOf(book, '');
    const at = touchAt(ours, -1, 350, 700);
    expect(at.section).toBe(sections[ours[at.at]?.section ?? -1]?.name ?? '');
  });

  it('lands nowhere on a list with no hymns', () => {
    expect(touchAt([], -1, 10, 100)).toEqual({ at: -1, number: 0, section: '', y: 10, ticks: 0 });
  });
});

/** The ticks of a drag through `ys`, as the rail sends each move from the hymn it last showed. */
const ticksOf = (marks: ReadonlyArray<Mark>, ys: ReadonlyArray<number>, length: number) => {
  let shown = -1;
  let ticks = 0;
  for (const y of ys) {
    const at = touchAt(marks, shown, y, length);
    if (at.at !== shown) {
      ticks += at.ticks;
      shown = at.at;
    }
  }
  return { ticks, shown };
};

describe('a drag’s ticks', () => {
  it('are one per topic passed, down the whole rail and back, at any step', () => {
    const topics = new Set(ours.map((mark) => mark.section)).size;
    for (const step of [1, 7, 45, 300]) {
      const down = Array.from({ length: Math.ceil(700 / step) + 1 }, (_, i) =>
        Math.min(700, i * step),
      );
      const { ticks } = ticksOf(ours, [...down, ...down.toReversed()], 700);
      expect(ticks).toBe(2 * (topics - 1));
    }
  });

  it('are none for a touch’s first hymn, and none within one topic', () => {
    expect(touchAt(ours, -1, 600, 700).ticks).toBe(0);
    const first = ours.findIndex((mark) => mark.section === 1);
    expect(touchAt(ours, 0, ((first - 0.5) / ours.length) * 700, 700).ticks).toBe(0);
  });

  it('count every topic a jump passes, as the current app’s `crossings`', () => {
    const from = 0;
    const to = touchAt(ours, from, 699, 700);
    expect(to.ticks).toBe(one.crossings(ours[from]?.section ?? 0, ours.at(-1)?.section ?? 0));
  });
});

describe('the rail’s labels and measures', () => {
  it('are the current app’s six labels at their bands’ middles', () => {
    const places = placesOf(ours);
    const indices = one.labelsOf(theirs.length, LABELS);
    expect(places.labels).toEqual(
      indices.map((index) => ({
        number: theirs[index]?.number ?? -1,
        top: one.labelAt(index, theirs.length),
      })),
    );
    expect(places.gutter).toBe(one.GUTTER);
    expect(places.labelMost).toBe(one.LABEL_SIZE * one.LABEL_SCALE);
    expect(places.lineMost).toBe(one.LABEL_LINE * one.LABEL_SCALE);
  });

  it('are Rail.tsx’s, as written there', () => {
    const rail = oneFile('src/reader/Rail.tsx');
    expect(rail).toContain(`const LABELS = ${LABELS};`);
    expect(rail).toContain(`const THUMB = ${THUMB};`);
    expect(rail).toContain(`const BUBBLE = ${BUBBLE};`);
    expect(rail).toContain(`maxWidth: ${BUBBLE_WIDTH},`);
    expect(rail).toContain(`borderRadius: ${BUBBLE_RADIUS},`);
    expect(rail).toContain(`right: GUTTER + ${BUBBLE_GAP},`);
  });

  it('hold the declaration to the source', () => {
    expect(Object.keys(held).length).toBe(9);
  });
});

describe('the sources', () => {
  it('answer the places and a touch from the book’s Sections', () => {
    const sources = railSources(book);
    expect(sources.railPlaces().labels.length).toBe(LABELS);
    expect(sources.railTo([-1, 0, 500]).number).toBe(ours[0]?.number ?? -1);
    expect(sources.railTo([-1, 500, 500]).number).toBe(ours.at(-1)?.number ?? -1);
  });
});
