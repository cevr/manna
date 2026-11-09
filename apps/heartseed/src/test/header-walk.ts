/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noTryCatch, effect/noThrowStatement, effect/noNewError, eslint/no-await-in-loop -- a React screen walk: it drives launches of the root in happy-dom through React's promise-based `act`, one step after another, over a disk and faults kept in plain maps and sets the steps change, and stops its case with the step's fault when the sheet or home is not the model's; its coverage and second generator one walk's state, set afresh at each walk. */

/**
 * The reader's choices across launches, read in the Settings sheet, for the
 * header's parts: generated devices, each launched three times over the
 * disk the last launch left, through the session rig
 * (`src/test/session-rig.tsx`), which holds every frame to the root's frame
 * rule (no choice under the host on any screen) and the screen's rules, and
 * notes each change of the open sheet's checked Minutes radio and its
 * `Voice` pill (`seen`), and the sheet's rig (`src/test/settings-rig.ts`),
 * which holds every frame of each sheet shown.
 *
 * The oracle is the rules of `src/test/settings-model.ts`: the minutes read
 * as the stored text when it is one of `2` `5` `10` `20`, else 5, and 5
 * when the read fails (S8); the voice's choice the choice key's text when it
 * reads as `off`, `her` or `him`, else Off only for the old switch's text
 * `false` and Her otherwise, a failed read of either key read as missing
 * (hsspeaker D2). A read launch lands on home, whose counts line is the
 * session model's (`src/test/session-model.ts`) over the plan made at its
 * first show, with `Begin` exactly when the run's model
 * (`src/test/run-model.ts`) shows an item; the sheet opened there shows the
 * values read on its first frame, and `Done` closes it; then `Begin` leads
 * to Today, or in the done state the launch ends on home.
 *
 * Every Minutes and Voice choice is the reader's trip from Today: `Your
 * field` to home (its counts the plan's, `Begin` exactly when Today showed
 * an action), the gear, the sheet showing the model's choices, the radio
 * `<n> min` (the plan made at that tap, the radio checked and home's counts
 * under the sheet the new plan's) or `Voice` (the pill the cycle's next,
 * Off, Her, Him; the plan unchanged), `Done`, the sheet's frames
 * faultless, then `Begin` and Today, or home's done state, which ends the
 * launch. Each tap's write lands unless the store refuses it, in which case
 * the choice holds for the launch and the next launch reads the disk;
 * nothing else writes either key, and a launch writes nothing (S15). Each
 * change the sheet showed over a launch is a value read or a tap's.
 *
 * An unread launch opens Today and offers no `Settings`, `Your field`,
 * `Voice` or Minutes, and writes nothing. While Say it listens, nothing
 * that makes the plan is in reach anywhere in the document: no `Settings`,
 * `Your field`, `Plant`, `Remove`, `<n> min` radio, `Minutes` group, `Voice`
 * or sheet. A recital where Today offers no Say it (its item done, or the
 * done state) first makes a new plan at the passage's due: Next, the clock
 * set to the due, and a Minutes trip to the minutes checked, which ends on
 * Today with Say it.
 */

import { expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import type { Recall } from '../sayit';
import type { Minutes } from '../session';
import { MINUTES_KEY } from '../session/service';
import { CHOICE_KEY, ENABLED_KEY, nextChoice, type Choice } from '../voice';
import { toDue } from './clock';
import { below, keyOf, pickOf, PREFIX, random } from './garden-model';
import { rootFaults } from './root-rule';
import { madeModel, NO_RUN, shownModel } from './run-model';
import { countsModel, planModel } from './session-model';
import {
  choicesOf,
  deviceOf,
  faultsOf,
  launch,
  type Device,
  type Faults,
  type Launch,
} from './session-rig';
import { minutesRule, voiceRule } from './settings-model';
import { closeSettings, modalOf, openSettings, tapInSheet, watchSheet } from './settings-rig';
import { hostOffset } from './zone';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The instant of every walk's first launch. */
export const AT = Date.UTC(2026, 10, 5, 15);

/** The app's own piece: the passage, its own group. */
const PIECE = {
  reference: passage.reference,
  words: sourceWords(passage.text).length,
  group: passage.reference,
};

/** The texts a disk may hold under the minutes key: absent, the four, and texts none of the four. */
const STORED: readonly [string | undefined, ...(string | undefined)[]] = [
  undefined,
  '2',
  '5',
  '10',
  '20',
  '7',
  '',
  '05',
  '"10"',
  '10.0',
  'ten',
  '20 ',
];
/** The texts a disk may hold under the old switch's key. */
const OLD_VOICES: readonly [string | undefined, ...(string | undefined)[]] = [
  undefined,
  'true',
  'false',
  'off',
];
/** The texts a disk may hold under the choice's key. */
const VOICES: readonly [string | undefined, ...(string | undefined)[]] = [
  undefined,
  undefined,
  'off',
  'her',
  'him',
  'Her',
];
const MINUTES: readonly [Minutes, ...Minutes[]] = [2, 5, 10, 20];

/** What the Voice button says of a choice, as the rig reads it: its value, the choice's word. */
const shownOf = (choice: Choice) => `Voice:${{ off: 'Off', her: 'Her', him: 'Him' }[choice]}`;

const recallOf = (reference: string, startedAt: number): Recall => ({
  reference,
  startedAt,
  offset: 0,
  grade: 3,
  suggested: 3,
  words: 4,
  missed: 0,
  peeked: 0,
  extra: 0,
});

/** What a reader planted before: the passage, another verse only, or nothing (the first minute opens). */
type History = 'passage' | 'other' | 'none';

/** A device whose disk holds `minutes`, `voice` and `old` under their keys and the recall of `history`, three days before `AT`. */
export const deviceFor = (
  history: History,
  minutes: string | undefined,
  voice: string | undefined,
  old: string | undefined,
) => {
  const entries: (readonly [string, string])[] = [];
  if (minutes !== undefined) entries.push([MINUTES_KEY, minutes]);
  if (voice !== undefined) entries.push([CHOICE_KEY, voice]);
  if (old !== undefined) entries.push([ENABLED_KEY, old]);
  const planted = { passage: passage.reference, other: 'Made 1:1', none: null }[history];
  if (planted !== null) {
    const recall = recallOf(planted, AT - 3 * DAY);
    entries.push([keyOf(recall), JSON.stringify(recall)]);
  }
  return deviceOf(entries);
};

const SETTINGS = [MINUTES_KEY, CHOICE_KEY, ENABLED_KEY];

/** The items of a plan, as the session's model makes them. */
type Items = ReturnType<typeof planModel>['items'];

/** The model of one device: what its disk holds under each key, and what the launch under way shows. */
interface Model {
  disk: { minutes: string | undefined; voice: string | undefined; old: string | undefined };
  minutes: Minutes;
  voice: Choice;
  /** The items of the plan as it stands; null on an unread launch. */
  plan: Items | null;
  /** Each value the launch's sheet showed, in order. */
  shown: { minutes: string[]; voice: string[] };
  settingsWrites: number;
}

/** The walk under way's state: its coverage, and a second generator for the old switch's draws, so the commands' generator runs as it did before the old key was drawn. */
const walk = { coverage: new Map<string, number>(), aside: random(0x01d5) };

const cover = (name: string) => walk.coverage.set(name, (walk.coverage.get(name) ?? 0) + 1);

const fail = (message: string): never => {
  throw new Error(message);
};

/** What the disk holds of the settings and what else was written, against what the model says it holds. */
const diskOf = (device: Device, m: Model) => ({
  shown: {
    minutes: device.disk.get(MINUTES_KEY),
    voice: device.disk.get(CHOICE_KEY),
    old: device.disk.get(ENABLED_KEY),
    writes: device.writes.filter((key) => SETTINGS.includes(key)).length,
    others: device.writes.filter(
      (key) => !SETTINGS.includes(key) && !key.startsWith('heartseed/recall/'),
    ),
  },
  want: {
    minutes: m.disk.minutes,
    voice: m.disk.voice,
    old: m.disk.old,
    writes: m.settingsWrites,
    others: [],
  },
});

/** Holds the disk to the model once its writes caught up with the last step: each key's text, the settings writes' count, and no other write but recalls. */
const settle = async (app: Launch, device: Device, m: Model, step: string) => {
  await app.until(() => {
    const { shown, want } = diskOf(device, m);
    return JSON.stringify(shown) === JSON.stringify(want);
  });
  const { shown, want } = diskOf(device, m);
  expect({ step, ...shown }).toEqual({ step, ...want });
};

/** Collapses runs of one value, as the rig notes each change. */
const changes = (values: readonly string[]) =>
  values.filter((value, at) => at === 0 || values[at - 1] !== value);

/** The device whose disk holds no recall, so each launch opens the first minute. */
const FIRST = 7;

/** One launch under way: its rig, its device and faults, the model, the generator, the clock and the step's name. */
interface Run {
  readonly app: Launch;
  readonly device: Device;
  readonly faults: Faults;
  readonly m: Model;
  readonly next: () => number;
  readonly time: { now: number | null };
  readonly step: string;
}

/** What a stored text is, for the coverage. */
const storedKind = (text: string | undefined) => {
  if (text === undefined) return 'absent';
  if (MINUTES.some((n) => String(n) === text)) return 'valid';
  return 'bad';
};

/** What device `d` planted: nothing for `FIRST`, else the passage or another verse. */
const historyFor = (next: () => number, d: number): History => {
  if (d === FIRST) return 'none';
  return pickOf(next, ['passage', 'other']);
};

/** The stored text of device `d`: each of `STORED` in turn, then any. */
const storedFor = (next: () => number, d: number) => {
  if (d < STORED.length) return STORED[d];
  return pickOf(next, STORED);
};

/** A launch's listing: unread (never for the first minute, which an unread garden never opens), held, or read. */
const listingOf = (roll: number, history: History): Faults['listing'] => {
  if (roll < 0.2 && history !== 'none') return 'unread';
  if (roll < 0.35) return 'held';
  return 'ok';
};

/** The recalls the disk holds, by reference. */
const plantsOn = (device: Device) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of device.disk) {
    if (!key.startsWith(PREFIX)) continue;
    const recall: Recall = JSON.parse(value);
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  }
  return plants;
};

