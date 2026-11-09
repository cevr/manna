/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTernary -- a React screen test: it plays devices through the bar rig's promise-based taps and reads happy-dom nodes whose absent attributes are null. */

/**
 * The field as home A lays it out, in light and in dark, through the bar
 * rig (`src/test/bar-rig.tsx`), which holds every frame to home A's rules
 * (`homeFaults`) beside its own, over a reader who holds a passage. Each
 * case names its expected values written out: the bar, the scroll view and
 * the foot and what each holds; the choice of a verse that lies in two
 * furrows, let go and moved; `Start here` only where a tap there starts
 * something (a planted verse, never a verse not planted on the day of a
 * planting), and Today showing that verse after it; `Begin` then leading to
 * Today as the run stands; nothing written by any of it; and no add, remove
 * or limit line over unread passages. The dot and the greeting, which turn
 * on the clock, are `clock.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';

import { mountBar } from '../test/bar-rig';
import { recallOf } from '../test/field-model';
import { footOf, iconOf, nameOf, record, scrolled, selectedPlants, text } from '../test/field-rig';
import { setSystem, systemScheme } from '../test/look';
import { device } from '../test/one';
import { KEY, storedText } from '../test/passages-model';
import type { Scheme } from '../theme';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = Date.UTC(2026, 10, 5);
const CONTROLS = '[role="button"],[role="radio"]';
const HINT = 'A gold dot marks a plant ready today. Tap one to start there.';
const HELD = storedText([{ book: 23, chapter: 41, first: 10, last: 12 }]);

/** Where a node sits: the foot, the scroll view, or the bar above it. */
const placeOf = (node: Element) => {
  if (node.closest('[data-testid="foot"]') !== null) return 'foot';
  return scrolled(node) ? 'scroll' : 'bar';
};

const by = (host: Element, id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];

/** Each node of testID `id` as `<place>:<text>`. */
const placed = (host: Element, id: string) =>
  by(host, id).map((node) => `${placeOf(node)}:${text(node)}`);

/** The field as home A lays it out: what the bar, the scroll view and the foot each hold. */
const layoutOf = (host: Element) => {
  const controls = [...host.querySelectorAll(CONTROLS)];
  const greeting = by(host, 'greeting')[0];
  const legend = by(host, 'row').at(-1)?.parentElement?.lastElementChild ?? undefined;
  return {
    bar: controls.filter((node) => placeOf(node) === 'bar').map(nameOf),
    scroll: {
      greeting: placed(host, 'greeting'),
      greetingIcon: iconOf(greeting?.querySelector('img')),
      headings: [...host.querySelectorAll('[role="heading"]')].map(
        (node) => `${placeOf(node)}:${text(node)}`,
      ),
      readouts: ['sown', 'harvest', 'hint'].map((id) => placed(host, id)),
      rows: by(host, 'row').map((row) => ({
        place: placeOf(row),
        icon: iconOf(row.querySelector('[data-testid="furrow-icon"] img')),
        title: text(row.querySelector('[data-testid="row-title"]')),
        ripe: text(row.querySelector('[data-testid="ripe"]')),
        controls: [...row.querySelectorAll(CONTROLS)]
          .filter((node) => node.getAttribute('data-testid') !== 'field-plant')
          .map(nameOf),
        plants: by(row, 'field-plant').map(nameOf),
      })),
      add: by(host, 'add-row').map((node) => `${placeOf(node)}:${nameOf(node)}`),
      legend: [...(legend?.querySelectorAll('img') ?? [])].map(iconOf),
      legendPlace: legend === undefined ? '<none>' : placeOf(legend),
      caption: text(legend?.lastElementChild),
    },
    foot: {
      cards: [...placed(host, 'begin-card'), ...placed(host, 'chosen')],
      controls: controls.filter((node) => placeOf(node) === 'foot').map(nameOf),
    },
  };
};

const SCHEMES: readonly Scheme[] = ['light', 'dark'];

for (const scheme of SCHEMES)
  describe(`home A's field in ${scheme}`, () => {
    it('lays out the bar, the scroll view and the foot, and lets a verse in two furrows be chosen, let go, moved and started there, then Begin go on with it, writing nothing', async () => {
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
        bar: ['When I need…', 'Settings', 'Add verses'],
        scroll: {
          greeting: ['scroll:Good afternoon'],
          greetingIcon: 'sun',
          headings: ['scroll:Your field'],
          readouts: [['scroll:1 day sown'], ['scroll:0 verses at full corn'], [`scroll:${HINT}`]],
          rows: [
            {
              place: 'scroll',
              icon: 'bow',
              title: 'Isaiah 41:10',
              ripe: '0 of 1 ripe',
              controls: [],
              plants: ['Isaiah 41:10, seed'],
            },
            {
              place: 'scroll',
              icon: 'scroll',
              title: 'Isaiah 41:10-12',
              ripe: '0 of 3 ripe',
              controls: ['Remove Isaiah 41:10-12'],
              plants: ['Isaiah 41:10, seed', 'Isaiah 41:11, seed', 'Isaiah 41:12, not planted'],
            },
          ],
          add: ['scroll:Add verses'],
          legend: ['seed', 'blade', 'ear', 'corn'],
          legendPlace: 'scroll',
          caption: 'Mark 4:28',
        },
        foot: { cards: ['foot:Nothing to tend now'], controls: [] },
      });
      expect(by(host, 'dot')).toEqual([]);

      await rig.tap('Isaiah 41:10, seed');
      expect([selectedPlants(host), footOf(host)]).toEqual([
        ['Isaiah 41:10, seed', 'Isaiah 41:10, seed'],
        {
          card: 'chosen',
          line: 'Isaiah 41:10 · a seed',
          controls: ['Start here with Isaiah 41:10'],
        },
      ]);
      await rig.tap('Isaiah 41:10, seed', 1);
      expect([selectedPlants(host), footOf(host)]).toEqual([
        [],
        { card: 'begin-card', line: 'Nothing to tend now', controls: [] },
      ]);
      await rig.tap('Isaiah 41:12, not planted');
      expect([selectedPlants(host), footOf(host)]).toEqual([
        ['Isaiah 41:12, not planted'],
        { card: 'chosen', line: 'Isaiah 41:12 · not planted yet', controls: [] },
      ]);
      await rig.tap('Isaiah 41:11, seed');
      expect([selectedPlants(host), footOf(host)]).toEqual([
        ['Isaiah 41:11, seed'],
        {
          card: 'chosen',
          line: 'Isaiah 41:11 · a seed',
          controls: ['Start here with Isaiah 41:11'],
        },
      ]);

      await rig.tap('Start here with Isaiah 41:11');
      const today = () =>
        [
          text(host.querySelector('[role="heading"]')),
          text(host.querySelector('[data-testid="reference"]')),
          rig.control('Say it') !== undefined,
        ].join('|');
      expect(await rig.until(() => today() === 'Today|Isaiah 41:11|true')).toBe(true);
      await rig.tap('Your field');
      expect(await rig.until(() => footOf(host).controls.includes('Begin'))).toBe(true);
      await rig.tap('Begin');
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
        add: names.filter((name) => name === 'Add verses'),
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
