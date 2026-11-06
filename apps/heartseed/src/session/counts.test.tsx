/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noTernary, effect/noTryCatch, eslint/no-await-in-loop -- a React screen test: it drives launches of the root in happy-dom through React's promise-based `act`, one step after another, over a disk, faults, a clock and a zone kept in plain values the steps change (the generator's choices as plain branches), the zone in `process.env.TZ`, put back in a `finally` even when a step throws. */

/**
 * Today's counts line as a reader meets it: generated devices (fresh
 * installs planted through the first minute, in the evening or the day,
 * and disks of the passage's history beside verses no piece names), each
 * launched three times over the disk the last launch left, in zones that
 * change, through the session rig (`src/test/session-rig.tsx`), which
 * holds every frame to the screen's rules (the session's nodes only under
 * Today's heading, the counts line in its form at the top of the scroll
 * view).
 *
 * The oracle is `src/test/session-model.ts`: the plan is the model's over
 * the disk's recalls at the instant Today first shows with the garden read
 * (after Continue in the first minute) and again at each Minutes tap, and
 * at no other step (S11); after every step the line is the model's counts
 * of that plan over the disk's recalls now (S12, S13), and an unread launch
 * shows no line in any frame (S14). A heard recital adds its recall to the
 * disk; an unheard one, a refused listen and a refused write add none, and
 * Again rewrites the recall it grades.
 */

import { describe, expect, it } from 'bun:test';
import { MutableRef } from 'effect';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import type { Recall } from '../sayit';
import type { Minutes } from '../session';
import { below, keyOf, pickOf, PREFIX, random } from '../test/garden-model';
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
} from '../test/session-model';
import {
  deviceOf,
  faultsOf,
  launch,
  type Device,
  type Faults,
  type Hearing,
  type Launch,
} from '../test/session-rig';
import { hostZone, offsetIn, restore, travel, ZONES } from '../test/zone';
import { ENABLED_KEY } from '../voice';
import { MINUTES_KEY } from './service';

const PIECE = {
  reference: passage.reference,
  words: sourceWords(passage.text).length,
  group: passage.reference,
};
const WORDS = PIECE.words;
const MINUTES: readonly [Minutes, ...Minutes[]] = [2, 5, 10, 20];
const OTHERS: readonly [string, ...string[]] = ['Psalm 23:1', 'Isaiah 41:1', 'John 3:16 '];
const BASE = Date.UTC(2026, 10, 2);

const coverage = new Map<string, number>();
const cover = (name: string) => coverage.set(name, (coverage.get(name) ?? 0) + 1);

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

/** The model of one device: the stored minutes, the launch's choice, its plan (none until made, and none unread), its zone. */
interface Model {
  stored: string | undefined;
  minutes: Minutes;
  plan: readonly ModelItem[] | null;
  zone: string;
  read: boolean;
}

