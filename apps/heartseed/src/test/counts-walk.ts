/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noTernary, effect/noTryCatch, effect/noThrowStatement, effect/noNewError, eslint/no-await-in-loop -- a React screen walk: it drives launches of the root in happy-dom through React's promise-based `act`, one step after another, over a disk, faults, a clock and a zone kept in plain values the steps change (the generator's choices as plain branches), the zone in `process.env.TZ`, put back in a `finally` even when a step throws, and stops its case with the step's fault when a trip's screen is not the model's; its coverage is one walk's state, set afresh at each walk. */

/**
 * Today's counts line as a reader meets it, for the counts parts:
 * generated devices (fresh installs planted through the first minute, in
 * the evening or the day, and disks of the passage's history beside verses
 * no piece names), each launched three times over the disk the last launch
 * left, in zones that change, through the session rig
 * (`src/test/session-rig.tsx`), which holds every frame to the root's
 * frame rule and the screen's rules (no Minutes and no Voice under the
 * host, the counts line in its form at the top of the scroll view), and
 * the sheet's rig (`src/test/settings-rig.ts`), which holds every frame of
 * each trip's sheet.
 *
 * The oracle is `src/test/session-model.ts`: the plan is the model's over
 * the disk's recalls at the instant home first shows with the garden read
 * (at a read launch, and after Continue in the first minute) and again at
 * each Minutes tap in the sheet, and at no other step (S11). Home then
 * shows the model's counts of that plan and `Start` exactly when the run's
 * model (`src/test/run-model.ts`) shows an item: `Start` leads to Today,
 * and in the done state the launch ends on home with no Today frame. After
 * every step on Today the line is the model's counts of that plan over the
 * disk's recalls now (S12, S13); at the end of a run (every item of a
 * plan that is not empty done, none held) Today reads `The field is
 * tended` over no counts line, the line of what grew and each grown verse's
 * name by `tendedModel`, tallied `end:none`, `end:one` or `end:many`, and
 * home's line stays the plan's. An unread launch, which opens Today,
 * shows no line in any frame (S14) and offers no Minutes, Voice, Settings
 * or Your field. After every step the action button is the run's model's
 * (Say it on the item shown, Next once it is done, none in the done state;
 * Say it always in an unread launch): a press holds the item shown, Next
 * lets it go, and a Minutes tap lets it go.
 *
 * Every Minutes and Voice choice is the reader's trip: `Your field` to
 * home, held to the model as it stands; the gear, the sheet's Minutes
 * radio checked at the launch's minutes; the radio (the plan made at that
 * tap, the radio checked and home's counts under the sheet the new plan's)
 * or `Voice` (the pill the cycle's next); `Done`, the sheet's frames
 * faultless; then `Start` and Today when the model shows an item, else
 * home's done state, which ends the launch. The commands: recitals; a
 * recital then a Minutes trip (`held`); Again; Minutes trips now and after
 * time passes; Voice trips; time; the field and back. A recital where the
 * model offers no Say it first taps Next, or, in the done state, moves the
 * clock to the passage's due and takes a Minutes trip. A heard recital
 * adds its recall to the disk; an unheard one, a refused listen and a
 * refused write add none, and Again rewrites the recall it grades.
 */

import { expect, it } from 'bun:test';
import { MutableRef } from 'effect';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import type { Recall } from '../sayit';
import type { Minutes } from '../session';
import { MINUTES_KEY } from '../session/service';
import { CHOICE_KEY } from '../voice';
import { below, keyOf, pickOf, PREFIX, random } from './garden-model';
import { cardLineModel } from './home-model';
import { END, rootFaults } from './root-rule';
import {
  actionModel,
  grewLine,
  madeModel,
  nextModel,
  shownModel,
  startedModel,
  tendedModel,
} from './run-model';
import {
  countsModel,
  DAY,
  dueModel,
  HOUR,
  isEvening,
  localDay,
  MINUTE,
  morningOf,
  planModel,
  type ModelItem,
} from './session-model';
import {
  choicesOf,
  deviceOf,
  faultsOf,
  launch,
  type Device,
  type Faults,
  type Hearing,
  type Launch,
} from './session-rig';
import { closeSettings, modalOf, openSettings, tapInSheet, watchSheet } from './settings-rig';
import { hostZone, offsetIn, restore, travel, ZONES } from './zone';

const PIECE = {
  reference: passage.reference,
  words: sourceWords(passage.text).length,
  group: passage.reference,
};
const WORDS = PIECE.words;
const MINUTES: readonly [Minutes, ...Minutes[]] = [2, 5, 10, 20];
const OTHERS: readonly [string, ...string[]] = ['Psalm 23:1', 'Jeremiah 41:1', 'John 3:16 '];
const BASE = Date.UTC(2026, 10, 2);

