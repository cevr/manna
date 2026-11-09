/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- a React screen test: it drives launches of the root in happy-dom through React's promise-based `act`, one step after another, over a disk kept in a plain map the steps change, and reads a node's absent attributes as null. */

/**
 * The Voice pill in home's Settings sheet as a reader and a screen reader
 * meet it, through the session rig (`src/test/session-rig.tsx`) and the
 * sheet's rig (`src/test/settings-rig.ts`), which holds every frame of the
 * open sheet to the pill's form: one node labelled `Voice`, a button valued
 * `Off`, `Her` or `Him` that reads `Voice: <value>`, never checked or
 * pressed.
 *
 * Each launch lands on home, whose `Begin` (the passage is the plan's new
 * piece) leads to Today, and opens the sheet there. From each start a disk
 * may hold (the choice's key alone, the old switch's alone, junk over the
 * old switch, nothing), the sheet's pill shows the choice read by hsspeaker
 * D2, filled in ink unless Off and at least 44 pt tall; each of four taps
 * shows and stores the next choice of the cycle Off, Her, Him under the
 * choice's key, the old key never changes, the launch writes no voice key,
 * and a relaunch shows the last choice. Two taps in one turn cycle twice
 * and store the second; a refused write keeps the choice shown for the
 * launch, and the next launch reads the disk. Before each leave the sheet
 * closes by `Done` and `Begin` opens Today, which shows no `Voice`.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';

import type { Recall } from '../sayit';
import { keyOf } from '../test/garden-model';
import {
  choicesOf,
  deviceOf,
  faultsOf,
  launch,
  type Device,
  type Launch,
} from '../test/session-rig';
import { closeSettings, modalOf, openSettings, tapInSheet, watchSheet } from '../test/settings-rig';
import { theme } from '../theme';
import { CHOICE_KEY, ENABLED_KEY, nextChoice, type Choice } from '../voice';

const AT = Date.UTC(2026, 10, 5, 15);
const DAY = 86_400_000;

const WORDS: Readonly<Record<Choice, string>> = { off: 'Off', her: 'Her', him: 'Him' };

const recall: Recall = {
  reference: 'Made 1:1',
  startedAt: AT - 3 * DAY,
  offset: 0,
  grade: 3,
  suggested: 3,
  words: 4,
  missed: 0,
  peeked: 0,
  extra: 0,
};

/** A device with a planted verse, so Today opens, and `entries` under the voice's keys. */
const deviceFor = (entries: readonly (readonly [string, string])[]) =>
  deviceOf([[keyOf(recall), JSON.stringify(recall)], ...entries]);

/** Each start a disk may hold, and the choice it reads as. */
const STARTS: readonly (readonly [string, readonly (readonly [string, string])[], Choice])[] = [
  ['her stored', [[CHOICE_KEY, 'her']], 'her'],
  ['him stored', [[CHOICE_KEY, 'him']], 'him'],
  ['off stored', [[CHOICE_KEY, 'off']], 'off'],
  ['only the old off', [[ENABLED_KEY, 'false']], 'off'],
  ['only the old on', [[ENABLED_KEY, 'true']], 'her'],
  [
    'junk over the old off',
    [
      [CHOICE_KEY, 'loud'],
      [ENABLED_KEY, 'false'],
    ],
    'off',
  ],
  ['nothing', [], 'her'],
];

/** A colour as `rgb(r,g,b)`, from a hex text or a computed style. */
const rgb = (value: string) => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());
  if (hex !== null)
    return `rgb(${hex
      .slice(1)
      .map((part) => parseInt(part, 16))
      .join(',')})`;
  return value.replace(/\s+/g, '').replace(/^rgba\((\d+,\d+,\d+),1(?:\.0*)?\)$/, 'rgb($1)');
};

/** The open sheet's pill, if it shows. */
const pillOf = () => modalOf()?.querySelector('[aria-label="Voice"]') ?? null;

/** What the sheet's pill shows now: the rig's reading of it, whether it is filled in ink, and whether it is at least 44 tall. */
const shownOf = () => {
  const modal = modalOf();
  const node = pillOf();
  const voices = choicesOf(modal ?? document.createElement('div')).voices;
  if (node === null) return { voices, filled: false, tall: false };
  const style = getComputedStyle(node);
  return {
    voices,
    filled: rgb(style.backgroundColor) === rgb(theme.light.ink),
    tall: parseFloat(style.minHeight) >= 44,
  };
};

const wantOf = (choice: Choice) => ({
  voices: [`Voice:${WORDS[choice]}`],
  filled: choice !== 'off',
  tall: true,
});

/** The voice keys the device took writes under, in order. */
const voiceWrites = (device: Device) =>
  device.writes.filter((key) => key.startsWith('heartseed/voice/'));

type Sheet = ReturnType<typeof watchSheet>;

