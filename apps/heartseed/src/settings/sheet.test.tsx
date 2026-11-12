/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noTernary -- a React screen test: it drives the root in happy-dom through React's promise-based `act` over the device's disk, one launch after another, reads a node's absent attributes as null, and picks a launch's scheme and the system it flips to from plain branches. */

/**
 * Home's Settings sheet as a reader and a screen reader meet it, through
 * the field bar's rig (`src/test/bar-rig.tsx`, whose frames hold the root's
 * rule, the screens' rules and the look) and the sheet's rig
 * (`src/test/settings-rig.ts`, whose `watchSheet` holds every frame of the
 * document to the sheet's rule). Each launch is over stored texts of the
 * minutes, the voice and the appearance, zipped so that every class of
 * each key meets a launch (its words, a garbled text or a near miss,
 * another text, a missing key, and for the voice the old switch alone),
 * half under each system. Home holds no control outside the scroll view
 * but its card's, and one `Settings`: a row at the field's end, before `How
 * Heartseed works`, showing its name with no image, at least 52 tall. Its
 * tap opens the sheet: the heading `Settings`, `Done`
 * outside the scroll view, then each line over its choice (the minutes
 * read, the voice read, the appearance read), `Show the welcome again`
 * and `About`; the sheet holds
 * its look after a flip of the system, `Done` closes it, and nothing is
 * written. In the first launch the sheet's `About` then shows About with
 * no radio group and no foot of its own, and its way back shows home.
 * `Show the welcome again` closes the sheet in its tap and shows the
 * welcome, from home with and without the tips; its `Skip` shows home
 * with none. A failed read of a key is the walk's (`walk-*.test.tsx`), whose
 * store fails a key's read.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';

import { APPEARANCE_KEY } from '../appearance';
import { MINUTES_KEY } from '../session/service';
import { mountBar } from '../test/bar-rig';
import { labelOf, text } from '../test/chooser-rig';
import { recallOf } from '../test/field-model';
import { iconOf, record, scrolled } from '../test/field-rig';
import { setSystem } from '../test/look';
import { device } from '../test/one';
import { choicesOf } from '../test/session-rig';
import {
  closeSettings,
  modalOf,
  openSettings,
  sheetFaults,
  tapInSheet,
  watchSheet,
} from '../test/settings-rig';
import type { Scheme } from '../theme';
import { CHOICE_KEY, ENABLED_KEY } from '../voice';

const CONTROL = '[role="button"],[role="radio"],[role="checkbox"],[role="switch"]';

/** One launch: the stored texts (absent for a missing key), the system, and what the sheet must show. */
interface Row {
  readonly minutes?: string;
  readonly choice?: string;
  readonly enabled?: string;
  readonly appearance?: string;
  readonly system: Scheme;
  readonly want: { readonly minutes: string; readonly voice: string; readonly appearance: string };
}

const ROWS: readonly Row[] = [
  {
    minutes: '2',
    choice: 'off',
    appearance: 'system',
    system: 'light',
    want: { minutes: '2 min', voice: 'Off', appearance: 'System' },
  },
  {
    minutes: '20',
    choice: 'her',
    appearance: 'dark',
    system: 'dark',
    want: { minutes: '20 min', voice: 'Her', appearance: 'Dark' },
  },
  {
    minutes: '10',
    choice: 'him',
    appearance: 'light',
    system: 'light',
    want: { minutes: '10 min', voice: 'Him', appearance: 'Light' },
  },
  {
    minutes: 'ten',
    choice: 'loud',
    appearance: 'Dark',
    system: 'dark',
    want: { minutes: '5 min', voice: 'Her', appearance: 'System' },
  },
  {
    minutes: '5 ',
    enabled: 'false',
    appearance: 'sepia',
    system: 'light',
    want: { minutes: '5 min', voice: 'Off', appearance: 'System' },
  },
  {
    system: 'dark',
    want: { minutes: '5 min', voice: 'Her', appearance: 'System' },
  },
];