/** The walk under way's coverage. */
const walk = { coverage: new Map<string, number>() };

const cover = (name: string) => walk.coverage.set(name, (walk.coverage.get(name) ?? 0) + 1);

/** The instant the wall clock of `zone` reads `hours` (from midnight, ms) on the local date `date` (a UTC midnight). */
const wallIn = (zone: string, date: number, ms: number) => {
  const wall = date + ms;
  const guess = wall - offsetIn(zone, wall) * MINUTE;
  return wall - offsetIn(zone, guess) * MINUTE;
};

const recallOf = (
  reference: string,
  startedAt: number,
  offset: number | undefined,
  grade: 1 | 2 | 3 | 4,
): Recall => {
  const recall: Recall = {
    reference,
    startedAt,
    grade,
    suggested: grade === 4 ? 3 : grade,
    words: WORDS,
    missed: 0,
    peeked: 0,
    extra: 0,
  };
  if (offset === undefined) return recall;
  return { ...recall, offset };
};

/** The recalls the disk holds, by reference. */
const plantsOn = (device: Device) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of device.disk) {
    if (!key.startsWith(PREFIX)) continue;
    const recall = JSON.parse(value) as Recall;
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  }
  return plants;
};

/** The model of one device: the stored minutes, the launch's choice, its plan (none until made, and none unread), the item the run holds (`src/test/run-model.ts`), its zone. */
interface Model {
  stored: string | undefined;
  minutes: Minutes;
  plan: readonly ModelItem[] | null;
  hold: ModelItem | null;
  zone: string;
  read: boolean;
}

/** The action Today offers at rest by the run's model: Say it always in an unread launch, which runs no plan; none in the done state. */
const actionWant = (m: Model, device: Device) => {
  if (!m.read) return 'Say it';
  return actionModel({ plan: m.plan, hold: m.hold }, recallsNow(device));
};

const ACTIONS = ['Say it', 'Listening', 'Next'] as const;

interface Run {
  readonly app: Launch;
  readonly device: Device;
  readonly faults: Faults;
  readonly m: Model;
  readonly next: () => number;
  /** The generator of the steps the run adds to reach Say it again (`toSay`), apart from `next`, so the commands drawn stay the same as before the run. */
  readonly aside?: () => number;
  readonly time: { now: number };
  readonly step: string;
}

const planNow = (run: Omit<Run, 'app' | 'step' | 'faults'>) =>
  planModel({
    plants: plantsOn(run.device),
    pieces: [PIECE],
    at: run.time.now,
    offset: offsetIn(run.m.zone, run.time.now),
    minutes: run.m.minutes,
  }).items;

const recallsNow = (device: Device) => {
  const plants = plantsOn(device);
  return (reference: string) => plants.get(reference)?.length ?? 0;
};

/** The lines the screen must show now: the model's counts of the plan, none without one. */
const wantOf = (run: Run) => {
  if (run.m.plan === null) return [];
  return [countsModel(run.m.plan, recallsNow(run.device))];
};

/** The Today card's lines home must show now (`cardLineModel`, the held item counted when the plan holds none open), none without a plan. */
const homeWantOf = (run: Run) => {
  const { m } = run;
  if (m.plan === null) return [];
  const now = recallsNow(run.device);
  return [cardLineModel(m.plan, now, shownModel({ plan: m.plan, hold: m.hold }, now))];
};

/** The end of a run as the model has it: the verses grown by `tendedModel` over the plan's items and the disk's recalls, none while Today is not the end (an unread launch, no plan, an item held or not done, an empty plan). */
const tendedNow = (run: Run) => {
  const { m } = run;
  if (!m.read || m.plan === null) return null;
  return tendedModel({ plan: m.plan, hold: m.hold }, [], [...plantsOn(run.device).values()].flat());
};

/** The floors of an end settled, by how many verses grew: none, one, several. */
const END_FLOORS = ['end:none', 'end:one', 'end:many'] as const;

const SETTINGS = [MINUTES_KEY, CHOICE_KEY];