/** A launch of `device` that lands on home with `Begin` (the passage, unplanted beside another verse, is the plan's new piece), no pill and no fault, then opens the Settings sheet under a watch of its frames. */
const open = async (device: Device, faults = faultsOf()) => {
  const app = await launch(device, faults, { now: AT });
  await app.until(() => app.headings().includes('Your field') && app.has('Begin'));
  expect({
    headings: app.headings(),
    begin: app.has('Begin'),
    pill: app.host.querySelector('[aria-label="Voice"]') !== null,
    faults: app.faults,
  }).toEqual({ headings: ['Your field'], begin: true, pill: false, faults: [] });
  const sheet = watchSheet();
  await openSettings(app);
  return { app, sheet };
};

/** Waits until the sheet's pill shows `choice` and the disk holds `stored` under the choice's key. */
const settled = (app: Launch, device: Device, choice: Choice, stored: string | undefined) =>
  app.until(
    () =>
      JSON.stringify(shownOf()) === JSON.stringify(wantOf(choice)) &&
      device.disk.get(CHOICE_KEY) === stored,
  );

/** Closes the sheet by `Done`, takes `Begin` to Today, and holds Today to no `Voice` and the launch and the sheet to no fault, the sheet's look checked; then leaves. */
const close = async (name: string, app: Launch, sheet: Sheet) => {
  const closed = await closeSettings(app, 'Done');
  await app.tap('Begin');
  const today = await app.until(() => app.headings().includes('Today'));
  sheet.stop();
  expect({
    name,
    closed,
    today,
    voices: choicesOf(app.host).voices,
    faults: app.faults,
    sheet: sheet.faults,
    looked: sheet.frames.looked > 0,
  }).toEqual({ name, closed: true, today: true, voices: [], faults: [], sheet: [], looked: true });
  await app.leave();
};

describe('The Voice pill in Settings', () => {
  it('shows the choice read from every start, and four taps cycle Off, Her, Him, each stored under the choice’s key and shown again at a relaunch', async () => {
    for (const [name, entries, first] of STARTS) {
      const device = deviceFor(entries);
      const old = device.disk.get(ENABLED_KEY);
      const stored = device.disk.get(CHOICE_KEY);
      const { app, sheet } = await open(device);
      await settled(app, device, first, stored);
      expect({ name, shown: shownOf(), writes: voiceWrites(device) }).toEqual({
        name,
        shown: wantOf(first),
        writes: [],
      });
      let choice = first;
      for (let t = 1; t <= 4; t += 1) {
        choice = nextChoice(choice);
        expect([name, t, await tapInSheet('Voice')]).toEqual([name, t, true]);
        await settled(app, device, choice, choice);
        expect({
          name,
          t,
          shown: shownOf(),
          stored: device.disk.get(CHOICE_KEY),
          old: device.disk.get(ENABLED_KEY),
          writes: voiceWrites(device),
        }).toEqual({
          name,
          t,
          shown: wantOf(choice),
          stored: choice,
          old,
          writes: Array.from({ length: t }, () => CHOICE_KEY),
        });
      }
      await close(name, app, sheet);
      const again = await open(device);
      await settled(again.app, device, choice, choice);
      expect({ name, relaunch: shownOf(), writes: voiceWrites(device).length }).toEqual({
        name,
        relaunch: wantOf(choice),
        writes: 4,
      });
      await close(`${name}, relaunched`, again.app, again.sheet);
    }
  });

  it('cycles twice for two taps in one turn, and stores the second', async () => {
    const device = deviceFor([[CHOICE_KEY, 'her']]);
    const { app, sheet } = await open(device);
    await settled(app, device, 'her', 'her');
    const pill = pillOf();
    expect(pill !== null).toBe(true);
    await act(async () => {
      for (let t = 0; t < 2; t += 1)
        pill?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
        );
    });
    await settled(app, device, 'off', 'off');
    expect({ shown: shownOf(), stored: device.disk.get(CHOICE_KEY) }).toEqual({
      shown: wantOf('off'),
      stored: 'off',
    });
    await close('two taps', app, sheet);
  });

  it('keeps the choice shown for the launch when the store refuses its write, and the next launch reads the disk', async () => {
    const device = deviceFor([[ENABLED_KEY, 'false']]);
    const { app, sheet } = await open(device, faultsOf({ refuse: new Set([CHOICE_KEY]) }));
    await settled(app, device, 'off', undefined);
    expect(await tapInSheet('Voice')).toBe(true);
    await settled(app, device, 'her', undefined);
    expect({ shown: shownOf(), writes: voiceWrites(device) }).toEqual({
      shown: wantOf('her'),
      writes: [],
    });
    await close('refused', app, sheet);
    const again = await open(device);
    await settled(again.app, device, 'off', undefined);
    expect({ shown: shownOf(), old: device.disk.get(ENABLED_KEY) }).toEqual({
      shown: wantOf('off'),
      old: 'false',
    });
    await close('refused, relaunched', again.app, again.sheet);
  });
});