/** How many recalls of `reference` the disk holds now. */
const recallsOn = (device: Device) => {
  const plants = plantsOn(device);
  return (reference: string) => plants.get(reference)?.length ?? 0;
};

/** What home shows over a plan made now, by the session's and the run's models: the plan's items, its counts line, and `Begin` exactly when the run shows an item. */
const homeModel = (run: Omit<Run, 'app'>) => {
  const plants = plantsOn(run.device);
  const at = run.time.now ?? AT;
  const items = planModel({
    plants,
    pieces: [PIECE],
    at,
    offset: hostOffset(at),
    minutes: run.m.minutes,
  }).items;
  const recallsNow = recallsOn(run.device);
  return {
    items,
    counts: countsModel(items, recallsNow),
    begin: shownModel(madeModel(NO_RUN, items, false), recallsNow) !== null,
  };
};

/** Home's counts line of the plan as it stands, over the disk's recalls now. */
const countsNow = (run: Run) => {
  if (run.m.plan === null) return [];
  return [countsModel(run.m.plan, recallsOn(run.device))];
};

/** What the open sheet shows of the choices: its checked Minutes radio and its Voice pills. */
const sheetShown = () => {
  const shown = choicesOf(modalOf() ?? document.createElement('div'));
  return { checked: shown.checked, voices: shown.voices };
};

/**
 * The sheet opened under a watch of its frames, its checked radio and its
 * pill the model's at `when` (`at launch`, `at the open`); fails
 * `<step>: the sheet <when> showed …, expected …`.
 */