/** Holds the screen and the disk to the model once the view caught up with the last step, and, after a step that must change nothing (`still`), a moment after it too. At the end of a run Today reads `The field is tended` over no counts line, the line of what grew and each grown verse's name. */
const settle = async (run: Run, still = false) => {
  const { app, device, m, step } = run;
  const action = actionWant(m, device);
  const tended = tendedNow(run);
  const want = {
    headings: [tended === null ? 'Today' : END],
    counts: tended === null ? wantOf(run) : [],
    grew: tended === null ? [] : [grewLine(tended.length)],
    grown: tended === null ? [] : tended.map((each) => `${each.reference}, ${each.stage}`),
    actions: action === null ? [] : [action],
  };
  const shown = () => ({
    headings: app.headings(),
    counts: app.counts(),
    grew: app.grew(),
    grown: app.grown(),
    actions: ACTIONS.filter((name) => app.has(name)),
  });
  await app.until(() => JSON.stringify(shown()) === JSON.stringify(want));
  if (still) await app.until(() => false, 2);
  expect({ step, ...shown() }).toEqual({ step, ...want });
  expect({
    step,
    minutes: device.disk.get(MINUTES_KEY),
    others: device.writes.filter((key) => !SETTINGS.includes(key) && !key.startsWith(PREFIX)),
  }).toEqual({ step, minutes: m.stored, others: [] });
  const line = want.counts[0];
  if (tended !== null) cover(END_FLOORS[Math.min(tended.length, 2)] ?? 'end:many');
  else if (line === undefined) cover('counts:none');
  else cover(`counts:${line.replace(/\d+/g, 'n')}`);
  cover(`action:${action ?? 'none'}`);
};

const fail = (message: string): never => {
  throw new Error(message);
};

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

/** The Minutes radio the open sheet shows checked. */
const sheetChecked = () => choicesOf(modalOf() ?? document.createElement('div')).checked;

/**
 * A trip's way out from Today: `Your field` to home, held to the model as
 * it stands (the one heading, the counts of the plan, `Start` exactly when
 * the run's model shows an item), then the sheet opened under a watch of
 * its frames, its Minutes radio checked at the launch's minutes.
 */
const openTrip = async (run: Run) => {
  const { app, device, m, step } = run;
  await app.tap('Your field');
  const want = {
    headings: ['Your field'],
    counts: homeWantOf(run),
    begin: actionWant(m, device) !== null,
  };
  const shown = () => ({
    headings: app.headings(),
    counts: app.homeCounts(),
    begin: app.has('Start'),
  });
  const same = () => JSON.stringify(shown()) === JSON.stringify(want);
  await app.until(same);
  if (!want.begin) await app.until(() => false, 10);
  if (!same())
    fail(`${step}: home showed ${JSON.stringify(shown())}, expected ${JSON.stringify(want)}`);
  if (!want.begin) {
    expect({ step, root: rootFaults(app.host, 'read') }).toEqual({ step, root: [] });
    cover('field, done');
  }
  const watch = watchSheet();
  try {
    await openSettings(app);
  } catch (error) {
    watch.stop();
    fail(`${step}: ${String(error)}`);
  }
  const minutes = JSON.stringify([`${m.minutes} min`]);
  if (!(await app.until(() => JSON.stringify(sheetChecked()) === minutes))) {
    watch.stop();
    fail(`${step}: the sheet showed ${JSON.stringify(sheetChecked())}, expected ${m.minutes} min`);
  }
  return watch;
};

/**
 * A trip's way back: `Done`, the sheet's frames faultless with its look
 * checked, then `Start` and Today when the run's model shows an item; else
 * home stays with no `Start` and the root's frame rule, and the launch ends
 * there (true).
 */
const closeTrip = async (run: Run, watch: ReturnType<typeof watchSheet>) => {
  const { app, device, m, step } = run;
  const closed = await closeSettings(app, 'Done');
  watch.stop();
  if (!closed) fail(`${step}: the sheet stayed after Done`);
  if (watch.faults.length > 0 || watch.frames.looked === 0)
    fail(
      `${step}: sheet ${watch.faults.join('; ') || 'faultless'}, its look checked on ${watch.frames.looked} frames`,
    );
  if (actionWant(m, device) !== null) {
    await app.tap('Start');
    if (!(await app.until(() => app.headings().includes('Today') && ACTIONS.some(app.has))))
      fail(`${step}: no Today after Start, at ${app.headings().join('|')}`);
    return false;
  }
  await app.until(() => false, 10);
  expect({ step, begin: app.has('Start'), root: rootFaults(app.host, 'read') }).toEqual({
    step,
    begin: false,
    root: [],
  });
  cover('trip ended on home');
  return true;
};

/**
 * A Minutes choice the reader's way (R2): from Today, `Your field`, the
 * gear, the radio `<n> min` (its write refused one time in five), the plan
 * made at that tap with the held item let go, the radio checked and home's
 * counts line under the sheet the new plan's, `Done`, then `Start` and
 * Today, or home's done state, which ends the launch (true). An unread
 * launch offers no choices.
 */
