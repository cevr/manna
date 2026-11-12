/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noGlobals, eslint/no-await-in-loop -- a model-based walk: it drives the root through React's promise-based act one command at a time, reads DOM absence as null, and compares the screen and the disk as plain JSON text. */

/**
 * The walk of the tour (hsintro O2, O5) through the root, which
 * `src/first/tour-walk.test.tsx` and `tour-walk-planted.test.tsx` run, against `tourStep` as its
 * model, over the field bar's rig (`src/test/bar-rig.tsx`, whose every
 * frame holds the root's rule, hsintro's clauses among them). One device
 * starts fresh and goes through the first minute to Planted's `Continue`;
 * another starts on a planted garden (`TWO_REPLAYS` first). Generated commands, each offered
 * only where its screen shows it: `How Heartseed works`, the Settings
 * sheet's `Show the welcome again`, `Begin`, `Skip`, `See your field`,
 * `Got it`, the card's button to Today and `Your field` back, `Open
 * <title>` and back, the Settings sheet opened and closed, the Add a list
 * sheet opened and closed, a plant tapped (which opens Today on its verse), and a relaunch. After every
 * step the screen and whether the tips show equal the model's; across
 * each replay the field as read and the whole disk are as they were
 * before it.
 */

import { expect } from 'bun:test';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { mountBar, readBar } from './bar-rig';
import { recallOf } from './field-model';
import { record } from './field-rig';
import { device } from './one';
import { closeSettings, modalOf, openSettings, tapInSheet } from './settings-rig';
import { activateSheet } from './shelves-rig';
import { tourStep, type Tour, type TourTap } from '../first/tour';

type Bar = Awaited<ReturnType<typeof mountBar>>;

/** Where the root stands, as the model has it: a screen of the launch, or a sheet over home. */
type Where = 'home' | 'today' | 'list' | 'settings' | 'add';

const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A seeded generator in [0, 1) (mulberry32). */
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** The heading the replay's screens show in home's place. */
const REPLAY: Readonly<Partial<Record<Tour, string>>> = {
  welcome: 'Heartseed',
  grows: 'Every verse is a plant',
};

/** The screens the tips never show on. */
const AWAY: readonly Where[] = ['today', 'list'];

/** What the model owes: the heading (`today`, `list`, the replay's in home's place, else `Your field`) and whether the tips and `Got it` show. */
const wantOf = (where: Where, tour: Tour) => {
  const away = AWAY.includes(where);
  const tips = tour === 'tips' && !away;
  let heading = REPLAY[tour] ?? 'Your field';
  if (away) heading = where;
  return { heading, tips, gotIt: tips };
};

/** What the root shows now, in the model's terms. */
const seenOf = (rig: Bar) => {
  let heading = [...rig.host.querySelectorAll('[role="heading"]')].map(text).join('|');
  if (rig.host.querySelector('[data-testid="list-screen"]') !== null) heading = 'list';
  if (heading === 'Today') heading = 'today';
  return {
    heading,
    tips: rig.host.querySelectorAll('[data-testid^="tip-"]').length > 0,
    gotIt: rig.control('Got it') !== undefined,
  };
};

/** The disk as text, every key and value in order. */
const diskOf = () => JSON.stringify([...device.disk].toSorted(([a], [b]) => a.localeCompare(b)));

const PLANTED = () =>
  device.launch([
    record(recallOf('Made 1:1', Date.UTC(2026, 9, 1), 3, 0)),
    record(recallOf(passage.reference, Date.UTC(2026, 9, 2), 3, 0)),
  ]);

/** The first minute from a fresh install to Planted's `Continue`: Skip, Next and two recitals. The bar's rules (Today's controls fixed) are not the first minute's, whose frames `src/test/first-rig.tsx` holds, so the walk keeps the faults from `Continue` on. */
const firstMinute = async (rig: Bar) => {
  const at = (heading: string) => rig.until(() => seenOf(rig).heading === heading);
  expect(await at('Heartseed')).toBe(true);
  await rig.tap('Skip');
  expect(await at('Hear it')).toBe(true);
  await rig.tap('Next');
  expect(await at('Say it with help')).toBe(true);
  await rig.tap('Say it');
  expect(await at('Say it alone')).toBe(true);
  await rig.tap('Say it');
  expect(await at('Planted')).toBe(true);
  await rig.tap('Continue');
  rig.faults.splice(0);
};