const openSheet = async (run: Run, when: string) => {
  const { app, m, step } = run;
  const watch = watchSheet();
  try {
    await openSettings(app);
  } catch (error) {
    watch.stop();
    fail(`${step}: ${String(error)}`);
  }
  const want = JSON.stringify({ checked: [`${m.minutes} min`], voices: [shownOf(m.voice)] });
  if (!(await app.until(() => JSON.stringify(sheetShown()) === want))) {
    watch.stop();
    fail(`${step}: the sheet ${when} showed ${JSON.stringify(sheetShown())}, expected ${want}`);
  }
  return watch;
};

/** `Done`, then the sheet's frames faultless with at least one look-checked; fails `<step>: the sheet stayed after Done` or `<step>: sheet <faults>, its look checked on <n> frames`. */
const closeSheet = async (run: Run, watch: ReturnType<typeof watchSheet>) => {
  const closed = await closeSettings(run.app, 'Done');
  watch.stop();
  if (!closed) fail(`${run.step}: the sheet stayed after Done`);
  if (watch.faults.length > 0 || watch.frames.looked === 0)
    fail(
      `${run.step}: sheet ${watch.faults.join('; ') || 'faultless'}, its look checked on ${watch.frames.looked} frames`,
    );
};

/** Whether Today shows its action: `Say it` or `Next`. */
const actedOn = (app: Launch) => app.has('Say it') || app.has('Next');

/** In an unread launch, in place of a trip: no Settings, no Your field, no Voice, no `<n> min` radio and no Minutes group show, and nothing is written. */
const noChoices = (run: Run, floor: string) => {
  const { app, step } = run;
  const shown =
    app.has('Settings') ||
    app.has('Your field') ||
    app.has('Voice') ||
    MINUTES.some((each) => app.has(`${each} min`)) ||
    app.host.querySelector('[role="radiogroup"][aria-label="Minutes"]') !== null;
  if (shown) fail(`${step}: a Minutes, Voice or Settings on an unread garden`);
  cover(floor);
};

/**
 * A trip's way out from Today: `Your field` to home, held to the model as
 * it stands (the one heading, the counts of the plan, `Begin` exactly when
 * Today showed an action), then the sheet opened showing the model's
 * choices.
 */
const tripOut = async (run: Run) => {
  const { app, step } = run;
  const acted = actedOn(app);
  await app.tap('Your field');
  const want = { headings: ['Your field'], counts: countsNow(run), begin: acted };
  const shown = () => ({
    headings: app.headings(),
    counts: app.homeCounts(),
    begin: app.has('Begin'),
  });
  const same = () => JSON.stringify(shown()) === JSON.stringify(want);
  await app.until(same);
  if (!acted) await app.until(() => false, 10);
  if (!same())
    fail(`${step}: home showed ${JSON.stringify(shown())}, expected ${JSON.stringify(want)}`);
  if (!acted) {
    expect({ step, root: rootFaults(app.host, 'read') }).toEqual({ step, root: [] });
    cover('field, done');
  }
  return { acted, watch: await openSheet(run, 'at the open') };
};

/**
 * A trip's way back: `Done` and the sheet's frames, then `Begin` and Today
 * with its action when `begin`; else home stays with no `Begin` and the
 * root's frame rule, and the launch ends there (true).
 */
const tripBack = async (run: Run, watch: ReturnType<typeof watchSheet>, begin: boolean) => {
  const { app, step } = run;
  await closeSheet(run, watch);
  if (begin) {
    await app.tap('Begin');
    if (!(await app.until(() => app.headings().includes('Today') && actedOn(app))))
      fail(`${step}: no Today after Begin, at ${app.headings().join('|')}`);
    return false;
  }
  await app.until(() => false, 10);
  expect({ step, begin: app.has('Begin'), root: rootFaults(app.host, 'read') }).toEqual({
    step,
    begin: false,
    root: [],
  });
  cover('trip ended on home');
  return true;
};