const minutesTrip = async (run: Run, n: Minutes) => {
  const { app, faults, m, step } = run;
  if (!m.read) {
    noChoices(run, 'minutes:none-unread');
    return false;
  }
  const refused = run.next() < 0.2;
  if (refused) faults.refuse.add(MINUTES_KEY);
  else faults.refuse.delete(MINUTES_KEY);
  const before = homeWantOf(run);
  const watch = await openTrip(run);
  if (!(await tapInSheet(`${n} min`))) {
    watch.stop();
    fail(`${step}: no ${n} min in the sheet`);
  }
  m.minutes = n;
  if (!refused) m.stored = String(n);
  if (m.plan !== null) {
    const made = madeModel({ plan: m.plan, hold: m.hold }, planNow(run), false);
    m.plan = made.plan;
    m.hold = made.hold;
  }
  const want = JSON.stringify(homeWantOf(run));
  const radio = JSON.stringify([`${n} min`]);
  if (
    !(await app.until(
      () => JSON.stringify(sheetChecked()) === radio && JSON.stringify(app.homeCounts()) === want,
    ))
  ) {
    watch.stop();
    fail(
      `${step}: ${n} min not checked with the plan's counts, home showed ${JSON.stringify(app.homeCounts())} under ${JSON.stringify(sheetChecked())}, expected ${want}`,
    );
  }
  if (refused) cover('minutes tap refused');
  else cover('minutes tap');
  if (JSON.stringify(before) !== want) cover('tap changed the line');
  const ended = await closeTrip(run, watch);
  cover('settings:minutes');
  return ended;
};

/** How a recital goes: heard, heard with words missed, unheard, refused at its listen, or heard and its write refused. */
const HOWS = ['heard', 'heard', 'missed', 'unheard', 'refused', 'unwritten'] as const;
type How = (typeof HOWS)[number];

/** How the recognizer hears a recital of `how`: unheard is dropped by the recognizer, missed leaves two words unsaid. */
const hearingOf = (how: How): Hearing => {
  if (how === 'refused') return { kind: 'refused' };
  if (how === 'unheard') return { kind: 'dropped' };
  if (how === 'missed') return { kind: 'heard', skip: [1, 4] };
  return { kind: 'heard', skip: [] };
};

/**
 * Where the run's model offers no Say it: `Next` when the shown item is
 * done (the hold let go), and in the done state the time moved to the
 * passage's due and a Minutes trip, which makes the plan again. Answers
 * `say` when Say it is offered after, `none` when not, and `ended` when
 * the trip ended the launch on home.
 */
const toSay = async (run: Run) => {
  const { app, device, m } = run;
  if (actionWant(m, device) === 'Next') {
    await app.tap('Next');
    m.hold = nextModel({ plan: m.plan, hold: m.hold }).hold;
    cover('next');
  }
  if (actionWant(m, device) === null) {
    await settle(run);
    const side = { ...run, next: run.aside ?? run.next };
    await untilDue(side);
    const ended = await minutesTrip(side, pickOf(side.next, MINUTES));
    cover('done state: a new plan');
    if (ended) return 'ended';
  }
  await settle(run);
  if (actionWant(m, device) === 'Say it') return 'say';
  return 'none';
};

/** A recital a second on, held open and then finished; its recall is on the disk exactly when it was heard and written. A press holds the item shown; the action after is the run's model's. Answers `said` after a recital, `none` when no Say it was offered, and `ended` when the way to Say it ended the launch on home. */
const sayCommand = async (run: Run, how: How) => {
  const { app, device, faults, m, time } = run;
  const ready = await toSay(run);
  if (ready === 'ended') return ready;
  if (ready === 'none') {
    cover('say:nothing to tend');
    return ready;
  }
  time.now += 1000;
  const key = keyOf({ reference: passage.reference, startedAt: time.now });
  if (how === 'unwritten') faults.refuse.add(key);
  MutableRef.set(app.hearing, hearingOf(how));
  await app.tap('Say it');
  m.hold = startedModel({ plan: m.plan, hold: m.hold }, recallsNow(device)).hold;
  if (how === 'refused') {
    await app.until(() => false, 3);
  } else {
    expect(await app.until(() => app.has('Listening'))).toBe(true);
    await app.tap('Listening');
  }
  const written = how === 'heard' || how === 'missed';
  await app.until(() => device.disk.has(key) === written);
  const then = actionWant(m, device);
  expect({
    step: `${run.step} ${how}`,
    then,
    shown: await app.until(() => app.has(then ?? '')),
  }).toEqual({
    step: `${run.step} ${how}`,
    then,
    shown: true,
  });
  expect({ step: `${run.step} ${how}`, written: device.disk.has(key) }).toEqual({
    step: `${run.step} ${how}`,
    written,
  });
  MutableRef.set(app.hearing, hearingOf('heard'));
  cover(`say:${how}${run.m.read ? '' : ':unread'}`);
  return 'said';
};

