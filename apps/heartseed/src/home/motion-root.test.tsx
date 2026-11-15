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
import { entryOf, moving, under } from '../test/motion';
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

/** A full-corn own verse (a single verse, hsminlist), two held seeds, a held full corn and seventeen bare places, read from the device's store. */
const launchField = () => {
  const today = Math.floor(START / DAY);
  const disk = new Map<string, string | null>([
    ...historyOf(() => 0.1, passage.reference, today - 400).map(record),
    ...historyOf(() => 0.1, heldVerse(5), today - 400).map(record),
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
      () => by(rig.host, 'row').length === 1 && by(rig.host, 'today-card').length === 1,
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

/** Each single verse's label and the images inside it: a single verse is drawn as a list's plant is, with no image (hsminlist). */
const singles = (host: Element) =>
  by(host, 'singles').flatMap((section) =>
    by(section, 'field-plant').map((plant) => [
      labelOf(plant).replace(/, ready today$/u, ''),
      plant.querySelectorAll('img').length,
    ]),
  );

const seen = (host: Element) =>
  by(host, 'row').map((row) => ({
    title: text(row.querySelector('[data-testid="row-title"]')),
    images: row.querySelectorAll('img').length,
    plants: by(row, 'field-plant').map((plant) => labelOf(plant).replace(/, ready today$/u, '')),
  }));

describe('home motion through the root', () => {
  it('M1 draws the furrows and the single verses with no image and moves nothing on home, full corn included', () =>
    under('no-preference', async () => {
      const rig = await home();
      await frame();
      expect(seen(rig.host)).toEqual([
        {
          title: 'Psalms 119:1-20',
          images: 0,
          plants: Array.from({ length: 20 }, (_, place) => {
            if (place === 1 || place === 19) return `${heldVerse(place + 1)}, seed`;
            if (place === 4) return `${heldVerse(5)}, full corn`;
            return `${heldVerse(place + 1)}, not planted`;
          }),
        },
      ]);
      expect(singles(rig.host)).toEqual([[`${passage.reference}, full corn`, 0]]);
      expect(moving(rig.host).map((node) => node.getAttribute('style'))).toEqual([]);
      expect(rig.faults).toEqual([]);
      await rig.leave();
    }));

  it('M3 keeps every control visible and enabled in the first frame, and a plant tap opens Today on its verse', () =>
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
        await rig.until(
          () => text(rig.host.querySelector('[data-testid="reference"]')) === heldVerse(2),
        ),
      ).toBe(true);
      expect(rig.faults).toEqual([]);
      await rig.leave();
    }));

  it('M4 moves nothing on home under Reduce Motion', () =>
    under('reduce', async () => {
      const rig = await home();
      await frame();
      await frame();
      expect(moving(rig.host).map((node) => node.getAttribute('style'))).toEqual([]);
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