/**
 * A Minutes choice the reader's way: from Today, `Your field`, the gear,
 * the radio `<n> min` (its write refused when `refused`), the plan made at
 * that tap, the radio checked and home's counts under the sheet the new
 * plan's, `Done`, then `Begin` and Today when the new plan shows an item,
 * else home's done state, which ends the launch (true).
 */
const minutesTrip = async (run: Run, n: Minutes, refused: boolean) => {
  const { app, device, faults, m, step } = run;
  const { watch } = await tripOut(run);
  if (refused) faults.refuse.add(MINUTES_KEY);
  if (!(await tapInSheet(`${n} min`))) {
    watch.stop();
    fail(`${step}: no ${n} min in the sheet`);
  }
  m.minutes = n;
  m.shown.minutes.push(`${n} min`);
  if (!refused) {
    m.disk.minutes = String(n);
    m.settingsWrites += 1;
  }
  const made = homeModel(run);
  m.plan = made.items;
  const want = JSON.stringify([countsModel(made.items, recallsOn(device))]);
  const radio = JSON.stringify([`${n} min`]);
  if (
    !(await app.until(
      () =>
        JSON.stringify(sheetShown().checked) === radio && JSON.stringify(app.homeCounts()) === want,
    ))
  ) {
    watch.stop();
    fail(
      `${step}: ${n} min not checked with the plan's counts, home showed ${JSON.stringify(app.homeCounts())} under ${JSON.stringify(sheetShown().checked)}, expected ${want}`,
    );
  }
  cover('settings:minutes');
  return tripBack(run, watch, made.begin);
};

/**
 * A Voice choice the reader's way: from Today, `Your field`, the gear,
 * `Voice` (its write refused when `refused`), the pill the cycle's next and
 * home's counts under the sheet unchanged, `Done`, then `Begin` and Today
 * when Today showed an action, else home's done state, which ends the
 * launch (true).
 */
const voiceTrip = async (run: Run, refused: boolean) => {
  const { app, faults, m, step } = run;
  const { acted, watch } = await tripOut(run);
  const counts = JSON.stringify(countsNow(run));
  if (refused) faults.refuse.add(CHOICE_KEY);
  if (!(await tapInSheet('Voice'))) {
    watch.stop();
    fail(`${step}: no Voice in the sheet`);
  }
  m.voice = nextChoice(m.voice);
  m.shown.voice.push(shownOf(m.voice));
  cover(`voice tap to ${m.voice}`);
  if (!refused) {
    m.disk.voice = m.voice;
    m.settingsWrites += 1;
  }
  const want = JSON.stringify([shownOf(m.voice)]);
  if (
    !(await app.until(
      () =>
        JSON.stringify(sheetShown().voices) === want && JSON.stringify(app.homeCounts()) === counts,
    ))
  ) {
    watch.stop();
    fail(
      `${step}: Voice: the sheet showed ${JSON.stringify(sheetShown().voices)} over ${JSON.stringify(app.homeCounts())}, expected ${want} over ${counts}`,
    );
  }
  cover('settings:voice');
  return tripBack(run, watch, acted);
};

/** The trip of a `kind` choice, its minutes drawn now for a Minutes one. */
const tripOf = (run: Run, kind: 'minutes' | 'voice', refused: boolean) => {
  if (kind === 'voice') return () => voiceTrip(run, refused);
  const n = pickOf(run.next, MINUTES);
  return () => minutesTrip(run, n, refused);
};

/** A Minutes or a Voice choice, its write refused by the store one time in five: a trip through the sheet, or, in an unread launch, no choice offered; true when the trip ended the launch on home. */
const tapCommand = async (run: Run, kind: 'minutes' | 'voice') => {
  const refused = run.next() < 0.2;
  const trip = tripOf(run, kind, refused);
  if (run.faults.listing === 'unread') {
    noChoices(run, `${kind}:none-unread`);
    return false;
  }
  const ended = await trip();
  if (refused) cover(`refused ${kind} tap`);
  else cover(`${kind} tap`);
  return ended;
};

