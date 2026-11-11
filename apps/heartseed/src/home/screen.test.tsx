/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTernary -- a React screen test: it plays devices through the bar rig's promise-based taps and reads happy-dom nodes whose absent attributes are null. */

/**
 * The field as home lays it out (hsstart T3), in light and in dark, through
 * the bar rig (`src/test/bar-rig.tsx`), which holds every frame to home's
 * rules (`homeFaults`) beside its own, over a reader who holds a passage.
 * Each case names its expected values written out: what the fixed top and
 * the scroll view each hold, the Today card with `Practice anyway` when
 * nothing is due; the choice of a verse that lies in two furrows, let go
 * and moved; `Practice <reference>` on a planted verse and `Learn
 * <reference>` on one not planted, and Today showing the practiced verse
 * after it; `Start` then leading to Today as the run stands; nothing
 * written by any of it; and no add, remove or limit line over unread
 * passages. The dot and the greeting, which turn
 * on the clock, are `clock.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';

import { mountBar } from '../test/bar-rig';
import { recallOf } from '../test/field-model';
import { cardOf, iconOf, nameOf, record, scrolled, selectedPlants, text } from '../test/field-rig';
import { setSystem, systemScheme } from '../test/look';
import { device } from '../test/one';
import { KEY, storedText } from '../test/passages-model';
import type { Scheme } from '../theme';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = Date.UTC(2026, 10, 5);
const CONTROLS = '[role="button"],[role="radio"]';
const HELD = storedText([{ book: 23, chapter: 41, first: 10, last: 12 }]);

/** Where a node sits: the scroll view, or the top fixed above it. */
const placeOf = (node: Element) => (scrolled(node) ? 'scroll' : 'top');

const by = (host: Element, id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];

/** Each node of testID `id` as `<place>:<text>`. */
const placed = (host: Element, id: string) =>
  by(host, id).map((node) => `${placeOf(node)}:${text(node)}`);

/** The field as home lays it out: what the fixed top and the scroll view each hold. */
const layoutOf = (host: Element) => {
  const controls = [...host.querySelectorAll(CONTROLS)];
  const greeting = by(host, 'greeting')[0];
  const legend = by(host, 'legend')[0];
  return {
    top: {
      greeting: placed(host, 'greeting'),
      greetingIcon: iconOf(greeting?.querySelector('img')),
      cards: [...placed(host, 'today-card'), ...placed(host, 'chosen')],
      controls: controls.filter((node) => placeOf(node) === 'top').map(nameOf),
    },
    scroll: {
      headings: [...host.querySelectorAll('[role="heading"]')].map(
        (node) => `${placeOf(node)}:${text(node)}`,
      ),
      readouts: ['sown', 'harvest'].map((id) => placed(host, id)),
      add: by(host, 'add-list').map((node) => `${placeOf(node)}:${nameOf(node)}`),
      rows: by(host, 'row').map((row) => ({
        place: placeOf(row),
        icon: iconOf(row.querySelector('[data-testid="furrow-icon"] img')),
        title: text(row.querySelector('[data-testid="row-title"]')),
        caption: text(row.querySelector('[data-testid="caption"]')),
        controls: [...row.querySelectorAll(CONTROLS)]
          .filter((node) => node.getAttribute('data-testid') !== 'field-plant')
          .map(nameOf),
        plants: by(row, 'field-plant').map(nameOf),
        numbers: by(row, 'field-plant').filter((plant) => /\d/u.test(text(plant))).length,
      })),
      legend: [...(legend?.querySelectorAll('img') ?? [])].map(iconOf),
      legendPlace: legend === undefined ? '<none>' : placeOf(legend),
      caption: text(legend?.lastElementChild),
      ends: controls
        .filter((node) => placeOf(node) === 'scroll')
        .map(nameOf)
        .slice(-2),
    },
  };
};

const SCHEMES: readonly Scheme[] = ['light', 'dark'];

