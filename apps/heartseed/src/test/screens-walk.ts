/* oxlint-disable effect/noAsyncFunction, effect/noTernary, eslint/no-await-in-loop -- a React screen walk: it drives launches of the root in happy-dom through the rigs' promise-based taps, one awaited step after another. */

/**
 * The walks `src/look/screens.test.tsx` (light) and
 * `src/look/screens-dark.test.tsx` (dark) run, one scheme each, so each
 * part stays inside its time budget: the field, About, the chooser and
 * When I need… in the scheme, and across a flip of the system on each,
 * through the bar rig and the need rig, which hold every frame (each DOM
 * mutation batch) to the frame oracle (`look.ts`) for the system's scheme
 * at that frame, beside their own rules. Each settled screen is also held
 * to the oracle for the scheme shown, with each control pressed in turn.
 */

import { act } from 'react';

import type { Scheme } from '../theme';
import { mountBar } from './bar-rig';
import { recallOf } from './field-model';
import { record } from './field-rig';
import { lookFaults, pressedFaults, setSystem } from './look';
import { launchNeed, needDevice, recordOf } from './need-rig';
import { device } from './one';
import { KEY, storedText } from './passages-model';

const NOW = Date.UTC(2026, 4, 12, 15);
const NEED = 'When I need…';
const other = (scheme: Scheme): Scheme => (scheme === 'light' ? 'dark' : 'light');

type Bar = Awaited<ReturnType<typeof mountBar>>;

const headingOf = (host: Element) =>
  host.querySelector('[role="heading"]')?.textContent?.trim() ?? '';

/** The screen shown, held to the oracle in `scheme` with each control pressed in turn (counted in `presses`), then after a flip of the system, then flipped back. */
const held = async (
  rig: { readonly host: Element; readonly until: Bar['until'] },
  scheme: Scheme,
  where: string,
  report: string[],
  presses: { pressed: number },
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

/** The places the field walk must reach in each scheme. */
export const FIELD_PLACES = [
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
];

/** The field (every stage, a remove asked and pending), About and the chooser (books, a chapter, verses chosen, Plant) in `scheme`: the faults found, the places reached and how many controls were seen pressed. */
export const walkFieldScreens = async (scheme: Scheme) => {
  const report: string[] = [];
  const reached: string[] = [];
  const presses = { pressed: 0 };
  device.launch([
    record(recallOf('Made 1:1', Date.UTC(2026, 9, 1), 3, 0)),
    ['heartseed/voice/enabled', 'false'],
    [KEY, storedText([{ book: 19, chapter: 117, first: 1, last: 2 }])],
  ]);
  setSystem(scheme);
  const rig = await mountBar(0, false);
  const step = async (label: string, want: string, where: string, tap = () => rig.tap(label)) => {
    if (!(await tap())) return;
    if (!(await rig.until(() => want === '' || headingOf(rig.host) === want))) return;
    reached.push(where);
    await held(rig, scheme, where, report, presses);
  };
  await rig.until(() => headingOf(rig.host) === 'Today');
  await held(rig, scheme, 'Today', report, presses);
  await step('Your field', 'Your field', 'the field');
  const drawn = new Set(
    [...rig.host.querySelectorAll('img')].flatMap(
      (node) =>
        /\/assets\/home\/(seed|blade|ear|corn)-/u.exec(String(node.getAttribute('src')))?.[1] ?? [],
    ),
  );
  if (rig.host.querySelectorAll('[data-testid="plant-soil"]').length > 0) drawn.add('soil');
  if (drawn.size >= 5) reached.push('every stage');
  await step('Remove Psalms 117:1-2', 'Your field', 'the ask');
  const pending = { frames: 0 };
  const watch = new MutationObserver(() => {
    const keep = rig.control('Keep');
    if (keep?.getAttribute('aria-disabled') === 'true') pending.frames += 1;
  });
  watch.observe(rig.host, { subtree: true, attributes: true, childList: true });
  await step('Remove', 'Your field', 'a remove landed');
  watch.disconnect();
  if (pending.frames > 0) reached.push('a remove pending');
  await step('About', 'About', 'About');
  await step('Your field', 'Your field', 'the field again');
  await step('Add verses', 'Add a passage', 'the books', () => rig.tapId('add-verses'));
  await step('Psalms', 'Psalms', 'a book');
  await step('Psalms 117', 'Psalms 117', 'a chapter');
  for (const verse of [...rig.host.querySelectorAll('[data-testid="verse"]')].slice(0, 1)) {
    await act(async () => {
      verse.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    const plant = [...rig.host.querySelectorAll('[role="button"]')].some(
      (node) => node.getAttribute('aria-label') === 'Plant',
    );
    if (plant) reached.push('verses chosen');
    await held(rig, scheme, 'verses chosen', report, presses);
  }
  if (rig.faults.length > 0) report.push(`rig: ${rig.faults.join(' | ')}`);
  await rig.leave();
  setSystem('light');
  return { report, reached, pressed: presses.pressed };
};

/** When I need… and its cards in `scheme`: the faults found and how many cards showed. */
export const walkNeedScreen = async (scheme: Scheme) => {
  const report: string[] = [];
  const presses = { pressed: 0 };
  setSystem(scheme);
  const need = needDevice([
    recordOf('Isaiah 41:10', NOW - 3 * 60_000),
    recordOf('Psalms 56:3', NOW - 2 * 60_000),
  ]);
  const rig = await launchNeed(need, { now: NOW });
  await rig.until(() => rig.has(NEED));
  await rig.tap(NEED);
  await rig.until(() => rig.headings().includes(NEED));
  const cards = rig.host.querySelectorAll('[data-testid="need-card"]').length;
  await held(rig, scheme, NEED, report, presses);
  if (rig.faults.length > 0) report.push(`rig: ${rig.faults.join(' | ')}`);
  await rig.leave();
  setSystem('light');
  return { report, cards };
};