/** Again on the recital shown, when its grades show: the recall is rewritten and the counts stay. */
const againCommand = async (run: Run) => {
  if (!run.app.has('Again')) return;
  await run.app.tap('Again');
  cover('again');
};

/** The field and back to Today by `Start`, offered only in a read garden, while Today shows an action; in the done state (bare, or the end of a run) home shows the plan's counts line and no `Start` and keeps the root's frame rule (`rootFaults`), and the launch ends there (true). */
const fieldCommand = async (run: Run) => {
  if (!run.m.read) return false;
  const acted = run.app.has('Say it') || run.app.has('Next');
  const counts = homeWantOf(run);
  await run.app.tap('Your field');
  expect(
    await run.app.until(
      () => run.app.headings().includes('Your field') && run.app.homeCounts().length > 0,
    ),
  ).toBe(true);
  if (!acted) {
    expect({
      step: run.step,
      counts: run.app.homeCounts(),
      begin: run.app.has('Start'),
      root: rootFaults(run.app.host, 'read'),
    }).toEqual({ step: run.step, counts, begin: false, root: [] });
    cover('field, done');
    return true;
  }
  await run.app.tap('Start');
  expect(await run.app.until(() => run.app.headings().includes('Today'))).toBe(true);
  cover('field and back');
  return false;
};

/** The voice's cycle Off, Her, Him, by the words its pill shows: the next after `shown`, none for a value off the cycle. */
const CYCLE = ['Voice:Off', 'Voice:Her', 'Voice:Him'] as const;
const cycledFrom = (shown: string | undefined) => {
  const at = CYCLE.findIndex((each) => each === shown);
  if (at < 0) return 'a voice on the cycle';
  return CYCLE[(at + 1) % CYCLE.length];
};

/**
 * A Voice choice the reader's way (R5): its write refused one time in
 * five, then from Today `Your field`, the gear, `Voice`, the sheet's pill
 * showing the cycle's next after its value at the open, `Done`, then
 * `Start` and Today, or home's done state, which ends the launch (true).
 * The plan stays. An unread launch offers no choices.
 */
const voiceTrip = async (run: Run) => {
  const { app, faults, m, step } = run;
  if (!m.read) {
    noChoices(run, 'voice:none-unread');
    return false;
  }
  if (run.next() < 0.2) faults.refuse.add(CHOICE_KEY);
  const watch = await openTrip(run);
  const voices = () => choicesOf(modalOf() ?? document.createElement('div')).voices;
  const want = JSON.stringify([cycledFrom(voices()[0])]);
  if (!(await tapInSheet('Voice'))) {
    watch.stop();
    fail(`${step}: no Voice in the sheet`);
  }
  if (!(await app.until(() => JSON.stringify(voices()) === want))) {
    watch.stop();
    fail(`${step}: Voice: the sheet showed ${JSON.stringify(voices())}, expected ${want}`);
  }
  cover('voice tap');
  const ended = await closeTrip(run, watch);
  cover('settings:voice');
  return ended;
};

/** The passage's one recall, when it is a single evening planting by its own offset: the morning it waits for. */
const morningFor = (device: Device) => {
  const recalls = plantsOn(device).get(passage.reference) ?? [];
  const first = recalls[0];
  if (recalls.length !== 1 || first === undefined || !isEvening(first)) return null;
  return morningOf(first);
};

/** The next 04:00 on the wall clock of `zone` after `at`. */
const nextRollover = (zone: string, at: number) => {
  const day = localDay(at, offsetIn(zone, at));
  return wallIn(zone, (day + 1) * DAY, 4 * HOUR);
};