/** The passage's recalls on the disk. */
const passageRecalls = (device: Device) =>
  [...device.disk]
    .filter(([key]) => key.startsWith(`heartseed/recall/${passage.reference}/`))
    .map(([, value]): Recall => JSON.parse(value));

/**
 * Where Today offers no Say it (its item done, or the done state): `Next`
 * when it shows, the clock set to the passage's due, and a Minutes trip to
 * the minutes checked, which makes a new plan that offers it and ends on
 * Today with `Say it`.
 */
const renewCommand = async (run: Run, at: string) => {
  const { app, device, m } = run;
  if (app.has('Say it')) return;
  if (app.has('Next')) await app.tap('Next');
  toDue(run.time, passageRecalls(device));
  const ended = await minutesTrip(run, m.minutes, false);
  expect({ at, offered: !ended && (await app.until(() => app.has('Say it'))) }).toEqual({
    at,
    offered: true,
  });
  cover('new plan at the due');
};

/** What makes the plan, or opens the sheet that does, in reach anywhere in the document: each control, radio, group or sheet by its name. */
const inReach = () => {
  const names = [...document.querySelectorAll('[role="button"],[role="radio"],[role="link"]')]
    .map((node) => node.getAttribute('aria-label') ?? (node.textContent ?? '').trim())
    .filter(
      (name) =>
        ['Settings', 'Your field', 'Plant', 'Remove', 'Voice'].includes(name) ||
        name.startsWith('Remove ') ||
        /^\d+ min$/.test(name),
    );
  if (document.querySelector('[role="radiogroup"][aria-label="Minutes"]') !== null)
    names.push('Minutes');
  if (document.querySelector('[aria-modal]') !== null) names.push('a sheet');
  return names;
};

/** A recital held open, nothing that makes the plan in reach anywhere while it listens, then finished: its recall kept, the action reads `Next` (`Say it` in an unread garden, which runs no plan). */
const sayCommand = async (run: Run, at: string) => {
  const { app, device, m } = run;
  await renewCommand(run, at);
  await settle(app, device, m, `${at} renewed`);
  await app.tap('Say it');
  expect(await app.until(() => app.has('Listening'))).toBe(true);
  const reach = inReach();
  if (reach.length > 0) fail(`${at}: ${reach.join(', ')} in reach while listening`);
  cover('listening:bare');
  await app.tap('Listening');
  const then = ({ unread: 'Say it', held: 'Next', ok: 'Next' } as const)[run.faults.listing];
  expect({ at, then, shown: await app.until(() => app.has(then)) }).toEqual({
    at,
    then,
    shown: true,
  });
  cover('recital');
};

/** The field and back to Today by `Begin`, offered only in a read garden, while Today shows an action; in the done state home shows no `Begin` and keeps the root's frame rule (`rootFaults`), and the launch ends there (true). */
const fieldCommand = async (run: Run) => {
  if (run.faults.listing === 'unread') return false;
  const acted = actedOn(run.app);
  await run.app.tap('Your field');
  expect(
    await run.app.until(
      () => run.app.headings().includes('Your field') && run.app.homeCounts().length > 0,
    ),
  ).toBe(true);
  if (!acted) {
    expect({
      step: run.step,
      begin: run.app.has('Begin'),
      root: rootFaults(run.app.host, 'read'),
    }).toEqual({ step: run.step, begin: false, root: [] });
    cover('field, done');
    return true;
  }
  await run.app.tap('Begin');
  expect(await run.app.until(() => run.app.headings().includes('Today'))).toBe(true);
  cover('field and back');
  return false;
};

/** Time passing on the clock: a minute, an hour or the night. */
const waitCommand = async (run: Run) => {
  run.time.now = (run.time.now ?? AT) + pickOf(run.next, [60_000, HOUR, 13 * HOUR]);
  await run.app.until(() => false, 5);
  cover('wait');
};

const COMMANDS = ['minutes', 'minutes', 'voice', 'say', 'field', 'wait'] as const;

