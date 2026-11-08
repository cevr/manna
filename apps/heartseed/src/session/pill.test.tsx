/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- a React screen test: it drives launches of the root in happy-dom through React's promise-based `act`, one step after another, over a disk kept in a plain map the steps change, and reads a node's absent attributes as null. */

/**
 * The Voice pill on Today as a reader and a screen reader meet it, through
 * the session rig (`src/test/session-rig.tsx`), which holds every frame to
 * the pill's form: one node labelled `Voice`, a button valued `Off`, `Her`
 * or `Him` that reads `Voice: <value>`, never checked or pressed.
 *
 * From each start a disk may hold (the choice's key alone, the old
 * switch's alone, junk over the old switch, nothing), the pill shows the
 * choice read by hsspeaker D2, filled in ink unless Off and at least 44 pt
 * tall; each of four taps shows and stores the next choice of the cycle
 * Off, Her, Him under the choice's key, the old key never changes, the
 * launch writes no voice key, and a relaunch shows the last choice. Two
 * taps in one turn cycle twice and store the second; a refused write keeps
 * the choice shown for the launch, and the next launch reads the disk.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';

import type { Recall } from '../sayit';
import { color } from '../sayit/draw';
import { keyOf } from '../test/garden-model';
import { deviceOf, faultsOf, launch, type Device, type Launch } from '../test/session-rig';
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

const pillOf = (app: Launch) => app.host.querySelector('[aria-label="Voice"]');

/** What the pill shows now: the rig's reading of it, whether it is filled in ink, and whether it is at least 44 tall. */
const shownOf = (app: Launch) => {
  const node = pillOf(app);
  if (node === null) return { voices: app.choices().voices, filled: false, tall: false };
  const style = getComputedStyle(node);
  return {
    voices: app.choices().voices,
    filled: rgb(style.backgroundColor) === rgb(color.ink),
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

/** A launch of `device` that waits for Today and its Voice pill. */
const open = async (device: Device, faults = faultsOf()) => {
  const app = await launch(device, faults, { now: AT });
  expect(await app.until(() => app.headings().includes('Today') && pillOf(app) !== null)).toBe(
    true,
  );
  return app;
};

/** Waits until the pill shows `choice` and the disk holds `stored` under the choice's key. */
const settled = (app: Launch, device: Device, choice: Choice, stored: string | undefined) =>
  app.until(
    () =>
      JSON.stringify(shownOf(app)) === JSON.stringify(wantOf(choice)) &&
      device.disk.get(CHOICE_KEY) === stored,
  );

describe('Today’s Voice pill', () => {
  it('shows the choice read from every start, and four taps cycle Off, Her, Him, each stored under the choice’s key and shown again at a relaunch', async () => {
    for (const [name, entries, first] of STARTS) {
      const device = deviceFor(entries);
      const old = device.disk.get(ENABLED_KEY);
      const stored = device.disk.get(CHOICE_KEY);
      const app = await open(device);
      await settled(app, device, first, stored);
      expect({ name, shown: shownOf(app), writes: voiceWrites(device) }).toEqual({
        name,
        shown: wantOf(first),
        writes: [],
      });
      let choice = first;
      for (let t = 1; t <= 4; t += 1) {
        choice = nextChoice(choice);
        await app.tap('Voice');
        await settled(app, device, choice, choice);
        expect({
          name,
          t,
          shown: shownOf(app),
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
      expect({ name, faults: app.faults }).toEqual({ name, faults: [] });
      await app.leave();
      const again = await open(device);
      await settled(again, device, choice, choice);
      expect({ name, relaunch: shownOf(again), writes: voiceWrites(device).length }).toEqual({
        name,
        relaunch: wantOf(choice),
        writes: 4,
      });
      await again.leave();
    }
  });

  it('cycles twice for two taps in one turn, and stores the second', async () => {
    const device = deviceFor([[CHOICE_KEY, 'her']]);
    const app = await open(device);
    await settled(app, device, 'her', 'her');
    await act(async () => {
      for (let t = 0; t < 2; t += 1)
        pillOf(app)?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
        );
    });
    await settled(app, device, 'off', 'off');
    expect({ shown: shownOf(app), stored: device.disk.get(CHOICE_KEY) }).toEqual({
      shown: wantOf('off'),
      stored: 'off',
    });
    expect(app.faults).toEqual([]);
    await app.leave();
  });

  it('keeps the choice shown for the launch when the store refuses its write, and the next launch reads the disk', async () => {
    const device = deviceFor([[ENABLED_KEY, 'false']]);
    const app = await open(device, faultsOf({ refuse: new Set([CHOICE_KEY]) }));
    await settled(app, device, 'off', undefined);
    await app.tap('Voice');
    await settled(app, device, 'her', undefined);
    expect({ shown: shownOf(app), writes: voiceWrites(device) }).toEqual({
      shown: wantOf('her'),
      writes: [],
    });
    await app.leave();
    const again = await open(device);
    await settled(again, device, 'off', undefined);
    expect({ shown: shownOf(again), old: device.disk.get(ENABLED_KEY) }).toEqual({
      shown: wantOf('off'),
      old: 'false',
    });
    await again.leave();
  });
});