for (const scheme of SCHEMES)
  describe(`home A's field in ${scheme}`, () => {
    it('lays out the fixed top and the scroll view, and lets a verse in two furrows be chosen, let go, moved and practiced there, then Start go on with it, writing nothing', async () => {
      setSystem(scheme);
      expect(systemScheme()).toBe(scheme);
      const time = { now: DAY + 15 * HOUR };
      const planted = time.now - 2 * MINUTE;
      device.launch([
        record(recallOf('Isaiah 41:10', planted, 3, 0)),
        record(recallOf('Isaiah 41:11', planted + 1, 3, 0)),
        [KEY, HELD],
        ['heartseed/voice/enabled', 'false'],
      ]);
      const rig = await mountBar(0, false, null, time);
      const host = rig.host;
      const sets = device.calls.set;
      expect(await rig.until(() => by(host, 'row').length === 2)).toBe(true);
      expect(layoutOf(host)).toEqual({
        top: {
          greeting: ['top:Good afternoon'],
          greetingIcon: 'sun',
          cards: ['top:All tended for todayNothing is due right now.Practice anyway'],
          controls: ['Practice anyway'],
        },
        scroll: {
          headings: ['scroll:Your field'],
          readouts: [['scroll:1 day sown'], ['scroll:0 verses at full corn']],
          add: ['scroll:Add a list'],
          rows: [
            {
              place: 'scroll',
              icon: 'bow',
              title: 'Isaiah 41:10',
              caption: '1 verse · 1 planted',
              controls: [],
              plants: ['Isaiah 41:10, seed'],
              numbers: 0,
            },
            {
              place: 'scroll',
              icon: 'scroll',
              title: 'Isaiah 41:10-12',
              caption: '3 verses · 2 planted',
              controls: ['Remove Isaiah 41:10-12'],
              plants: ['Isaiah 41:10, seed', 'Isaiah 41:11, seed', 'Isaiah 41:12, not planted'],
              numbers: 0,
            },
          ],
          legend: ['seed', 'blade', 'ear', 'corn'],
          legendPlace: 'scroll',
          caption: 'Mark 4:28',
          ends: ['Settings', 'How Heartseed works'],
        },
      });
      expect(by(host, 'dot')).toEqual([]);

      await rig.tap('Isaiah 41:10, seed');
      expect([selectedPlants(host), cardOf(host)]).toEqual([
        ['Isaiah 41:10, seed', 'Isaiah 41:10, seed'],
        { card: 'chosen', line: 'Isaiah 41:10 · a seed', controls: ['Practice Isaiah 41:10'] },
      ]);
      await rig.tap('Isaiah 41:10, seed', 1);
      expect([selectedPlants(host), cardOf(host)]).toEqual([
        [],
        {
          card: 'today-card',
          line: 'All tended for today | Nothing is due right now.',
          controls: ['Practice anyway'],
        },
      ]);
      await rig.tap('Isaiah 41:12, not planted');
      expect([selectedPlants(host), cardOf(host)]).toEqual([
        ['Isaiah 41:12, not planted'],
        {
          card: 'chosen',
          line: 'Isaiah 41:12 · not planted yet',
          controls: ['Learn Isaiah 41:12'],
        },
      ]);
      await rig.tap('Isaiah 41:11, seed');
      expect([selectedPlants(host), cardOf(host)]).toEqual([
        ['Isaiah 41:11, seed'],
        { card: 'chosen', line: 'Isaiah 41:11 · a seed', controls: ['Practice Isaiah 41:11'] },
      ]);

      await rig.tap('Practice Isaiah 41:11');
      const today = () =>
        [
          text(host.querySelector('[role="heading"]')),
          text(host.querySelector('[data-testid="reference"]')),
          rig.control('Say it') !== undefined,
        ].join('|');
      expect(await rig.until(() => today() === 'Today|Isaiah 41:11|true')).toBe(true);
      await rig.tap('Your field');
      expect(await rig.until(() => cardOf(host).controls.includes('Start'))).toBe(true);
      await rig.tap('Start');
      expect(await rig.until(() => today() === 'Today|Isaiah 41:11|true')).toBe(true);
      await rig.until(() => false, 8);
      expect([device.calls.set - sets, rig.faults]).toEqual([0, []]);
      await rig.leave();
    });

    it('offers no add, no remove and no limit line over unread passages', async () => {
      setSystem(scheme);
      device.launch([
        record(recallOf('Isaiah 41:10', DAY - 2 * HOUR, 3, 0)),
        [KEY, HELD],
        ['heartseed/voice/enabled', 'false'],
      ]);
      const rig = await mountBar(3, true, null, { now: DAY + 15 * HOUR });
      expect(await rig.until(() => by(rig.host, 'row').length > 0)).toBe(true);
      const names = [...rig.host.querySelectorAll(CONTROLS)].map(nameOf);
      expect({
        add: names.filter((name) => name === 'Add a list'),
        remove: names.filter((name) => name.startsWith('Remove')),
        limit: by(rig.host, 'limit').length,
        rows: by(rig.host, 'row').map((row) =>
          text(row.querySelector('[data-testid="row-title"]')),
        ),
        faults: rig.faults,
      }).toEqual({ add: [], remove: [], limit: 0, rows: ['Isaiah 41:10'], faults: [] });
      await rig.leave();
    });
  });
