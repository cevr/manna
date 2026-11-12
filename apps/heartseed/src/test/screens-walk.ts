/* oxlint-disable effect/noAsyncFunction, effect/noTernary, effect/noNullish, eslint/no-await-in-loop -- a React screen walk: it drives launches of the root in happy-dom through the rigs' promise-based taps, one awaited step after another, reading a node's absent attributes as null. */

/**
 * The walks `src/look/screens.test.tsx` (light) and
 * `src/look/screens-dark.test.tsx` (dark) run, with the add's half in
 * `screens-b.test.tsx` and `screens-dark-b.test.tsx`, one scheme each, so each
 * part stays inside its time budget: the field (the launch's home), Today
 * by `Start` and home again by `Your field`, Today by a plant's tap and
 * home again, About (by
 * home's `Settings` and the sheet's `About`, the sheet's frames held to
 * `sheetFaults`), the Add a list sheet with `Psalms` open (held to
 * `addSheetFaults` in the scheme shown, each of its controls pressed in
 * turn), and the chooser by its `Any passage`, in the scheme, and across a
 * flip of the system on each, through the bar rig, which holds every frame (each DOM
 * mutation batch) to the frame oracle (`look.ts`) for the system's scheme
 * at that frame, beside its own rules. Each settled screen is also held
 * to the oracle for the scheme shown, with each control pressed in turn.
 */

import { act } from 'react';

import type { Scheme } from '../theme';
import { mountBar } from './bar-rig';
import { recallOf } from './field-model';
import { record } from './field-rig';
import { lookFaults, pressedFaults, setSystem } from './look';
import { device } from './one';
import { KEY, storedText } from './passages-model';
import { openSettings, tapInSheet, watchSheet } from './settings-rig';
import { activateSheet, addSheetFaults, tapSheet } from './shelves-rig';

const other = (scheme: Scheme): Scheme => (scheme === 'light' ? 'dark' : 'light');

type Bar = Awaited<ReturnType<typeof mountBar>>;

const headingOf = (host: Element) =>
  host.querySelector('[role="heading"]')?.textContent?.trim() ?? '';

/** The screen shown, held to the oracle in `scheme` with each control pressed in turn (counted in `presses`), then after a flip of the system, then flipped back; `also` adds a rule's faults in the scheme shown. */
const held = async (
  rig: { readonly host: Element; readonly until: Bar['until'] },
  scheme: Scheme,
  where: string,
  report: string[],
  presses: { pressed: number },
  also: (shown: Scheme) => readonly string[] = () => [],
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
      ...also(shown),
      ...(press ? await pressedFaults(rig.host, shown, presses) : []),
    ];
    if (faults.length > 0) report.push(`${where} [${shown}]: ${faults.join('; ')}`);
  }
};

/** The places the field walk must reach in each scheme. */
export const FIELD_PLACES = [
  'the field',
  'Today',
  'home from Today',
  'Today by a plant',
  'home from its Today',
  'every stage',
  'the list page',
  'the ask',
  'a remove refused',
  'a remove pending',
  'a remove landed',
  'About',
  'the field again',
];

/** The places the add walk must reach in each scheme. */
export const ADD_PLACES = [
  'the field',
  'the sheet',
  'the books',
  'a book',
  'a chapter',
  'verses chosen',
];

/** The root over a disk with one passage held, in `scheme`, and its step: a tap, then the heading `want`, then the screen held to the oracle and its place reached. */
const launchScreens = async (scheme: Scheme, report: string[], reached: string[]) => {
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
  if (await rig.until(() => headingOf(rig.host) === 'Your field')) reached.push('the field');
  return { rig, presses, step };
};

/** The field (every stage, a remove asked and pending) and About in `scheme`: the faults found, the places reached and how many controls were seen pressed. */
export const walkFieldScreens = async (scheme: Scheme) => {
  const report: string[] = [];
  const reached: string[] = [];
  const { rig, presses, step } = await launchScreens(scheme, report, reached);
  await held(rig, scheme, 'the field', report, presses);
  await step('Start', 'Today', 'Today');
  await step('Your field', 'Your field', 'home from Today');
  const bare = [...rig.host.querySelectorAll('[data-testid="field-plant"]')]
    .map((node) => node.getAttribute('aria-label') ?? '')
    .find((name) => name.startsWith('Psalms 117:1, '));
  if (bare !== undefined) {
    await step(bare, 'Today', 'Today by a plant');
    await step('Your field', 'Your field', 'home from its Today');
  }
  const drawn = new Set(
    [...rig.host.querySelectorAll('img')].flatMap(
      (node) =>
        /\/assets\/home\/(seed|blade|ear|corn)-/u.exec(String(node.getAttribute('src')))?.[1] ?? [],
    ),
  );
  if (rig.host.querySelectorAll('[data-testid="plant-soil"]').length > 0) drawn.add('soil');
  if (drawn.size >= 5) reached.push('every stage');
  await step('Open Psalms 117:1-2', 'Psalms 117:1-2', 'the list page');
  await step('Remove Psalms 117:1-2', 'Psalms 117:1-2', 'the ask');
  const pending = { frames: 0 };
  const watch = new MutationObserver(() => {
    const keep = rig.control('Keep');
    if (keep?.getAttribute('aria-disabled') === 'true') pending.frames += 1;
  });
  watch.observe(rig.host, { subtree: true, attributes: true, childList: true });
  device.fail('set', 1);
  await step('Remove', '', 'a remove refused', async () => {
    if (!(await rig.tap('Remove'))) return false;
    return rig.until(() => rig.host.querySelector('[data-testid="remove-alert"]') !== null);
  });
  watch.disconnect();
  device.fail('set', 0);
  if (pending.frames > 0) reached.push('a remove pending');
  await rig.tap('Remove Psalms 117:1-2');
  await step('Remove', 'Your field', 'a remove landed');
  const sheet = watchSheet(() => scheme);
  await step('About', 'About', 'About', async () => {
    await openSettings(rig);
    return tapInSheet('About');
  });
  sheet.stop();
  if (sheet.frames.open === 0) report.push('About reached with no sheet open');
  if (sheet.faults.length > 0) report.push(`sheet: ${sheet.faults.join(' | ')}`);
  await step('Your field', 'Your field', 'the field again');
  if (rig.faults.length > 0) report.push(`rig: ${rig.faults.join(' | ')}`);
  await rig.leave();
  setSystem('light');
  return { report, reached, pressed: presses.pressed };
};

/** The Add verses sheet with `Psalms` open (held to the sheet's rule in the scheme shown) and the chooser (books, a chapter, verses chosen, Plant) in `scheme`: the faults found, the places reached and how many controls were seen pressed. */
export const walkAddScreens = async (scheme: Scheme) => {
  const report: string[] = [];
  const reached: string[] = [];
  const { rig, presses, step } = await launchScreens(scheme, report, reached);
  await rig.tapId('add-list');
  await activateSheet(rig.until);
  await tapSheet('Psalms');
  const open = () =>
    document.querySelectorAll('[data-testid="add-sheet"] [aria-expanded="true"]').length > 0 &&
    document.querySelectorAll('[data-testid="offer"]').length > 0;
  const shown = await rig.until(open);
  for (const sheet of document.querySelectorAll('[data-testid="add-sheet"]')) {
    if (!shown) break;
    reached.push('the sheet');
    const known = new Map<string, readonly string[]>();
    await held({ host: sheet, until: rig.until }, scheme, 'the sheet', report, presses, (shown) =>
      addSheetFaults(document, shown, known),
    );
  }
  await step('Any passage', 'Add a passage', 'the books', () => tapSheet('Any passage'));
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