/** The instants time may move to from `at`: minutes and hours on, the morning of an evening planting and the next 04:00 (each ±1 ms), the passage's due (±1 ms), days, a month or a year on, or set back two hours. */
const laterOf = (run: Omit<Run, 'app' | 'step' | 'faults'>, wide: boolean) => {
  const at = run.time.now;
  const out: [string, number][] = [
    ['minutes', at + 7 * MINUTE],
    ['hours', at + 5 * HOUR],
  ];
  const morning = morningFor(run.device);
  if (morning !== null && morning > at) {
    const d = pickOf(run.next, [-1, 0, 1]);
    if (run.next() < 0.6) return { name: 'morning', to: morning + d };
    out.push([`morning ${d}`, morning + d]);
  }
  const rollover = nextRollover(run.m.zone, at);
  for (const d of [-1, 0]) out.push([`rollover ${d}`, rollover + d]);
  const recalls = plantsOn(run.device).get(passage.reference);
  if (recalls !== undefined) {
    const due = dueModel(recalls);
    if (due > at) for (const d of [-1, 0, 1]) out.push([`due ${d}`, due + d]);
  }
  if (wide) out.push(['days', at + 3 * DAY], ['month', at + 31 * DAY], ['back', at - 2 * HOUR]);
  if (wide && run.next() < 0.2) out.push(['year', at + 380 * DAY]);
  const [name, to] = pickOf(run.next, out as [[string, number], ...[string, number][]]);
  return { name: name.replace(/ -?\d+$/, ''), to };
};

/** Time passing on the clock, which never makes the plan again. */
const waitCommand = async (run: Run) => {
  const later = laterOf(run, false);
  run.time.now = later.to;
  cover(`wait:${later.name}`);
};

/** Time passing to the passage's due (or a minute or a week past it), so a Minutes tap after it finds the plan changed; else as `waitCommand`. */
const untilDue = async (run: Run) => {
  const recalls = plantsOn(run.device).get(passage.reference);
  const due = recalls === undefined ? 0 : dueModel(recalls);
  if (due <= run.time.now) return waitCommand(run);
  run.time.now = due + pickOf(run.next, [0, MINUTE, 7 * DAY]);
  cover('wait:to due');
};

const COMMANDS = [
  'say',
  'say',
  'held',
  'again',
  'minutes',
  'later minutes',
  'voice',
  'wait',
  'field',
] as const;

/** The commands after which the plan must stay as it was: S11's time, Voice, grade and field. */
const STILL = new Set<(typeof COMMANDS)[number]>(['again', 'voice', 'wait', 'field']);

/** One generated command, then the screen and the disk held to the model; true when it ended the launch on home. */
const command = async (run: Run, c: number) => {
  const step = `${run.step} command ${c}`;
  const at = { ...run, step };
  const kind = pickOf(run.next, COMMANDS);
  let ended = false;
  if (kind === 'say') ended = (await sayCommand(at, pickOf(run.next, HOWS))) === 'ended';
  if (kind === 'held') {
    const how = pickOf(run.next, ['heard', 'heard', 'unheard'] as const);
    const n = pickOf(run.next, MINUTES);
    const said = await sayCommand(at, how);
    ended = said === 'ended' || (await minutesTrip(at, n));
    if (said === 'said' && run.m.read) cover('say:then-minutes');
  }
  if (kind === 'again') await againCommand(at);
  if (kind === 'minutes') ended = await minutesTrip(at, pickOf(run.next, MINUTES));
  if (kind === 'later minutes') {
    if (run.m.read) await untilDue(at);
    ended = await minutesTrip(at, pickOf(run.next, MINUTES));
  }
  if (kind === 'voice') ended = await voiceTrip(at);
  if (kind === 'wait') await waitCommand(at);
  if (kind === 'field') ended = await fieldCommand(at);
  if (ended) {
    run.faults.refuse.clear();
    return true;
  }
  await settle(at, STILL.has(kind));
  run.faults.refuse.clear();
  return false;
};

/** The first minute through to home: Next, Say it with help, Say it alone, then Continue, a second between each recital. */
const firstMinute = async (run: Run) => {
  const { app, time } = run;
  expect(await app.until(() => app.headings().includes('Heartseed'))).toBe(true);
  await app.tap('Skip');
  expect(await app.until(() => app.headings().includes('Hear it'))).toBe(true);
  await app.tap('Next');
  for (const heading of ['Say it with help', 'Say it alone']) {
    expect(await app.until(() => app.headings().includes(heading))).toBe(true);
    time.now += 1000;
    await app.tap('Say it');
    expect(await app.until(() => app.has('Listening'))).toBe(true);
    await app.tap('Listening');
  }
  expect(await app.until(() => app.headings().includes('Planted'))).toBe(true);
  if (run.next() < 0.5) time.now += 20 * MINUTE;
  await app.tap('Continue');
  cover('first minute');
};

/**
 * Home's first show in a read garden (R2), which makes the plan: the
 * heading `Your field` alone, the model's counts of it, `Start` exactly
 * when the run's model shows an item, and no fault. Then `Start` and
 * Today's first show, held to the model; or, in the done state, no Today
 * frame follows and the launch ends on home (true).
 */
