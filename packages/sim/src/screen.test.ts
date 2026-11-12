/**
 * The screen as `sim read` and `sim scroll` read it (`screen.ts`), over
 * snapshots of Heartseed's chooser and the hymnal's hymn page
 * (`fixtures/screens.ts`): a scroll pans inside the verses' view, never
 * across the fixed footer agent-device's own swipe starts on, and in the
 * frontmost view, a sheet over a page; it sees whether the content of that
 * same view moved, though a pager shares the page's frame, and whether more
 * is hidden; a target shows only when its centre is on screen and hittable;
 * and the readout carries numbers, states and the asked names alone.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Schema } from 'effect';

import { chooser, hymnPage, PAGE, SHEET, snapshotOf, VERSES } from './fixtures/screens.ts';
import {
  type Area,
  areaFor,
  hides,
  moved,
  type Node,
  nodesOf,
  panFor,
  readout,
  settled,
  shows,
} from './screen.ts';

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

  it.effect('a node the tree calls hittable whose centre lies off screen does not show', () =>
    Effect.sync(() => {
      const below: Node = {
        type: 'Button',
        label: 'Far',
        rect: { x: 24, y: 900, width: 354, height: 52 },
        hittable: true,
      };
      const across: Node = {
        ...below,
        label: 'Beside',
        rect: { x: 420, y: 400, width: 354, height: 52 },
      };
      expect(shows([...chooser(0), below, across], label('Far'))).toBe(false);
      expect(shows([...chooser(0), below, across], label('Beside'))).toBe(false);
    }),
  );
});

/** A small seeded generator, so each property's cases are the same on every run. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return (below: number) => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296) * below);
  };
};

const CASES = 200;

describe('the scroll view on the hymnal’s screens', () => {
  it.effect(
    'on a hymn page, a pan that moved the page is seen, though the pager shares its frame',
    () =>
      Effect.sync(() => {
        const page = area(hymnPage(116), 'down');
        expect(page.frame).toEqual(PAGE);
        expect(moved(page, hymnPage(116), 'down')).toBe(false);
        expect(moved(page, hymnPage(-506), 'down')).toBe(true);
      }),
  );

  it.effect('the page is at rest only once two looks find its content in one place', () =>
    Effect.sync(() => {
      const page = area(hymnPage(116), 'down');
      expect(settled(page, hymnPage(-400), hymnPage(-450), 'down')).toBe(false);
      expect(settled(page, hymnPage(-450), hymnPage(-450), 'down')).toBe(true);
      expect(settled(page, hymnPage(-450, Option.some(495)), hymnPage(-450), 'down')).toBe(true);
      expect(settled(page, chooser(0), hymnPage(-450), 'down')).toBe(true);
    }),
  );

  it.effect(
    'with a sheet over the page, a scroll pans the sheet, inside it, and judges the sheet',
    () =>
      Effect.sync(() => {
        const sheet = area(hymnPage(116, Option.some(495)), 'down');
        expect(sheet.frame).toEqual(SHEET);
        const pan = panFor(sheet, 'down');
        for (const y of [pan.y, pan.y + pan.dy]) {
          expect(y).toBeGreaterThan(SHEET.y);
          expect(y).toBeLessThan(SHEET.y + SHEET.height);
        }
        expect(moved(sheet, hymnPage(-506, Option.some(495)), 'down')).toBe(false);
        expect(moved(sheet, hymnPage(116, Option.some(200)), 'down')).toBe(true);
      }),
  );

  it.effect(
    'with a sheet whose content fits over the page, a scroll down owns the sheet and finds it at its end, never the page under it',
    () =>
      Effect.sync(() => {
        const covered = hymnPage(116, Option.some(495), SHEET.height);
        const sheet = area(covered, 'down');
        expect(sheet.frame).toEqual(SHEET);
        expect(hides(sheet, 'down')).toBe(false);
        expect(moved(sheet, hymnPage(-506, Option.some(495), SHEET.height), 'down')).toBe(false);
        expect(area(hymnPage(116), 'down').frame).toEqual(PAGE);
      }),
  );

  it.effect(
    'property: of scroll views nested in one frame, moved names the one whose content moved, and only it, though nodes before them came or went',
    () =>
      Effect.sync(() => {
        const next = seeded(7);
        for (let run = 0; run < CASES; run += 1) {
          const count = 2 + next(4);
          const shifted = next(count);
          const by = 1 + next(600);
          const offset = next(2 * count + 1);
          const screen = (shift: number, extra: number): ReadonlyArray<Node> => [
            { index: 0, type: 'Application', rect: { x: 0, y: 0, width: 402, height: 874 } },
            ...Array.from({ length: extra }, (_, at): Node => ({
              index: 1 + at,
              parentIndex: 0,
              type: 'Other',
              rect: { x: 0, y: 0, width: 402, height: 40 },
            })),
            ...Array.from({ length: count }, (_, level): ReadonlyArray<Node> => [
              {
                index: extra + 1 + level * 2,
                parentIndex: extra + level * 2,
                type: 'ScrollView',
                rect: PAGE,
              },
              {
                index: extra + 2 + level * 2,
                parentIndex: extra + 1 + level * 2,
                type: 'Other',
                rect: { ...PAGE, y: PAGE.y - shift * Number(level === shifted), height: 3000 },
              },
            ]).flat(),
          ];
          const before = screen(0, 0);
          const after = screen(by, offset);
          for (let level = 0; level < count; level += 1) {
            const view: Area = {
              frame: PAGE,
              visible: PAGE,
              content: { ...PAGE, height: 3000 },
              index: 1 + level * 2,
              depth: level,
            };
            expect(moved(view, before, 'down')).toBe(false);
            expect(moved(view, screen(0, offset), 'down')).toBe(false);
            expect(moved(view, after, 'down')).toBe(level === shifted);
          }
        }
      }),
  );

  it.effect(
    'property: the scroll goes to the frontmost view at its pan’s start, its content overflowing or fitting, never to one a later view lies over there',
    () =>
      Effect.sync(() => {
        const next = seeded(11);
        const directions = ['up', 'down', 'left', 'right'] as const;
        let fitting = 0;
        let covered = 0;
        for (let run = 0; run < CASES * 2; run += 1) {
          const direction = directions[next(4)] ?? 'down';
          const vertical = direction === 'up' || direction === 'down';
          const views = Array.from({ length: 2 + next(4) }, (_, at) => {
            const width = 60 + next(342);
            const height = 60 + next(700);
            const rect = { x: next(402 - width + 1), y: next(874 - height + 1), width, height };
            const grows = next(2) === 1;
            const content = {
              ...rect,
              width: width * (1 + 2 * Number(grows && !vertical)),
              height: height * (1 + 2 * Number(grows && vertical)),
            };
            const nested = at > 0 && next(4) === 0;
            return {
              at,
              rect,
              content,
              grows,
              hittable: next(5) > 0,
              parent: Number(nested) * at - 1,
            };
          });
          const nodes: ReadonlyArray<Node> = [
            { index: 0, type: 'Application', rect: { x: 0, y: 0, width: 402, height: 874 } },
            ...views.flatMap((view): ReadonlyArray<Node> => [
              {
                index: 1 + view.at * 2,
                parentIndex: Math.max(0, 2 + view.parent * 2),
                type: 'ScrollView',
                rect: view.rect,
                hittable: view.hittable,
              },
              {
                index: 2 + view.at * 2,
                parentIndex: 1 + view.at * 2,
                type: 'Other',
                rect: view.content,
              },
            ]),
          ];
          const inside = (view: number, outer: number): boolean => {
            const parent = views[view]?.parent ?? -1;
            return parent >= 0 && (parent === outer || inside(parent, outer));
          };
          const growing = views.filter((view) => view.grows);
          const got = areaFor(nodes, direction);
          if (growing.length === 0) {
            expect(Option.isNone(got)).toBe(true);
            continue;
          }
          const chosen = Option.getOrThrow(got);
          const view = (chosen.index - 1) / 2;
          const frontmost = Math.max(...growing.map((each) => each.at));
          expect(view).toBeGreaterThanOrEqual(frontmost);
          const start = panFor(chosen, direction);
          const over = views.filter(
            (other) =>
              other.at > view &&
              other.hittable &&
              !inside(other.at, view) &&
              start.x >= other.rect.x &&
              start.x <= other.rect.x + other.rect.width &&
              start.y >= other.rect.y &&
              start.y <= other.rect.y + other.rect.height,
          );
          expect(over).toEqual([]);
          if (view !== frontmost) {
            expect(views[view]?.hittable).toBe(true);
            expect(inside(view, frontmost)).toBe(false);
          }
          if (!(views[view]?.grows ?? true)) fitting += 1;
          if (view !== frontmost) covered += 1;
        }
        expect(fitting).toBeGreaterThan(20);
        expect(covered).toBeGreaterThan(20);
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
