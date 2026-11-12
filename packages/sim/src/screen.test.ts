/**
 * The screen as `sim read` and `sim scroll` read it (`screen.ts`), over
 * snapshots of Heartseed's chooser (`fixtures/screens.ts`): a scroll pans
 * inside the verses' view, never across the fixed footer agent-device's own
 * swipe starts on; it sees whether the content moved and whether more is
 * hidden; a target shows only when its centre is on screen and hittable;
 * and the readout carries numbers, states and the asked names alone.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Schema } from 'effect';

import { chooser, snapshotOf, VERSES } from './fixtures/screens.ts';
import { areaFor, hides, moved, type Node, nodesOf, panFor, readout, shows } from './screen.ts';

const area = (nodes: ReadonlyArray<Node>, direction: 'up' | 'down' | 'left' | 'right') =>
  Option.getOrThrow(areaFor(nodes, direction));

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const label = (value: string) => ({ by: 'label' as const, value, role: Option.none<string>() });

/** A horizontal pager whose page holds a vertical scroll view, as the hymnal's reader is. */
const pager: ReadonlyArray<Node> = [
  { index: 0, type: 'Application', rect: { x: 0, y: 0, width: 402, height: 874 } },
  { index: 1, parentIndex: 0, type: 'ScrollView', rect: { x: 0, y: 0, width: 402, height: 874 } },
  { index: 2, parentIndex: 1, type: 'Other', rect: { x: -402, y: 0, width: 1206, height: 874 } },
  { index: 3, parentIndex: 2, type: 'ScrollView', rect: { x: 0, y: 116, width: 402, height: 668 } },
  { index: 4, parentIndex: 3, type: 'Other', rect: { x: 0, y: 116, width: 402, height: 2400 } },
  {
    index: 5,
    parentIndex: 2,
    type: 'ScrollView',
    rect: { x: 402, y: 116, width: 402, height: 668 },
  },
  { index: 6, parentIndex: 5, type: 'Other', rect: { x: 402, y: 116, width: 402, height: 2400 } },
];

describe('the screen a scroll pans', () => {
  it.effect(
    'a scroll down pans inside the verses, from inside the view, never from the footer',
    () =>
      Effect.sync(() => {
        const verses = area(chooser(0), 'down');
        expect(verses.frame).toEqual(VERSES);
        const pan = panFor(verses, 'down');
        for (const y of [pan.y, pan.y + pan.dy]) {
          expect(y).toBeGreaterThan(VERSES.y);
          expect(y).toBeLessThan(VERSES.y + VERSES.height);
        }
        expect(pan.dy).toBeLessThan(0);
        expect(pan.dx).toBe(0);
      }),
  );

  it.effect('each direction pans the opposite way, within the visible view', () =>
    Effect.sync(() => {
      const verses = area(chooser(1000), 'up');
      const up = panFor(verses, 'up');
      expect(up.dy).toBeGreaterThan(0);
      expect(up.y + up.dy).toBeLessThan(VERSES.y + VERSES.height);
      const page = area(pager, 'right');
      const right = panFor(page, 'right');
      const left = panFor(page, 'left');
      expect(right.dx).toBeLessThan(0);
      expect(left.dx).toBeGreaterThan(0);
      for (const x of [right.x, right.x + right.dx, left.x, left.x + left.dx]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(402);
      }
    }),
  );

  it.effect(
    'a vertical scroll takes the page on screen, a sideways one the pager; none when nothing overflows',
    () =>
      Effect.sync(() => {
        expect(area(pager, 'down').frame).toEqual({ x: 0, y: 116, width: 402, height: 668 });
        expect(area(pager, 'right').frame).toEqual({ x: 0, y: 0, width: 402, height: 874 });
        expect(Option.isNone(areaFor(chooser(0), 'right'))).toBe(true);
        expect(Option.isNone(areaFor([], 'down'))).toBe(true);
      }),
  );

  it.effect('the content moved when the same view shows it elsewhere, or the view is gone', () =>
    Effect.sync(() => {
      const before = area(chooser(0), 'down');
      expect(moved(before, chooser(0), 'down')).toBe(false);
      expect(moved(before, chooser(317), 'down')).toBe(true);
      expect(moved(before, pager, 'down')).toBe(true);
    }),
  );

  it.effect('more is hidden below until the content ends, and above once it scrolled', () =>
    Effect.sync(() => {
      const top = area(chooser(0), 'down');
      expect(hides(top, 'down')).toBe(true);
      expect(hides(top, 'up')).toBe(false);
      const end = area(chooser(8 + 176 * 88 - VERSES.height), 'down');
      expect(hides(end, 'down')).toBe(false);
      expect(hides(end, 'up')).toBe(true);
    }),
  );

  it.effect('a target shows when its centre is on screen and the tree calls it hittable', () =>
    Effect.sync(() => {
      expect(shows(chooser(0), label('Psalms 119:1'))).toBe(true);
      expect(shows(chooser(0), label('Psalms 119:30'))).toBe(false);
      expect(shows(chooser(29 * 88 - 200), label('Psalms 119:30'))).toBe(true);
      expect(shows(chooser(0), { ...label('Plant'), role: Option.some('button') })).toBe(true);
      expect(shows(chooser(0), { ...label('Plant'), role: Option.some('link') })).toBe(false);
      expect(shows(chooser(0), { by: 'id', value: 'verse', role: Option.none() })).toBe(true);
    }),
  );
});

describe('the readout', () => {
  it.effect(
    'decodes the raw snapshot, and gives counts, frames and states by the asked ids and names',
    () =>
      Effect.gen(function* () {
        const nodes = yield* nodesOf(snapshotOf(chooser(0)));
        const seen = readout(nodes, { ids: ['verse*', 'none'], labels: ['Plant', 'Psalms 119:2'] });
        expect(seen.nodes).toBe(nodes.length);
        expect(seen.types).toEqual({
          Application: 1,
          Window: 1,
          Button: 2,
          ScrollView: 1,
          Other: 177,
        });
        expect(seen.ids['verse*']).toHaveLength(176);
        expect(seen.ids['none']).toEqual([]);
        expect(seen.ids['verse*']?.[0]).toMatchObject({
          id: 'verse',
          type: 'Other',
          frame: [24, 183, 354, 72],
          shown: true,
          hittable: true,
          checked: false,
          value: [],
        });
        expect(seen.labels['Plant']).toMatchObject([{ type: 'Button', frame: [24, 772, 354, 56] }]);
        expect(seen.labels['Psalms 119:2']).toHaveLength(1);
      }),
  );

  it.effect("carries no name the caller did not ask, and a value's digits alone", () =>
    Effect.sync(() => {
      const words = 'unasked words of the app';
      const nodes: ReadonlyArray<Node> = [
        ...chooser(0),
        { type: 'StaticText', identifier: 'line-1', label: words, value: `${words} 12 of 30` },
      ];
      const text = encodeJson(readout(nodes, { ids: ['line-*'], labels: ['Plant'] }));
      expect(text).not.toContain('unasked');
      expect(text).not.toContain('Psalms');
      expect(text).toContain('"value":[12,30]');
    }),
  );
});
