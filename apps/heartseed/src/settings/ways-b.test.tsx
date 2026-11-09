/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction -- a React screen test: it drives the root in happy-dom through React's promise-based `act` over the device's disk, one launch after another, and reads a node's absent attributes as null. */

/**
 * More ways of home's Settings sheet (the rest are `ways.test.tsx`'s),
 * through the field bar's rig (`src/test/bar-rig.tsx`) and the session's
 * rig (`src/test/session-rig.tsx`), each frame held to the root's rule (one
 * `Settings` on home outside the scroll view, none elsewhere) and, while
 * the sheet's rig watches, to the sheet's rule (`src/test/settings-rig.ts`).
 *
 * A relaunch with the sheet open opens home with it closed. No other
 * screen has `Settings`: Today, When I need…, the chooser, About, the first
 * minute, and Today on an unread garden. Today shows no `Minutes` and no
 * `Voice`: the sheet's choices are the only ones, and Today's counts line
 * follows the sheet's minutes. The session rig's launches here mount the
 * root without the choices seam, so the root's rule holds Today strictly.
 */

import { describe, expect, it } from 'bun:test';

import { mountBar } from '../test/bar-rig';
import { labelOf, text } from '../test/chooser-rig';
import { recallOf } from '../test/field-model';
import { record } from '../test/field-rig';
import { device } from '../test/one';
import { choicesOf, deviceOf, faultsOf, launch } from '../test/session-rig';
import { closeSettings, modalOf, openSettings, tapInSheet, watchSheet } from '../test/settings-rig';

const CONTROL = '[role="button"],[role="radio"],[role="checkbox"],[role="switch"]';

type Bar = Awaited<ReturnType<typeof mountBar>>;

const headings = (rig: { readonly host: Element }) =>
  [...rig.host.querySelectorAll('[role="heading"]')].map(text);

const named = (rig: Bar, label: string) =>
  [...rig.host.querySelectorAll(CONTROL)].filter((node) => labelOf(node) === label);

/** A planted verse, so home opens with a plan. */
const launchWith = () => device.launch([record(recallOf('Made 1:1', Date.UTC(2026, 9, 1), 3, 0))]);

/** Waits for home with its gear. */
const toField = async (rig: Bar) => {
  expect(
    await rig.until(
      () => headings(rig).join('|') === 'Your field' && named(rig, 'Settings').length === 1,
    ),
  ).toBe(true);
};

describe('Settings, more ways', () => {
  it('opens closed after a relaunch with it open', async () => {
    launchWith();
    const sheet = watchSheet();
    const rig = await mountBar(0, false);
    await toField(rig);
    await openSettings(rig);
    await rig.leave();
    const left = modalOf();
    device.launch();
    const again = await mountBar(0, false);
    await toField(again);
    sheet.stop();
    expect({
      left,
      modal: modalOf(),
      rig: rig.faults,
      again: again.faults,
      sheet: sheet.faults,
    }).toEqual({ left: null, modal: null, rig: [], again: [], sheet: [] });
    await again.leave();
  });

  it('shows on no screen but home: Today, When I need…, the chooser, About, the first minute, Today on an unread garden', async () => {
    launchWith();
    const rig = await mountBar(0, false);
    const seen: Record<string, number> = {};
    const visit = async (way: () => Promise<boolean>, heading: string) => {
      await toField(rig);
      expect(await way()).toBe(true);
      expect(await rig.until(() => headings(rig).join('|') === heading)).toBe(true);
      seen[heading] = named(rig, 'Settings').length;
      await rig.tap('Your field');
    };
    await visit(() => rig.tap('Begin'), 'Today');
    await visit(() => rig.tap('When I need…'), 'When I need…');
    await visit(() => rig.tapId('add-verses'), 'Add a passage');
    await visit(async () => {
      await openSettings(rig);
      return tapInSheet('About');
    }, 'About');
    await toField(rig);
    expect({ seen, faults: rig.faults }).toEqual({
      seen: { Today: 0, 'When I need…': 0, 'Add a passage': 0, About: 0 },
      faults: [],
    });
    await rig.leave();

    const at = { now: Date.UTC(2026, 10, 5, 15) };
    const unseamed = { choicesOnToday: false };
    const first = await launch(deviceOf(), faultsOf(), at, [], unseamed);
    expect(await first.until(() => first.frames.first > 0)).toBe(true);
    const firstSeen = { settings: first.has('Settings'), faults: [...first.faults] };
    await first.leave();
    const unread = await launch(
      deviceOf([record(recallOf('Made 1:1', at.now - 3 * 86_400_000, 3, 0))]),
      faultsOf({ listing: 'unread' }),
      at,
      [],
      unseamed,
    );
    expect(await unread.until(() => unread.headings().includes('Today'))).toBe(true);
    const unreadSeen = {
      settings: unread.has('Settings'),
      choices: choicesOf(unread.host),
      faults: [...unread.faults],
    };
    await unread.leave();
    expect({ first: firstSeen, unread: unreadSeen }).toEqual({
      first: { settings: false, faults: [] },
      unread: {
        settings: false,
        choices: { groups: 0, names: [], checked: [], voices: [] },
        faults: [],
      },
    });
  });

  it("holds no choices on Today: the sheet's minutes and voice rule Today's plan and stay the sheet's", async () => {
    launchWith();
    const sheet = watchSheet();
    const rig = await mountBar(0, false);
    await toField(rig);
    await openSettings(rig);
    expect(await tapInSheet('10 min')).toBe(true);
    const counts = text(rig.host.querySelector('[data-testid="counts"]'));
    expect(await closeSettings(rig, 'Done')).toBe(true);
    expect(await rig.tap('Begin')).toBe(true);
    expect(await rig.until(() => headings(rig).join('|') === 'Today')).toBe(true);
    const today = {
      choices: choicesOf(rig.host),
      counts: text(rig.host.querySelector('[data-testid="session"]')),
    };
    expect(await rig.tap('Your field')).toBe(true);
    await toField(rig);
    await openSettings(rig);
    expect(await tapInSheet('Voice')).toBe(true);
    expect(await closeSettings(rig, 'Done')).toBe(true);
    expect(await rig.tap('Begin')).toBe(true);
    expect(await rig.until(() => headings(rig).join('|') === 'Today')).toBe(true);
    const voiced = choicesOf(rig.host).voices;
    expect(await rig.tap('Your field')).toBe(true);
    await toField(rig);
    await openSettings(rig);
    const shown = choicesOf(modalOf() ?? rig.host).voices;
    expect(await closeSettings(rig, 'Done')).toBe(true);
    sheet.stop();
    expect({ today, voiced, shown, rig: rig.faults, sheet: sheet.faults }).toEqual({
      today: { choices: { groups: 0, names: [], checked: [], voices: [] }, counts },
      voiced: [],
      shown: ['Voice:Him'],
      rig: [],
      sheet: [],
    });
    expect(counts).not.toBe('');
    await rig.leave();
  });
});
