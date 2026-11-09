/* oxlint-disable effect/noAsyncFunction, effect/noTernary, eslint/no-await-in-loop -- a React screen test: it drives launches of the root in happy-dom through the rigs' promise-based taps, one awaited step after another. */

/**
 * The field, About, the chooser and When I need… in light and in dark, and
 * across a flip of the system on each, through the bar rig and the need rig,
 * which hold every frame (each DOM mutation batch) to the frame oracle
 * (`src/test/look.ts`) for the system's scheme at that frame, beside their
 * own rules. The field shows every plant stage (a verse not planted and the
 * legend's four) and a reader's passage whose remove is asked and then
 * pending; the chooser shows the books, a chapter, verses chosen and
 * `Plant`; When I need… shows its cards. Each settled screen is also held
 * to the oracle for the scheme shown.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';

import { mountBar } from '../test/bar-rig';
import { recallOf } from '../test/field-model';
import { record } from '../test/field-rig';
import { lookFaults, pressedFaults, setSystem } from '../test/look';
import { launchNeed, needDevice, recordOf } from '../test/need-rig';
import { device } from '../test/one';
import { KEY, storedText } from '../test/passages-model';
import type { Scheme } from '../theme';

const NOW = Date.UTC(2026, 4, 12, 15);
const NEED = 'When I need…';
const other = (scheme: Scheme): Scheme => (scheme === 'light' ? 'dark' : 'light');

type Bar = Awaited<ReturnType<typeof mountBar>>;

/** How many controls the tests saw drawn under their pressed opacity. */
const presses = { pressed: 0 };

const headingOf = (host: Element) =>
  host.querySelector('[role="heading"]')?.textContent?.trim() ?? '';

/** The screen shown, held to the oracle in `scheme` with each control pressed in turn, then after a flip of the system, then flipped back. */
const held = async (
  rig: { readonly host: Element; readonly until: Bar['until'] },
  scheme: Scheme,
  where: string,
  report: string[],
) => {
  for (const [shown, press] of [
    [scheme, true],
    [other(scheme), false],
    [scheme, false],
  ] as const) {
    await act(async () => setSystem(shown));
    await rig.until(() => lookFaults(rig.host, shown).length === 0, 300);
    const faults = [
      ...lookFaults(rig.host, shown),
      ...(press ? await pressedFaults(rig.host, shown, presses) : []),
    ];
    if (faults.length > 0) report.push(`${where} [${shown}]: ${faults.join('; ')}`);
  }
};

describe('every screen but Today and the first minute, in light and in dark', () => {
  it('holds the field (every stage, a remove asked and pending), About and the chooser (books, a chapter, verses chosen, Plant) to the oracle', async () => {
    const report: string[] = [];
    const reached: string[] = [];
    for (const scheme of ['light', 'dark'] as const) {
      device.launch([
        record(recallOf('Made 1:1', Date.UTC(2026, 9, 1), 3, 0)),
        ['heartseed/voice/enabled', 'false'],
        [KEY, storedText([{ book: 19, chapter: 117, first: 1, last: 2 }])],
      ]);
      setSystem(scheme);
      const rig = await mountBar(0, false);
      const step = async (
        label: string,
        want: string,
        where: string,
        tap = () => rig.tap(label),
      ) => {
        if (!(await tap())) return;
        if (!(await rig.until(() => want === '' || headingOf(rig.host) === want))) return;
        reached.push(`${scheme} ${where}`);
        await held(rig, scheme, where, report);
      };
      await rig.until(() => headingOf(rig.host) === 'Today');
      await held(rig, scheme, 'Today', report);
      await step('Your field', 'Your field', 'the field');
      const drawn = new Set(
        [...rig.host.querySelectorAll('img')].flatMap(
          (node) =>
            /\/assets\/home\/(seed|blade|ear|corn)-/u.exec(String(node.getAttribute('src')))?.[1] ??
            [],
        ),
      );
      if (rig.host.querySelectorAll('[data-testid="plant-soil"]').length > 0) drawn.add('soil');
      if (drawn.size >= 5) reached.push(`${scheme} every stage`);
      await step('Remove Psalms 117:1-2', 'Your field', 'the ask');
      const pending = { frames: 0 };
      const watch = new MutationObserver(() => {
        const keep = rig.control('Keep');
        if (keep?.getAttribute('aria-disabled') === 'true') pending.frames += 1;
      });
      watch.observe(rig.host, { subtree: true, attributes: true, childList: true });
      await step('Remove', 'Your field', 'a remove landed');
      watch.disconnect();
      if (pending.frames > 0) reached.push(`${scheme} a remove pending`);
      await step('About', 'About', 'About');
      await step('Your field', 'Your field', 'the field again');
      await step('Add verses', 'Add a passage', 'the books', () => rig.tapId('add-verses'));
      await step('Psalms', 'Psalms', 'a book');
      await step('Psalms 117', 'Psalms 117', 'a chapter');
      for (const verse of [...rig.host.querySelectorAll('[data-testid="verse"]')].slice(0, 1)) {
        await act(async () => {
          verse.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
          );
        });
        const plant = [...rig.host.querySelectorAll('[role="button"]')].some(
          (node) => node.getAttribute('aria-label') === 'Plant',
        );
        if (plant) reached.push(`${scheme} verses chosen`);
        await held(rig, scheme, 'verses chosen', report);
      }
      if (rig.faults.length > 0) report.push(`${scheme} rig: ${rig.faults.join(' | ')}`);
      await rig.leave();
    }
    setSystem('light');
    expect({ report, reached, pressed: presses.pressed > 20 }).toEqual({
      report: [],
      pressed: true,
      reached: ['light', 'dark'].flatMap((scheme) =>
        [
          'the field',
          'every stage',
          'the ask',
          'a remove landed',
          'a remove pending',
          'About',
          'the field again',
          'the books',
          'a book',
          'a chapter',
          'verses chosen',
        ].map((where) => `${scheme} ${where}`),
      ),
    });
  });

  it('holds When I need… and its cards to the oracle', async () => {
    const report: string[] = [];
    const cards: number[] = [];
    for (const scheme of ['light', 'dark'] as const) {
      setSystem(scheme);
      const need = needDevice([
        recordOf('Isaiah 41:10', NOW - 3 * 60_000),
        recordOf('Psalms 56:3', NOW - 2 * 60_000),
      ]);
      const rig = await launchNeed(need, { now: NOW });
      await rig.until(() => rig.has(NEED));
      await rig.tap(NEED);
      await rig.until(() => rig.headings().includes(NEED));
      cards.push(rig.host.querySelectorAll('[data-testid="need-card"]').length);
      await held(rig, scheme, NEED, report);
      if (rig.faults.length > 0) report.push(`${scheme} rig: ${rig.faults.join(' | ')}`);
      await rig.leave();
    }
    setSystem('light');
    expect({ report, cards: cards.every((count) => count > 0) }).toEqual({
      report: [],
      cards: true,
    });
  });
});