/** The stored texts of `row` as disk records. */
const storedOf = (row: Row) =>
  [
    [MINUTES_KEY, row.minutes],
    [CHOICE_KEY, row.choice],
    [ENABLED_KEY, row.enabled],
    [APPEARANCE_KEY, row.appearance],
  ].filter((entry): entry is [string, string] => entry[1] !== undefined);

/** The scheme the screens show: the stored word when it is exactly `light` or `dark`, else the system's. */
const schemeOf = (row: Row, system: Scheme): Scheme =>
  row.appearance === 'light' || row.appearance === 'dark' ? row.appearance : system;

/** Home's controls outside every scroll view but the Today card's, by name, in document order. */
const fixedOf = (host: Element) =>
  [...host.querySelectorAll(CONTROL)]
    .filter((node) => !scrolled(node) && node.closest('[data-testid="today-card"]') === null)
    .map(labelOf);

/** The `Settings` controls as a reader meets them: the scroll view's last two controls, its words, its images, its height and its state. */
const settingsOf = (host: Element) =>
  [...host.querySelectorAll(CONTROL)]
    .filter((node) => labelOf(node) === 'Settings')
    .map((node) => {
      const style = getComputedStyle(node);
      const images = [...node.querySelectorAll('img')];
      return {
        ends: [...host.querySelectorAll(CONTROL)].filter(scrolled).map(labelOf).slice(-2),
        scrolled: scrolled(node),
        words: text(node),
        images: images.map((image) => iconOf(image)),
        tall: parseFloat(style.minHeight) >= 52,
        disabled: node.getAttribute('aria-disabled'),
      };
    });

/** The open sheet as a reader meets it: its heading, its lines and controls in order, and its choices. */
const sheetOf = () => {
  const modal = modalOf();
  if (modal === null) return 'closed';
  const root = modal.querySelector('[data-testid="settings"]');
  const shown = [...(root?.querySelectorAll('*') ?? [])]
    .filter(
      (node) =>
        node.matches(`${CONTROL},[role="heading"]`) ||
        (node.children.length === 0 &&
          text(node) !== '' &&
          node.closest(`${CONTROL},[role="heading"],[role="radiogroup"]`) === null),
    )
    .map((node) => labelOf(node) || text(node));
  const choices = choicesOf(modal);
  const appearance = [
    ...modal.querySelectorAll('[role="radiogroup"][aria-label="Appearance"] [role="radio"]'),
  ];
  return {
    shown,
    minutes: choices.checked,
    voice: choices.voices,
    appearance: appearance
      .filter((node) => node.getAttribute('aria-checked') === 'true')
      .map(labelOf),
  };
};

const SHOWN = [
  'Settings',
  'Done',
  "A day's tending",
  '2 min',
  '5 min',
  '10 min',
  '20 min',
  'Reads new verses aloud',
  'Voice',
  'Appearance',
  'System',
  'Light',
  'Dark',
  'Show the welcome again',
  'About',
];

