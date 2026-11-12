/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- a React screen test: it drives the root in happy-dom through React's promise-based `act` over the device's disk, one launch and one tap after another, and reads a node's absent attributes as null. */

/**
 * The ways into and out of home's Settings sheet (more are
 * `ways-b.test.tsx`'s), through the field bar's rig
 * (`src/test/bar-rig.tsx`), each frame held to the root's rule (one
 * `Settings` on home outside the scroll view, none elsewhere) and to the
 * sheet's rule (`src/test/settings-rig.ts`).
 *
 * A list's own page, where a remove is asked (hslist L4), holds no gear;
 * while its remove is pending its way back `Your field` is disabled in
 * every frame, and a tap of it in the remove's turn changes nothing; a
 * remove that does not land leaves its alert on the page, which leaving
 * drops; one that lands shows home without its row, and the gear opens the
 * sheet there. The
 * sheet's `About` shows About, with no appearance and no foot of its own,
 * and no later frame shows the sheet; About's
 * way back shows home with the sheet closed, and a relaunch opens home.
 * `Done` and Escape each close it with home's card and field kept and nothing
 * written. A recital that starts while it is open brings Today, and no
 * sheet is left.
 */

import { useAtomSet } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { press } from '../app';
import { mountBar } from '../test/bar-rig';
import { labelOf, text } from '../test/chooser-rig';
import { recallOf } from '../test/field-model';
import { cardOf, record } from '../test/field-rig';
import { device } from '../test/one';
import { KEY, storedText } from '../test/passages-model';
import {
  closeSettings,
  modalOf,
  openSettings,
  sheetControl,
  tapInSheet,
  watchSheet,
} from '../test/settings-rig';

const CONTROL = '[role="button"],[role="radio"],[role="checkbox"],[role="switch"]';

type Bar = Awaited<ReturnType<typeof mountBar>>;

/** Today's press as the root's registry runs it, caught from a component beside the root. */
interface Presser {
  press: (shown: { readonly piece: typeof passage; readonly item: Option.Option<never> }) => void;
}

const headings = (rig: { readonly host: Element }) =>
  [...rig.host.querySelectorAll('[role="heading"]')].map(text);

const named = (rig: Bar, label: string) =>
  [...rig.host.querySelectorAll(CONTROL)].filter((node) => labelOf(node) === label);

/** A planted verse, so home opens with a plan, beside `extra` records. */
const launchWith = (extra: readonly (readonly [string, string])[] = []) =>
  device.launch([record(recallOf('Made 1:1', Date.UTC(2026, 9, 1), 3, 0)), ...extra]);

/** Waits for home with its gear. */
const toField = async (rig: Bar) => {
  expect(
    await rig.until(
      () => headings(rig).join('|') === 'Your field' && named(rig, 'Settings').length === 1,
    ),
  ).toBe(true);
};

/** What the disk took since `start`. */
const writtenSince = (start: ReadonlyMap<string, string | null>) =>
  [...device.disk].filter(([key, value]) => start.get(key) !== value);