/** One device's walk: the rig, where the model stands, the tour, each move it made, the steps so far and the read before a replay. */
interface Walk {
  rig: Bar;
  where: Where;
  tour: Tour;
  readonly moves: string[];
  readonly log: string[];
  before: { readonly disk: string; readonly field: string } | null;
}

/** The model's tour after `tap`, each move kept. */
const tapTour = (walk: Walk, tap: TourTap) => {
  const after = tourStep(walk.tour, tap);
  if (after !== walk.tour) walk.moves.push(`${walk.tour}>${after}`);
  walk.tour = after;
};

/** After `step`: the screen and the tips the model owes, no frame fault, and once a replay ends on home the field and the disk as before it. */
const check = async (walk: Walk, step: string) => {
  walk.log.push(step);
  const want = wantOf(walk.where, walk.tour);
  const { rig } = walk;
  await rig.until(() => JSON.stringify(seenOf(rig)) === JSON.stringify(want));
  const log = walk.log.join(' > ');
  expect({ log, seen: seenOf(rig), faults: rig.faults }).toEqual({ log, seen: want, faults: [] });
  const ended = walk.where === 'home' && !(walk.tour in REPLAY);
  if (!ended || walk.before === null) return;
  expect({ log, disk: diskOf(), field: JSON.stringify(readBar(rig.host)) }).toEqual({
    log,
    ...walk.before,
  });
  walk.before = null;
};

/** Marks the field and the disk before a replay starts. */
const startReplay = (walk: Walk) => {
  walk.before = { disk: diskOf(), field: JSON.stringify(readBar(walk.rig.host)) };
};

/** A relaunch: a new launch over the same disk, the tour off. */
const relaunch = async (walk: Walk, step: string) => {
  await walk.rig.leave();
  walk.rig = await mountBar(0, false);
  walk.where = 'home';
  walk.tour = 'off';
  walk.before = null;
  await check(walk, step);
};

/** The replayed welcome's taps, the lower half of the roll for `Begin`. */
const WELCOME_TAPS = ['Begin', 'Skip'] as const;

/** On the replayed welcome: `Begin`, `Skip` or a relaunch. */
const onWelcome = async (walk: Walk, roll: number) => {
  if (roll >= 0.9) return relaunch(walk, 'relaunch on the welcome');
  const tap = WELCOME_TAPS[Number(roll >= 0.5)] ?? 'Skip';
  await walk.rig.tap(tap);
  tapTour(walk, tap);
  return check(walk, tap);
};

/** On the replayed second screen: `See your field` or a relaunch. */
const onGrows = async (walk: Walk, roll: number) => {
  if (roll >= 0.85) return relaunch(walk, 'relaunch on how a verse grows');
  await walk.rig.tap('See your field');
  tapTour(walk, 'See');
  return check(walk, 'See your field');
};

/** Leaves home for `where` by `go`, ending the tour. */
const leaveHome = async (walk: Walk, where: Where, step: string, go: () => Promise<unknown>) => {
  await go();
  walk.where = where;
  tapTour(walk, 'Leave');
  return check(walk, step);
};

/** The Today card's one button: `Start` or `Practice anyway`. */
const primaryOf = (rig: Bar) =>
  [...rig.host.querySelectorAll('[role="button"]')]
    .map((node) => node.getAttribute('aria-label') ?? '')
    .find((name) => name === 'Start' || name === 'Practice anyway') ?? 'Start';

/** The first `Open <title>` on home. */
const openOf = (rig: Bar) =>
  [...rig.host.querySelectorAll('[role="button"]')]
    .map((node) => node.getAttribute('aria-label') ?? '')
    .find((name) => name.startsWith('Open ')) ?? 'Open';