const fromHome = async (run: Run) => {
  const { app, device, m, step } = run;
  expect(
    await app.until(() => app.headings().includes('Your field') && app.homeCounts().length > 0),
  ).toBe(true);
  m.plan = planNow(run);
  m.hold = null;
  const begin = shownModel({ plan: m.plan, hold: m.hold }, recallsNow(device)) !== null;
  await app.until(() => app.has('Start') === begin);
  if (!begin) await app.until(() => false, 10);
  expect({
    step,
    headings: app.headings(),
    counts: app.homeCounts(),
    begin: app.has('Start'),
    faults: app.faults,
  }).toEqual({
    step,
    headings: ['Your field'],
    counts: homeWantOf(run),
    begin,
    faults: [],
  });
  if (!begin) {
    expect({ step, today: app.frames.today, end: app.frames.end }).toEqual({
      step,
      today: 0,
      end: 0,
    });
    cover('home:done');
    return true;
  }
  await app.tap('Start');
  cover('home:begin');
  expect(await app.until(() => app.headings().includes('Today') && ACTIONS.some(app.has))).toBe(
    true,
  );
  await settle(run);
  return false;
};

/** A launch's faults, generated: its listing (unread only over a disk with a recall), and a failed minutes read. */
const faultsFor = (next: () => number, recalled: boolean) => {
  const roll = next();
  let listing: Faults['listing'] = 'ok';
  if (roll < 0.18 && recalled) listing = 'unread';
  else if (roll < 0.3) listing = 'held';
  const failGet = new Set<string>();
  if (next() < 0.15) failGet.add(MINUTES_KEY);
  return faultsOf({ listing, failGet });
};

const minutesRule = (text: string | undefined, failed: boolean): Minutes => {
  if (failed) return 5;
  return MINUTES.find((each) => String(each) === text) ?? 5;
};

/** One launch: held and pending, then the first minute or home, or Today in an unread garden; the plan at home's first show in a read garden, `Start` or the launch's end there; 2-4 commands on Today; no frame fault; no line in any frame of an unread launch. */
const launchOnce = async (base: Omit<Run, 'app' | 'faults' | 'step'>, label: string) => {
  const { device, m, next, time } = base;
  const recalled = [...device.disk.keys()].some((key) => key.startsWith(PREFIX));
  const faults = faultsFor(next, recalled);
  const step = `${label} (${m.zone}, ${faults.listing}${faults.failGet.size > 0 ? ', minutes unread' : ''})`;
  travel(m.zone);
  const app = await launch(device, faults, time);
  const run: Run = { ...base, app, faults, step };
  if (faults.listing === 'held') {
    await app.until(() => false, 10);
    expect({
      step,
      today: app.frames.today,
      end: app.frames.end,
      shown: app.frames.shown,
      counts: app.frames.counts,
    }).toEqual({
      step,
      today: 0,
      end: 0,
      shown: 0,
      counts: 0,
    });
    cover('held');
    app.release();
  }
  m.minutes = minutesRule(m.stored, faults.failGet.has(MINUTES_KEY));
  m.read = faults.listing !== 'unread';
  m.plan = null;
  m.hold = null;
  if (!recalled) await firstMinute(run);
  const ended = m.read && (await fromHome(run));
  if (!m.read) {
    expect(await app.until(() => app.headings().includes('Today') && ACTIONS.some(app.has))).toBe(
      true,
    );
    cover('unread');
    await settle(run);
  }
  const commands = ended ? 0 : 2 + below(next, 3);
  for (let c = 0; c < commands; c += 1) if (await command(run, c)) break;
  expect({ step, faults: app.faults }).toEqual({ step, faults: [] });
  if (!m.read) expect({ step, counts: app.frames.counts }).toEqual({ step, counts: 0 });
  await app.leave();
};