describe('Settings, its ways', () => {
  it('is on no list’s own page, whose way back is disabled while a remove is pending and changes nothing in the remove’s turn; a failed remove’s alert is left behind with the page', async () => {
    launchWith([
      [
        KEY,
        storedText([
          { book: 19, chapter: 23, first: 1, last: 2 },
          { book: 19, chapter: 121, first: 1, last: 2 },
        ]),
      ],
    ]);
    const sheet = watchSheet();
    const seen = { pending: 0, live: 0 };
    const rig = await mountBar(0, false);
    const watch = new MutationObserver(() => {
      if (named(rig, 'Remove')[0]?.getAttribute('aria-disabled') !== 'true') return;
      seen.pending += 1;
      if (named(rig, 'Your field')[0]?.getAttribute('aria-disabled') !== 'true') seen.live += 1;
    });
    watch.observe(rig.host, { subtree: true, childList: true, attributes: true });
    await toField(rig);
    const ask = async (reference: string) => {
      expect(await rig.tap(`Open ${reference}`)).toBe(true);
      expect(await rig.until(() => headings(rig).join('|') === reference)).toBe(true);
      expect(named(rig, 'Settings')).toEqual([]);
      expect(await rig.tap(`Remove ${reference}`)).toBe(true);
      expect(await rig.until(() => named(rig, 'Remove').length === 1)).toBe(true);
    };
    await ask('Psalms 23:1-2');
    device.fail('set', 1);
    expect(await rig.tapBoth('Remove', 'Your field')).toBe(true);
    expect(await rig.until(() => rig.host.querySelector('[role="alert"]') !== null)).toBe(true);
    device.fail('set', 0);
    expect({
      on: headings(rig),
      modal: modalOf(),
      pending: seen.pending > 0,
      live: seen.live,
    }).toEqual({ on: ['Psalms 23:1-2'], modal: null, pending: true, live: 0 });
    expect(await rig.tap('Your field')).toBe(true);
    await toField(rig);
    expect(rig.host.querySelector('[role="alert"]')).toBeNull();

    await ask('Psalms 121:1-2');
    expect(await rig.tapBoth('Remove', 'Your field')).toBe(true);
    await toField(rig);
    expect({
      modal: modalOf(),
      opens: [...rig.host.querySelectorAll(CONTROL)]
        .map(labelOf)
        .filter((label) => label.startsWith('Open ')),
    }).toEqual({
      modal: null,
      opens: [`Open ${passage.reference}`, 'Open Psalms 23:1-2', 'Open Made 1:1'],
    });
    await openSettings(rig);
    expect({
      alert: rig.host.querySelector('[role="alert"]'),
      sheet: sheetControl('Done') !== undefined,
    }).toEqual({ alert: null, sheet: true });
    expect(await closeSettings(rig, 'Done')).toBe(true);
    watch.disconnect();
    sheet.stop();
    expect({ rig: rig.faults, sheet: sheet.faults }).toEqual({ rig: [], sheet: [] });
    await rig.leave();
  });

  it('shows About from its About, never again in a later frame; About’s way back shows home with it closed, and a relaunch opens home', async () => {
    launchWith();
    const start = new Map(device.disk);
    const sheet = watchSheet();
    const rig = await mountBar(0, false);
    await toField(rig);
    await openSettings(rig);
    expect(await tapInSheet('About')).toBe(true);
    expect(await rig.until(() => headings(rig).join('|') === 'About')).toBe(true);
    expect({
      groups: document.querySelectorAll('[role="radiogroup"]').length,
      aboutFoot: document.querySelectorAll('[data-testid="about-foot"]').length,
    }).toEqual({ groups: 0, aboutFoot: 0 });
    const open = sheet.frames.open;
    expect(await rig.tap('Your field')).toBe(true);
    expect(await rig.until(() => headings(rig).join('|') === 'Your field')).toBe(true);
    expect({ modal: modalOf(), later: sheet.frames.open - open }).toEqual({
      modal: null,
      later: 0,
    });
    await rig.leave();

    device.launch();
    const again = await mountBar(0, false);
    await toField(again);
    sheet.stop();
    expect({
      modal: modalOf(),
      later: sheet.frames.open - open,
      rig: rig.faults,
      again: again.faults,
      sheet: sheet.faults,
      written: writtenSince(start),
    }).toEqual({ modal: null, later: 0, rig: [], again: [], sheet: [], written: [] });
    await again.leave();
  });

  it('closes by Done and by Escape, home’s card and field kept and nothing written', async () => {
    launchWith([record(recallOf(passage.reference, Date.UTC(2026, 9, 1), 3, 0))]);
    const sheet = watchSheet();
    const rig = await mountBar(0, false);
    await toField(rig);
    const plants = () => [...rig.host.querySelectorAll('[data-testid="field-plant"]')].map(labelOf);
    const chosen = { card: cardOf(rig.host), plants: plants() };
    expect(chosen.plants.some((label) => label.startsWith(`${passage.reference}, seed`))).toBe(
      true,
    );
    const start = new Map(device.disk);
    const kept: unknown[] = [];
    for (const way of ['Done', 'Escape'] as const) {
      await openSettings(rig);
      const closed = await closeSettings(rig, way);
      kept.push({
        way,
        closed,
        modal: modalOf(),
        card: cardOf(rig.host),
        plants: plants(),
      });
    }
    sheet.stop();
    expect({ kept, rig: rig.faults, sheet: sheet.faults, written: writtenSince(start) }).toEqual({
      kept: ['Done', 'Escape'].map((way) => ({ way, closed: true, modal: null, ...chosen })),
      rig: [],
      sheet: [],
      written: [],
    });
    await rig.leave();
  });

  it('gives way to Today when a recital starts while it is open, and leaves no sheet', async () => {
    launchWith();
    const presser: Presser = { press: () => undefined };
    function CatchPress() {
      presser.press = useAtomSet(press);
      return null;
    }
    const sheet = watchSheet();
    const rig = await mountBar(0, false, <CatchPress />);
    await toField(rig);
    await openSettings(rig);
    await act(async () => presser.press({ piece: passage, item: Option.none() }));
    expect(await rig.until(() => headings(rig).includes('Today'))).toBe(true);
    sheet.stop();
    expect({ modal: modalOf(), rig: rig.faults, sheet: sheet.faults }).toEqual({
      modal: null,
      rig: [],
      sheet: [],
    });
    await rig.leave();
  });
});
