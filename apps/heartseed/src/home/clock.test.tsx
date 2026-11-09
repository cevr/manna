/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTryCatch -- a React screen test: it plays devices through the field rig's promise-based taps, reads happy-dom nodes whose absent attributes are null, and sets the host's zone through `process.env.TZ`, put back even when a case throws (to UTC, bun test's own zone, when it was unset: an unset `TZ` would leave the cases after it in the host machine's zone). */

/**
 * The parts of home A's field that turn on the clock, in light and in dark,
 * through the field rig (`src/test/field-rig.tsx`), which holds every frame
 * to home A's rules (`homeFaults`) and to the rule's field over the disk.
 * Each case names its expected values written out: the gold dot on a seed
 * at its due once the Minutes radio in the Settings sheet (from Today,
 * reached by `Start here`, by `Your field`) makes the plan again and on no
 * plant before, filled `sun` at 3:1 against its plant's backdrop chosen or not,
 * and `gold` nowhere on the field; the Begin card's counts and `Begin`
 * leading to Today as the run stands, writing nothing; and the greeting by
 * the runtime's clock at each mount of home, in the reader's own zone. The layout
 * and the choice are `screen.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { fillContrastOf } from '../test/contrast';
import { recallOf } from '../test/field-model';
import { footOf, iconOf, mount, nameOf, record, selectedPlants, text } from '../test/field-rig';
import { computed, setSystem } from '../test/look';
import { device } from '../test/one';
import { hostZone, travel } from '../test/zone';
import { theme, type Scheme } from '../theme';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = Date.UTC(2026, 10, 5);

const by = (host: Element, id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];

/** Every painted colour under `host`: fill, ink and border. */
const paintsOf = (host: Element) =>
  new Set(
    [...host.querySelectorAll('*')].flatMap((node) => {
      const style = getComputedStyle(node);
      return [style.backgroundColor, style.color, style.borderTopColor];
    }),
  );

/** The greeting shown: its words and its icon. */
const greeted = () => {
  const greeting = by(document.body, 'greeting')[0];
  return [text(greeting), iconOf(greeting?.querySelector('img'))];
};

/** Opens home again, by When I need… and its back `Your field`, so home mounts anew. */
const reopen = async (app: Awaited<ReturnType<typeof mount>>) => {
  await app.tap('When I need…');
  expect(await app.until(() => app.headings().join('|') === 'When I need…')).toBe(true);
  await app.tap('Your field');
  expect(await app.until(app.home)).toBe(true);
};

const SCHEMES: readonly Scheme[] = ['light', 'dark'];

for (const scheme of SCHEMES)
  describe(`home A's field by the clock in ${scheme}`, () => {
    it('marks a seed at its due after a Minutes tap with a gold dot filled sun, at 3:1 against its plant chosen or not, and its Begin leads to Today writing nothing', async () => {
      setSystem(scheme);
      const time = { now: DAY + 9 * HOUR };
      device.launch([
        record(recallOf(passage.reference, time.now - MINUTE, 3, 0)),
        ['heartseed/voice/enabled', 'false'],
      ]);
      const app = await mount(true, undefined, time);
      expect(await app.until(app.home)).toBe(true);
      const host = document.body;
      expect([by(host, 'field-plant').map(nameOf), by(host, 'dot').length]).toEqual([
        [`${passage.reference}, seed`],
        0,
      ]);
      await app.tap(`${passage.reference}, seed`);
      await app.tap(`Start here with ${passage.reference}`);
      expect(
        await app.until(() => app.headings().includes('Today') && app.buttons().includes('Say it')),
      ).toBe(true);

      expect(await app.renew()).toBe(1);
      await app.field();
      const ready = `${passage.reference}, seed, ready today`;
      const dots = by(host, 'dot');
      expect([by(host, 'field-plant').map(nameOf), dots.length]).toEqual([[ready], 1]);
      const dot = dots[0] ?? host;
      expect(getComputedStyle(dot).backgroundColor).toBe(computed(theme[scheme].sun));
      expect(fillContrastOf(dot)).toBeGreaterThanOrEqual(3);
      expect(footOf(host)).toEqual({
        card: 'begin-card',
        line: '1 to tend · about 1 min',
        controls: ['Begin'],
      });
      await app.tap(ready);
      expect(selectedPlants(host)).toEqual([ready]);
      expect(fillContrastOf(by(host, 'dot')[0] ?? host)).toBeGreaterThanOrEqual(3);
      const gold = computed(theme[scheme].gold);
      const goldAlone = gold !== computed(theme[scheme].sun);
      expect(goldAlone && paintsOf(host).has(gold)).toBe(false);
      await app.tap(ready);
      expect(selectedPlants(host)).toEqual([]);

      const sets = device.calls.set;
      await app.tap('Begin');
      expect(await app.until(() => app.headings().includes('Today'))).toBe(true);
      await app.until(() => false, 8);
      expect([
        text(host.querySelector('[data-testid="reference"]')),
        app.buttons().includes('Say it'),
        device.calls.set - sets,
        app.faults,
      ]).toEqual([passage.reference, true, 0, []]);
      expect(await app.leave()).toEqual([]);
    });

    it('greets by the runtime clock at each open, in the reader’s own zone', async () => {
      setSystem(scheme);
      const time = { now: DAY + 11 * HOUR + 59 * MINUTE };
      device.launch([
        record(recallOf(passage.reference, DAY - 2 * HOUR, 3, 0)),
        ['heartseed/voice/enabled', 'false'],
      ]);
      const app = await mount(true, undefined, time);
      expect(await app.until(app.home)).toBe(true);
      expect(greeted()).toEqual(['Good morning', 'sun']);
      time.now = DAY + 12 * HOUR;
      await reopen(app);
      expect(greeted()).toEqual(['Good afternoon', 'sun']);
      time.now = DAY + 18 * HOUR;
      await reopen(app);
      expect(greeted()).toEqual(['Good evening', 'moon']);
      expect(app.faults).toEqual([]);
      expect(await app.leave()).toEqual([]);

      const zone = hostZone();
      travel('Asia/Kolkata');
      try {
        device.launch();
        const away = await mount(true, undefined, { now: DAY + 10 * HOUR });
        expect(await away.until(away.home)).toBe(true);
        expect(greeted()).toEqual(['Good afternoon', 'sun']);
        expect(away.faults).toEqual([]);
        expect(await away.leave()).toEqual([]);
      } finally {
        travel(zone ?? 'UTC');
      }
    });
  });