interface Run {
  readonly app: Launch;
  readonly device: Device;
  readonly faults: Faults;
  readonly m: Model;
  readonly next: () => number;
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

const SETTINGS = [MINUTES_KEY, ENABLED_KEY];

/** Holds the screen and the disk to the model once the view caught up with the last step, and, after a step that must change nothing (`still`), a moment after it too. */
const settle = async (run: Run, still = false) => {
  const { app, device, m, step } = run;
  const want = { counts: wantOf(run), checked: [`${m.minutes} min`] };
  const shown = () => ({ counts: app.counts(), checked: app.choices().checked });
  await app.until(() => JSON.stringify(shown()) === JSON.stringify(want));
  if (still) await app.until(() => false, 2);
  expect({ step, ...shown() }).toEqual({ step, ...want });
  expect({
    step,
    minutes: device.disk.get(MINUTES_KEY),
    others: device.writes.filter((key) => !SETTINGS.includes(key) && !key.startsWith(PREFIX)),
  }).toEqual({ step, minutes: m.stored, others: [] });
  const line = want.counts[0];
  if (line === undefined) cover('counts:none');
  else cover(`counts:${line.replace(/\d+/g, 'n')}`);
};

/** A Minutes tap, refused one time in five: the choice shows, a made plan is made again at the tap's instant, and a landed tap is stored. */
const minutesCommand = async (run: Run, n: Minutes) => {
  const { app, faults, m } = run;
  const refused = run.next() < 0.2;
  if (refused) faults.refuse.add(MINUTES_KEY);
  const before = wantOf(run);
  await app.tap(`${n} min`);
  m.minutes = n;
  if (!refused) m.stored = String(n);
  if (m.plan !== null) m.plan = planNow(run);
  if (refused) cover('minutes tap refused');
  else cover('minutes tap');
  if (JSON.stringify(before) !== JSON.stringify(wantOf(run))) cover('tap changed the line');
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

/** A recital a second on, held open while the reader taps Minutes (`during`), then finished; its recall is on the disk exactly when it was heard and written. */
const sayCommand = async (run: Run, how: How, during: Minutes | null) => {
  const { app, device, faults, time } = run;
  time.now += 1000;
  const key = keyOf({ reference: passage.reference, startedAt: time.now });
  if (how === 'unwritten') faults.refuse.add(key);
  MutableRef.set(app.hearing, hearingOf(how));
  await app.tap('Say it');
  if (how === 'refused') {
    await app.until(() => false, 3);
  } else {
    expect(await app.until(() => app.has('Listening'))).toBe(true);
    if (during !== null) {
      await minutesCommand(run, during);
      cover('minutes tap while listening');
    }
    await app.tap('Listening');
  }
  expect(await app.until(() => app.has('Say it'))).toBe(true);
  const written = how === 'heard' || how === 'missed';
  await app.until(() => device.disk.has(key) === written);
  expect({ step: `${run.step} ${how}`, written: device.disk.has(key) }).toEqual({
    step: `${run.step} ${how}`,
    written,
  });
  MutableRef.set(app.hearing, hearingOf('heard'));
  cover(`say:${how}${run.m.read ? '' : ':unread'}`);
};

/** Again on the recital shown, when its grades show: the recall is rewritten and the counts stay. */
const againCommand = async (run: Run) => {
  if (!run.app.has('Again')) return;
  await run.app.tap('Again');
  cover('again');
};

/** The field and back to Today, offered only in a read garden. */
const fieldCommand = async (run: Run) => {
  if (!run.m.read) return;
  await run.app.tap('Your field');
  expect(await run.app.until(() => run.app.headings().includes('Your field'))).toBe(true);
  await run.app.tap('Today');
  expect(await run.app.until(() => run.app.headings().includes('Today'))).toBe(true);
  cover('field and back');
};

const voiceCommand = async (run: Run) => {
  if (run.next() < 0.2) run.faults.refuse.add(ENABLED_KEY);
  await run.app.tap('Voice');
  cover('voice tap');
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

const command = async (run: Run, c: number) => {
  const step = `${run.step} command ${c}`;
  const at = { ...run, step };
  const kind = pickOf(run.next, COMMANDS);
  if (kind === 'say') await sayCommand(at, pickOf(run.next, HOWS), null);
  if (kind === 'held')
    await sayCommand(
      at,
      pickOf(run.next, ['heard', 'heard', 'unheard']),
      pickOf(run.next, MINUTES),
    );
  if (kind === 'again') await againCommand(at);
  if (kind === 'minutes') await minutesCommand(at, pickOf(run.next, MINUTES));
  if (kind === 'later minutes') {
    await untilDue(at);
    await minutesCommand(at, pickOf(run.next, MINUTES));
  }
  if (kind === 'voice') await voiceCommand(at);
  if (kind === 'wait') await waitCommand(at);
  if (kind === 'field') await fieldCommand(at);
  await settle(at, STILL.has(kind));
  run.faults.refuse.clear();
};

/** The first minute through to Today: Next, Say it with help, Say it alone, then Continue, a second between each recital. */
const firstMinute = async (run: Run) => {
  const { app, time } = run;
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

/** One launch: held and pending, then the first minute or Today; the plan at Today's first show in a read garden; 2-4 commands; no frame fault; no line in any frame of an unread launch. */
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
      shown: app.frames.shown,
      counts: app.frames.counts,
    }).toEqual({
      step,
      today: 0,
      shown: 0,
      counts: 0,
    });
    cover('held');
    app.release();
  }
  m.minutes = minutesRule(m.stored, faults.failGet.has(MINUTES_KEY));
  m.read = faults.listing !== 'unread';
  if (!recalled) await firstMinute(run);
  expect(await app.until(() => app.headings().includes('Today') && app.has('Voice'))).toBe(true);
  m.plan = null;
  if (m.read) m.plan = planNow(run);
  else cover('unread');
  await settle(run);
  const commands = 2 + below(next, 3);
  for (let c = 0; c < commands; c += 1) await command(run, c);
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

const DEVICES = 6;

/** A device: fresh for the first two (one planted in the evening, one in the day), else a generated disk; three launches, the zone moving one time in three. */
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
  const m: Model = { stored, minutes: 5, plan: null, zone, read: true };
  const time = { now: at };
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
    await launchOnce({ device, m, next, time }, `device ${d} launch ${l}`);
  }
};

describe('Today’s counts line', () => {
  it('over generated devices, launches, recitals, taps and time, reads the model’s counts of the plan made at Today’s first show and at each Minutes tap', async () => {
    const zone = hostZone();
    try {
      const next = random(0xc0_ab7);
      for (let d = 0; d < DEVICES; d += 1) await deviceRun(next, d);
    } finally {
      restore(zone);
    }
    const floors = {
      'fresh:evening': 1,
      'fresh:day': 1,
      'first minute': 2,
      held: 1,
      unread: 1,
      'counts:none': 1,
      'counts:Nothing to tend now': 3,
      'counts:n to tend · about n min': 2,
      'counts:n new · about n min': 1,
      'minutes tap': 3,
      'minutes tap refused': 1,
      'tap changed the line': 1,
      'minutes tap while listening': 1,
      'say:heard': 2,
      'say:unheard': 1,
      'say:refused': 1,
      'say:unwritten': 1,
      again: 1,
      'voice tap': 1,
      'field and back': 2,
      'zone changed': 1,
      'say:missed': 1,
      'say:unheard:unread': 1,
      'history:evening': 2,
      'launch at morning -1': 1,
      'launch at morning 0': 1,
      'other planted today': 1,
      'later:morning': 1,
      'later:rollover': 1,
      'later:month': 1,
      'later:back': 1,
      'wait:to due': 1,
    };
    console.log(`coverage ${JSON.stringify(Object.fromEntries(coverage))}`);
    expect(
      Object.entries(floors).filter(([name, floor]) => (coverage.get(name) ?? 0) < floor),
    ).toEqual([]);
  });
});
