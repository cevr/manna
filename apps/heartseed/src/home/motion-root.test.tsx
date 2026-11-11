/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNullish, effect/noNewPromise, effect/noFixedWaitInTests -- React's promise-based act mounts the real root in happy-dom; the device's recall fixtures use its test-owned instant; DOM absence is null; one 40 ms frame lets Reanimated write its entering styles, not finish its delays. */

import { describe, expect, it } from 'bun:test';
import { MutableRef } from 'effect';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { mountBar } from '../test/bar-rig';
import { labelOf, text } from '../test/chooser-rig';
import { START } from '../test/clock';
import { historyOf, recallOf } from '../test/field-model';
import { record } from '../test/field-rig';
import { DAY } from '../test/garden-model';
import { entryOf, moving, swayOf, under } from '../test/motion';
import { motionFaults } from '../test/motion-rule';
import { device } from '../test/one';
import { KEY, storedText } from '../test/passages-model';
import { deviceOf, launch } from '../test/run-rig';

const CONTROLS = '[role="button"],[role="radio"],[role="checkbox"],[role="link"]';
const HELD = { book: 19, chapter: 119, first: 1, last: 20 };
const NOON = Date.UTC(2026, 0, 15, 12);
const END = 'The field is tended';
const heldVerse = (verse: number) => `Psalms 119:${verse}`;
const by = (top: Element, id: string) => [...top.querySelectorAll(`[data-testid="${id}"]`)];

/** A full-corn own verse, two held seeds and eighteen bare places, read from the device's store. */
const launchField = () => {
  const today = Math.floor(START / DAY);
  const disk = new Map<string, string | null>([
    ...historyOf(() => 0.1, passage.reference, today - 400).map(record),
    record(recallOf(heldVerse(2), START - DAY, 3, 0)),
    record(recallOf(heldVerse(20), START - DAY, 3, 0)),
  ]);
  disk.set(KEY, storedText([HELD]));
  device.launch(disk);
};

const home = async () => {
  launchField();
  const rig = await mountBar(0, false);
  expect(
    await rig.until(
      () => by(rig.host, 'row').length === 2 && by(rig.host, 'today-card').length === 1,
    ),
  ).toBe(true);
  return rig;
};

/** The own verse planted yesterday, launched at noon, said and heard whole, `Next`: the end with that verse grown to a blade. */
const toEnd = async () => {
  const app = await launch(
    deviceOf([record(recallOf(passage.reference, NOON - DAY, 3, 0))]),
    { unread: false, refuse: false },
    { now: NOON },
  );
  expect(await app.until(() => app.has('Start'))).toBe(true);
  expect(await app.tap('Start')).toBe(true);
  expect(await app.until(() => app.headings().includes('Today') && app.has('Say it'))).toBe(true);
  MutableRef.set(app.hearing, { kind: 'heard', text: passage.text, skip: [] });
  expect(await app.tap('Say it')).toBe(true);
  expect(await app.until(() => app.has('Listening'))).toBe(true);
  expect(await app.tap('Listening')).toBe(true);
  expect(await app.until(() => app.has('Next'))).toBe(true);
  expect(await app.tap('Next')).toBe(true);
  expect(await app.until(() => app.headings().includes(END))).toBe(true);
  return app;
};

const frame = () => act(() => new Promise((resolve) => setTimeout(resolve, 40)));

/** Every ancestor remains visible, in the layout and opaque enough to reach a control immediately. */
const reachable = (node: Element) => {
  for (let at: Element | null = node; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      return false;
  }
  return true;
};

const seen = (host: Element) =>
  by(host, 'row').map((row) => ({
    title: text(row.querySelector('[data-testid="row-title"]')),
    icon: entryOf(row.querySelector('[data-testid="furrow-icon"]'), row),
    plants: by(row, 'field-plant').map((plant) => {
      const drawing = plant.querySelector('[data-testid="plant-image"],[data-testid="plant-soil"]');
      return [
        labelOf(plant).replace(/, ready today$/u, ''),
        entryOf(drawing, plant),
        swayOf(drawing, plant),
      ];
    }),
  }));

describe('home motion through the root', () => {
  it('M1 staggers furrow icons and planted plants, holds long delays, sways full corn and leaves soil still', () =>
    under('no-preference', async () => {
      const rig = await home();
      await frame();
      expect(seen(rig.host)).toEqual([
        {
          title: passage.reference,
          icon: 0,
          plants: [[`${passage.reference}, full corn`, 70, true]],
        },
        {
          title: 'Psalms 119:1-20',
          icon: 90,
          plants: Array.from({ length: 20 }, (_, place) => {
            if (place === 1) return [`${heldVerse(2)}, seed`, 230, false];
            if (place === 19) return [`${heldVerse(20)}, seed`, 1200, false];
            return [`${heldVerse(place + 1)}, not planted`, null, false];
          }),
        },
      ]);
      expect(rig.faults).toEqual([]);
      await rig.leave();
    }));

  it('M2 moves only hidden drawings holding one image, never text or controls', () =>
    under('no-preference', async () => {
      const rig = await home();
      await frame();
      expect(moving(rig.host).length).toBeGreaterThanOrEqual(5);
      expect(motionFaults(rig.host)).toEqual([]);
      expect(rig.faults).toEqual([]);
      await rig.leave();
    }));

  it('M3 keeps every control visible and enabled in the first frame, and a plant tap chooses it', () =>
    under('no-preference', async () => {
      const rig = await home();
      const controls = [...rig.host.querySelectorAll(CONTROLS)];
      expect(controls.map(labelOf)).toContain('Settings');
      expect(controls.filter((node) => !reachable(node)).map(labelOf)).toEqual([]);
      expect(controls.filter((node) => node.getAttribute('aria-disabled') === 'true')).toEqual([]);
      const seed = by(rig.host, 'field-plant').find((node) =>
        labelOf(node).startsWith(`${heldVerse(2)}, seed`),
      );
      expect(seed).toBeDefined();
      await act(async () => {
        seed?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
        );
      });
      expect(
        by(rig.host, 'field-plant')
          .filter((node) => node.getAttribute('aria-selected') === 'true')
          .map((node) => labelOf(node).replace(/, ready today$/u, '')),
      ).toEqual([`${heldVerse(2)}, seed`]);
      expect(rig.faults).toEqual([]);
      await rig.leave();
    }));

  it('M4 enters nothing under Reduce Motion, holds nothing unseen and rests full corn upright', () =>
    under('reduce', async () => {
      const rig = await home();
      await frame();
      await frame();
      expect(moving(rig.host).map((node) => node.getAttribute('style'))).toEqual([
        'transform: rotate(0deg);',
      ]);
      expect(rig.faults).toEqual([]);
      await rig.leave();
    }));

  it('M6 springs the grown plant at the end 300 ms in, its image alone, and keeps Your field in reach', () =>
    under('no-preference', async () => {
      const app = await toEnd();
      await frame();
      expect(
        by(app.host, 'grown').map((node) => [
          labelOf(node),
          entryOf(node.querySelector('img'), node),
          moving(node).filter((at) => at.querySelector('img') === null && at.tagName !== 'IMG')
            .length,
          moving(app.host).filter((at) => at.contains(node)).length,
        ]),
      ).toEqual([[`${passage.reference}, blade`, 300, 0, 0]]);
      expect(motionFaults(app.host)).toEqual([]);
      const controls = [...app.host.querySelectorAll(CONTROLS)];
      expect(controls.map(labelOf)).toEqual(['Your field']);
      expect(controls.filter((node) => !reachable(node)).map(labelOf)).toEqual([]);
      expect(await app.leave()).toEqual([]);
    }));
});