/** One generated command, then the disk held to the model; true when it ended the launch on home. */
const command = async (run: Run, c: number) => {
  const at = `${run.step} command ${c}`;
  const kind = pickOf(run.next, COMMANDS);
  let ended = false;
  if (kind === 'minutes' || kind === 'voice') ended = await tapCommand(run, kind);
  if (kind === 'say') await sayCommand(run, at);
  if (kind === 'field') ended = await fieldCommand(run);
  if (kind === 'wait') await waitCommand(run);
  await settle(run.app, run.device, run.m, at);
  run.faults.refuse.clear();
  return ended;
};

/** A held launch shows its pending frame, never Today, until the listing is let go. */
const holdThenRelease = async (app: Launch, step: string) => {
  await app.until(() => false, 15);
  expect({ step, pending: app.frames.pending > 0, today: app.frames.today }).toEqual({
    step,
    pending: true,
    today: 0,
  });
  cover('held');
  app.release();
};

/** A first-minute launch: no frame up to the hear phase shows a choice, and no sheet shows. */
const firstMinute = async (app: Launch, step: string) => {
  app.release();
  expect(await app.until(() => app.headings().includes('Hear it'))).toBe(true);
  expect({
    step,
    faults: app.faults,
    shown: app.frames.shown,
    seen: app.seen,
    sheet: modalOf() !== null,
  }).toEqual({
    step,
    faults: [],
    shown: 0,
    seen: { minutes: [], voice: [] },
    sheet: false,
  });
  cover('first minute');
  await app.leave();
};

/** The launch's faults, generated, with their coverage. */
const faultsFor = (next: () => number, history: History) => {
  const listing = listingOf(next(), history);
  const failGet = new Set<string>();
  if (next() < 0.2) failGet.add(MINUTES_KEY);
  if (next() < 0.12) failGet.add(CHOICE_KEY);
  if (walk.aside() < 0.12) failGet.add(ENABLED_KEY);
  if (listing === 'unread') cover('unread');
  if (failGet.has(MINUTES_KEY)) cover('failed minutes read');
  if (failGet.has(CHOICE_KEY) || failGet.has(ENABLED_KEY)) cover('failed voice read');
  return faultsOf({ listing, failGet });
};

/**
 * A read launch's landing on home: the heading `Your field` alone, the
 * model's counts line, `Begin` exactly when the model shows an item, and no
 * fault; the plan set. Then the sheet at launch, showing the values read,
 * closed by `Done`; then `Begin` to Today with its action, or, in the done
 * state, no Today frame, the sheet's values the only ones seen, and the
 * launch ends on home (true).
 */
const fromHome = async (run: Run) => {
  const { app, m, step } = run;
  const want = homeModel(run);
  await app.until(
    () =>
      app.headings().includes('Your field') &&
      app.homeCounts().length > 0 &&
      app.has('Begin') === want.begin,
  );
  if (!want.begin) await app.until(() => false, 10);
  expect({
    step,
    headings: app.headings(),
    counts: app.homeCounts(),
    begin: app.has('Begin'),
    faults: app.faults,
  }).toEqual({
    step,
    headings: ['Your field'],
    counts: [want.counts],
    begin: want.begin,
    faults: [],
  });
  m.plan = want.items;
  const watch = await openSheet(run, 'at launch');
  m.shown.minutes.push(`${m.minutes} min`);
  m.shown.voice.push(shownOf(m.voice));
  await closeSheet(run, watch);
  cover('sheet at launch');
  if (want.begin) {
    await app.tap('Begin');
    if (!(await app.until(() => app.headings().includes('Today') && actedOn(app))))
      fail(`${step}: no Today after Begin, at ${app.headings().join('|')}`);
    cover('home:begin');
    return false;
  }
  expect({ step, begin: app.has('Begin'), today: app.frames.today, faults: app.faults }).toEqual({
    step,
    begin: false,
    today: 0,
    faults: [],
  });
  cover('home:done');
  return true;
};