/** On home: `How Heartseed works`, `Got it`, Today, a list, either sheet, a plant, or a relaunch. */
const onHome = async (walk: Walk, roll: number) => {
  const { rig } = walk;
  if (roll < 0.22) {
    startReplay(walk);
    await rig.tap('How Heartseed works');
    tapTour(walk, 'How');
    return check(walk, 'How Heartseed works');
  }
  if (roll < 0.32 && walk.tour === 'tips') {
    await rig.tap('Got it');
    tapTour(walk, 'GotIt');
    return check(walk, 'Got it');
  }
  if (roll < 0.44) return leaveHome(walk, 'today', 'to Today', () => rig.tap(primaryOf(rig)));
  if (roll < 0.54) return leaveHome(walk, 'list', 'Open a list', () => rig.tap(openOf(rig)));
  if (roll < 0.66) {
    await openSettings(rig);
    walk.where = 'settings';
    return check(walk, 'Settings');
  }
  if (roll < 0.76) {
    await rig.tapId('add-list');
    await activateSheet(rig.until);
    walk.where = 'add';
    return check(walk, 'Add a list');
  }
  if (roll < 0.88)
    return leaveHome(walk, 'today', 'a plant tapped', () => rig.tapId('field-plant'));
  return relaunch(walk, 'relaunch on home');
};

/** In the Settings sheet: `Show the welcome again`, or `Done`. */
const onSettings = async (walk: Walk, roll: number) => {
  walk.where = 'home';
  if (roll >= 0.5) {
    await closeSettings(walk.rig, 'Done');
    return check(walk, 'Settings closed');
  }
  startReplay(walk);
  await tapInSheet('Show the welcome again');
  await walk.rig.until(() => modalOf() === null);
  tapTour(walk, 'How');
  return check(walk, 'Show the welcome again');
};

/** In the Add a list sheet: closed by Escape. */
const onAdd = async (walk: Walk) => {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Escape' }),
    );
  });
  await walk.rig.until(() => modalOf() === null);
  walk.where = 'home';
  return check(walk, 'Add a list closed');
};

/** One command where the walk stands. */
const command = (walk: Walk, roll: number) => {
  if (walk.where === 'home' && walk.tour === 'welcome') return onWelcome(walk, roll);
  if (walk.where === 'home' && walk.tour === 'grows') return onGrows(walk, roll);
  if (walk.where === 'home') return onHome(walk, roll);
  if (walk.where === 'settings') return onSettings(walk, roll);
  if (walk.where === 'add') return onAdd(walk);
  walk.where = 'home';
  return walk.rig.tap('Your field').then(() => check(walk, 'Your field'));
};

/** The tour's moves every walk's devices make between them. */
export const FLOORS = [
  'off>tips',
  'off>welcome',
  'tips>welcome',
  'welcome>grows',
  'welcome>off',
  'grows>tips',
  'tips>off',
] as const;

/**
 * The rolls that open a walk on both replays: `How Heartseed works`,
 * `Begin`, `See your field`, then the Settings sheet, `Show the welcome
 * again` and `Skip`; each must leave the field and the disk as they were.
 */
export const TWO_REPLAYS = [0.1, 0.1, 0.1, 0.6, 0.1, 0.6] as const;

/** One device: the rolls of `script`, then `steps` generated commands, from its launch; answers each move of the tour it made. */
export const walkDevice = async (
  seed: number,
  steps: number,
  fresh: boolean,
  script: readonly number[] = [],
) => {
  const generated = random(seed);
  const rolls = [...script];
  const next = () => rolls.shift() ?? generated();
  if (fresh) device.launch([['heartseed/voice/enabled', 'false']]);
  else PLANTED();
  const walk: Walk = {
    rig: await mountBar(0, false),
    where: 'home',
    tour: 'off',
    moves: [],
    log: [],
    before: null,
  };
  if (fresh) {
    await firstMinute(walk.rig);
    tapTour(walk, 'Continue');
  }
  await check(walk, 'launch');
  for (let step = 0; step < script.length + steps; step++) await command(walk, next());
  await walk.rig.leave();
  return walk.moves;
};