describe('Settings', () => {
  for (const row of ROWS)
    it(`opens from home's Settings row over ${JSON.stringify(storedOf(row))} under a ${row.system} system`, async () => {
      setSystem(row.system);
      const system = { now: row.system };
      device.launch([record(recallOf('Made 1:1', Date.UTC(2026, 9, 1), 3, 0)), ...storedOf(row)]);
      const start = new Map(device.disk);
      const sheet = watchSheet(() => schemeOf(row, system.now));
      const rig = await mountBar(0, false);
      expect(
        await rig.until(
          () =>
            text(rig.host.querySelector('[role="heading"]')) === 'Your field' &&
            rig.host.querySelector('[data-testid="today-card"]') !== null,
        ),
      ).toBe(true);
      expect({
        fixed: fixedOf(rig.host),
        settings: settingsOf(rig.host),
        about: [...rig.host.querySelectorAll(CONTROL)]
          .map(labelOf)
          .filter((label) => label === 'About'),
      }).toEqual({
        fixed: [],
        settings: [
          {
            ends: ['Settings', 'How Heartseed works'],
            scrolled: true,
            words: 'Settings›',
            images: [],
            tall: true,
            disabled: null,
          },
        ],
        about: [],
      });

      await openSettings(rig);
      expect(
        await rig.until(() => {
          const now = sheetOf();
          return now !== 'closed' && now.shown.length === SHOWN.length;
        }),
      ).toBe(true);
      expect(sheetOf()).toEqual({
        shown: SHOWN,
        minutes: [row.want.minutes],
        voice: [`Voice:${row.want.voice}`],
        appearance: [row.want.appearance],
      });
      expect(sheetFaults(document, schemeOf(row, system.now))).toEqual([]);

      system.now = row.system === 'light' ? 'dark' : 'light';
      await act(async () => setSystem(system.now));
      expect(sheetFaults(document, schemeOf(row, system.now))).toEqual([]);

      expect(await closeSettings(rig, 'Done')).toBe(true);
      expect(sheetOf()).toBe('closed');
      if (row === ROWS[0]) {
        await openSettings(rig);
        expect(await tapInSheet('About')).toBe(true);
        expect(
          await rig.until(() => text(rig.host.querySelector('[role="heading"]')) === 'About'),
        ).toBe(true);
        expect({
          groups: rig.host.querySelectorAll('[role="radiogroup"]').length,
          aboutFoot: document.querySelectorAll('[data-testid="about-foot"]').length,
          sheet: sheetOf(),
        }).toEqual({ groups: 0, aboutFoot: 0, sheet: 'closed' });
        await rig.tap('Your field');
        expect(
          await rig.until(() => text(rig.host.querySelector('[role="heading"]')) === 'Your field'),
        ).toBe(true);
      }
      sheet.stop();
      expect({
        rig: rig.faults,
        sheet: sheet.faults,
        open: sheet.frames.open > 0,
        written: [...device.disk].filter(([key, value]) => start.get(key) !== value),
      }).toEqual({ rig: [], sheet: [], open: true, written: [] });
      await rig.leave();
      setSystem('light');
    });

  it('replays the welcome from its row, closing the sheet in the same tap, from home with and without the tips', async () => {
    setSystem('light');
    device.launch([record(recallOf('Made 1:1', Date.UTC(2026, 9, 1), 3, 0))]);
    const start = new Map(device.disk);
    const rig = await mountBar(0, false);
    const heading = () => text(rig.host.querySelector('[role="heading"]'));
    const tips = () => rig.host.querySelectorAll('[data-testid^="tip-"]').length;
    const replay = async () => {
      await openSettings(rig);
      expect(await tapInSheet('Show the welcome again')).toBe(true);
      expect(await rig.until(() => heading() === 'Heartseed')).toBe(true);
      expect({
        sheet: modalOf(),
        radios: document.querySelectorAll('[role="radio"]').length,
      }).toEqual({
        sheet: null,
        radios: 0,
      });
    };
    expect(await rig.until(() => heading() === 'Your field')).toBe(true);
    await replay();
    await rig.tap('Begin');
    expect(await rig.until(() => heading() === 'Every verse is a plant')).toBe(true);
    await rig.tap('See your field');
    expect(await rig.until(() => heading() === 'Your field' && tips() === 3)).toBe(true);
    await replay();
    await rig.tap('Skip');
    expect(await rig.until(() => heading() === 'Your field')).toBe(true);
    expect({
      tips: tips(),
      gotIt: [...rig.host.querySelectorAll(CONTROL)].filter((node) => labelOf(node) === 'Got it')
        .length,
      rig: rig.faults,
      written: [...device.disk].filter(([key, value]) => start.get(key) !== value),
    }).toEqual({ tips: 0, gotIt: 0, rig: [], written: [] });
    await rig.leave();
  });
});