/** The end of a launch: no fault, and each change the sheet showed a value read or a tap's. */
const launchEnd = async (app: Launch, m: Model, step: string) => {
  expect({ step, faults: app.faults }).toEqual({ step, faults: [] });
  expect({ step, seen: app.seen }).toEqual({
    step,
    seen: { minutes: changes(m.shown.minutes), voice: changes(m.shown.voice) },
  });
  await app.leave();
};

/** One launch of a device with a recall: on a read garden home first, the sheet at launch, and `Begin` or the launch's end there; on an unread one Today with `Say it`; then 2-4 commands, every frame held to the rig's rules. */
const launchOnce = async (base: Omit<Run, 'app'>, l: number) => {
  const { device, faults, m } = base;
  const app = await launch(device, faults, base.time);
  const run = { ...base, app };
  if (faults.listing === 'held') await holdThenRelease(app, run.step);
  if (l > 0 && m.settingsWrites > 0) cover('relaunch after a landed tap');
  m.minutes = minutesRule(m.disk.minutes, faults.failGet.has(MINUTES_KEY));
  m.voice = voiceRule(
    m.disk.voice,
    faults.failGet.has(CHOICE_KEY),
    m.disk.old,
    faults.failGet.has(ENABLED_KEY),
  );
  m.plan = null;
  m.shown = { minutes: [], voice: [] };
  if (faults.listing !== 'unread' && (await fromHome(run))) {
    await launchEnd(app, m, run.step);
    return;
  }
  if (faults.listing === 'unread')
    expect(await app.until(() => app.headings().includes('Today') && app.has('Say it'))).toBe(true);
  await settle(app, device, m, `${run.step} at launch`);
  const commands = 2 + below(run.next, 3);
  for (let c = 0; c < commands; c += 1) if (await command(run, c)) break;
  await launchEnd(app, m, run.step);
};

/** A generated device, launched three times over the disk each launch leaves (once, for the first minute). */
const deviceRun = async (next: () => number, d: number) => {
  const history = historyFor(next, d);
  const stored = storedFor(next, d);
  const voiced = pickOf(next, VOICES);
  const old = pickOf(walk.aside, OLD_VOICES);
  cover(`stored:${storedKind(stored)}`);
  const device = deviceFor(history, stored, voiced, old);
  const m: Model = {
    disk: { minutes: stored, voice: voiced, old },
    minutes: 5,
    voice: 'her',
    plan: null,
    shown: { minutes: [], voice: [] },
    settingsWrites: 0,
  };
  for (let l = 0; l < 3; l += 1) {
    const faults = faultsFor(next, history);
    const time = { now: AT + l * DAY };
    const step = `device ${d} launch ${l} (${history}, ${faults.listing}, ${[...faults.failGet].join(' ')})`;
    if (history === 'none') {
      await firstMinute(await launch(device, faults, time), step);
      return;
    }
    await launchOnce({ device, faults, m, next, time, step }, l);
  }
};

/** The header's walk over `devices` (each device's index picks its stored text and whether it is the first minute's), its commands drawn from `seed`: the coverage it met. */
export const headerRun = async (seed: number, devices: readonly number[]) => {
  walk.coverage = new Map();
  walk.aside = random(0x01d5);
  const next = random(seed);
  for (const d of devices) await deviceRun(next, d);
  return walk.coverage;
};

/** One part's case of the header's walk: `devices` from `seed`, each of `floors` met at least its number of times. */
export const headerCase = (
  seed: number,
  devices: readonly number[],
  floors: Readonly<Record<string, number>>,
) =>
  it(`over generated devices ${devices.join(',')}, launches and trips through Settings, shows and stores the reader’s choices by the rules`, async () => {
    const coverage = await headerRun(seed, devices);
    console.log(`coverage ${JSON.stringify(Object.fromEntries(coverage))}`);
    expect(
      Object.entries(floors).filter(([name, floor]) => (coverage.get(name) ?? 0) < floor),
    ).toEqual([]);
  });