/** A disk of the passage's history (none, a day or an evening planting, an old record, many recalls) and of verses no piece names, some recalled today, and the first launch's instant: after the planting, and before an evening planting's morning. */
const diskFor = (next: () => number, zone: string, start: number) => {
  let launchAt = start;
  const at = start;
  const entries: (readonly [string, string])[] = [];
  const put = (recall: Recall) => entries.push([keyOf(recall), JSON.stringify(recall)]);
  const grade = () => pickOf(next, [1, 2, 3, 3, 4] as const);
  const date = (localDay(at, offsetIn(zone, at)) - below(next, 3)) * DAY;
  const history = pickOf(next, ['none', 'day', 'evening', 'evening', 'old', 'many'] as const);
  const elsewhere = pickOf(next, [zone, ...ZONES]);
  if (history === 'day' || history === 'evening') {
    const ms = pickOf(
      next,
      history === 'day'
        ? [4 * HOUR, 11 * HOUR, 18 * HOUR - 1]
        : [18 * HOUR, 22 * HOUR, DAY + 30 * MINUTE, DAY + 4 * HOUR - 1],
    );
    const startedAt = wallIn(elsewhere, date, ms);
    const recall = recallOf(passage.reference, startedAt, offsetIn(elsewhere, startedAt), grade());
    put(recall);
    if (history === 'evening' && isEvening(recall)) {
      const edge = pickOf(next, [-HOUR, -1, 0, 1]);
      launchAt = morningOf(recall) + edge;
      cover(`launch at morning ${edge}`);
    } else if (startedAt > at) launchAt = startedAt + MINUTE;
  }
  if (history === 'old') put(recallOf(passage.reference, date + 20 * HOUR, undefined, grade()));
  if (history === 'many') {
    let startedAt = at - pickOf(next, [40, 200, 900]) * DAY;
    for (let r = 0; r < 2 + below(next, 5); r += 1) {
      startedAt = Math.min(
        startedAt + pickOf(next, [5 * MINUTE, 3 * HOUR, 2 * DAY, 30 * DAY]),
        at - r * MINUTE - MINUTE,
      );
      put(recallOf(passage.reference, startedAt, offsetIn(zone, startedAt), grade()));
    }
  }
  for (let o = below(next, 3); o > 0; o -= 1) {
    const today = next() < 0.4;
    const startedAt = today
      ? launchAt - (1 + below(next, 30)) * MINUTE
      : launchAt - (1 + below(next, 60)) * DAY;
    if (today) cover('other planted today');
    put(recallOf(pickOf(next, OTHERS), startedAt, offsetIn(zone, startedAt), grade()));
  }
  cover(`history:${history}`);
  return { entries, at: launchAt };
};

const STORED: readonly [string | undefined, ...(string | undefined)[]] = [
  undefined,
  '2',
  '10',
  '20',
  '7',
  '05',
];

/** A device: fresh for indices 0 and 1 (one planted in the evening, one in the day), else a generated disk; three launches, the zone moving one time in three. */
const deviceRun = async (next: () => number, d: number) => {
  let zone = pickOf(next, ZONES);
  let at = BASE + below(next, 40) * HOUR + below(next, 60) * MINUTE;
  if (d < 2) {
    const date = localDay(at, offsetIn(zone, at)) * DAY;
    at = wallIn(
      zone,
      date,
      pickOf(
        next,
        d === 0 ? [18 * HOUR, 21 * HOUR, DAY + 4 * HOUR - 60_000] : [9 * HOUR, 14 * HOUR],
      ),
    );
    cover(d === 0 ? 'fresh:evening' : 'fresh:day');
  }
  const disk = d < 2 ? { entries: [], at } : diskFor(next, zone, at);
  const entries = disk.entries;
  at = disk.at;
  const stored = pickOf(next, STORED);
  const device = deviceOf(stored === undefined ? entries : [...entries, [MINUTES_KEY, stored]]);
  const m: Model = { stored, minutes: 5, plan: null, hold: null, zone, read: true };
  const time = { now: at };
  const aside = random(0x5a1d + d);
  for (let l = 0; l < 3; l += 1) {
    if (l > 0) {
      const later = laterOf({ device, m, next, time }, true);
      time.now = later.to;
      cover(`later:${later.name}`);
      if (next() < 0.35) {
        zone = pickOf(next, ZONES);
        m.zone = zone;
        cover('zone changed');
      }
    }
    await launchOnce({ device, m, next, aside, time }, `device ${d} launch ${l}`);
  }
};

/** The counts walk over `devices` (indices 0 and 1 fresh installs, the rest generated disks), drawn from `seed`, in the host's zone put back after: the coverage it met. */
export const countsRun = async (seed: number, devices: readonly number[]) => {
  walk.coverage = new Map();
  const zone = hostZone();
  try {
    const next = random(seed);
    for (const d of devices) await deviceRun(next, d);
  } finally {
    restore(zone);
  }
  return walk.coverage;
};

/** One part's case of the counts walk: `devices` from `seed`, each of `floors` met at least its number of times. */
export const countsCase = (
  seed: number,
  devices: readonly number[],
  floors: Readonly<Record<string, number>>,
) =>
  it(`over generated devices ${devices.join(',')}, launches, recitals, taps and time, reads the model’s counts of the plan made at home’s first show and at each Minutes tap`, async () => {
    const coverage = await countsRun(seed, devices);
    console.log(`coverage ${JSON.stringify(Object.fromEntries(coverage))}`);
    expect(
      Object.entries(floors).filter(([name, floor]) => (coverage.get(name) ?? 0) < floor),
    ).toEqual([]);
  });
