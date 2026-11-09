/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop -- a React screen test: it drives launches of the root in happy-dom through React's promise-based `act`, one step after another, over a disk and faults kept in plain maps and sets the steps change. */

/**
 * Today's header as a reader meets it: generated devices, each launched
 * three times over the disk the last launch left, through the session rig
 * (`src/test/session-rig.tsx`), which holds every frame to the screen's
 * rules (the choices only under Today's heading, never in a pending or a
 * first-minute frame, outside the scroll view, the four radios in order,
 * one checked, one Voice button valued Off, Her or Him).
 *
 * The oracle is the rules written plainly here: the minutes read as the
 * stored text when it is one of `2` `5` `10` `20`, else 5, and 5 when the
 * read fails (S8); the voice's choice the choice key's text when it reads
 * as `off`, `her` or `him`, else Off only for the old switch's text `false`
 * and Her otherwise, a failed read of either key read as missing (hsspeaker
 * D2), the button valued by the choice, and each tap the next choice of the
 * cycle Off, Her, Him; every tap shows at once, and its write lands
 * unless the store refuses it, in which case the choice holds for the
 * launch and the next launch reads the disk; nothing else writes either
 * key, and a launch writes nothing (S15). The first frame that shows the
 * choices shows the values read, and each later change is a tap's. The
 * choices show and work in an unread garden and while Say it listens, and
 * the field and back keeps them (S10). A recital where Today offers no Say
 * it (its item done, or the done state) first makes a new plan at the
 * passage's due: Next, the clock set to the due, and a tap on the Minutes
 * radio checked, shown and stored as any tap.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import passage from 'virtual:heartseed-passage';

import { sessionView, voiceView } from '../app';
import type { Recall } from '../sayit';
import type { Minutes } from '../session';
import { toDue } from '../test/clock';
import { below, keyOf, pickOf, random } from '../test/garden-model';
import {
  deviceOf,
  faultsOf,
  launch,
  type Device,
  type Faults,
  type Launch,
} from '../test/session-rig';
import { CHOICE_KEY, ENABLED_KEY, nextChoice, type Choice } from '../voice';
import { initial } from '../voice/reading';
import { MINUTES_KEY } from './service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const AT = Date.UTC(2026, 10, 5, 15);

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

const minutesRule = (text: string | undefined, failed: boolean): Minutes => {
  if (failed) return 5;
  return MINUTES.find((each) => String(each) === text) ?? 5;
};

/** The choice's text when the read succeeded and it is one of the three, else Off only for an old switch read as `false`, else Her. */
const voiceRule = (
  text: string | undefined,
  failed: boolean,
  old: string | undefined,
  oldFailed: boolean,
): Choice => {
  if (!failed && (text === 'off' || text === 'her' || text === 'him')) return text;
  if (!oldFailed && old === 'false') return 'off';
  return 'her';
};

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

const deviceFor = (
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

/** The model of one device: what its disk holds under each key, and what the launch under way shows. */
interface Model {
  disk: { minutes: string | undefined; voice: string | undefined; old: string | undefined };
  minutes: Minutes;
  voice: Choice;
  /** Each value the launch showed, in order. */
  shown: { minutes: string[]; voice: string[] };
  settingsWrites: number;
}

/** A second generator for the old switch's draws, so the commands' generator runs as it did before the old key was drawn. */
const aside = random(0x01d5);

const coverage = new Map<string, number>();
const cover = (name: string) => coverage.set(name, (coverage.get(name) ?? 0) + 1);

/** Holds the screen and the disk to the model once the view caught up with the last step. */
const settle = async (app: Launch, device: Device, m: Model, step: string) => {
  const want = { checked: [`${m.minutes} min`], voices: [shownOf(m.voice)] };
  await app.until(() => {
    const shown = app.choices();
    return (
      JSON.stringify({ checked: shown.checked, voices: shown.voices }) === JSON.stringify(want)
    );
  });
  const shown = app.choices();
  expect({ step, checked: shown.checked, voices: shown.voices }).toEqual({ step, ...want });
  expect({
    step,
    minutes: device.disk.get(MINUTES_KEY),
    voice: device.disk.get(CHOICE_KEY),
    old: device.disk.get(ENABLED_KEY),
    writes: device.writes.filter((key) => SETTINGS.includes(key)).length,
    others: device.writes.filter(
      (key) => !SETTINGS.includes(key) && !key.startsWith('heartseed/recall/'),
    ),
  }).toEqual({
    step,
    minutes: m.disk.minutes,
    voice: m.disk.voice,
    old: m.disk.old,
    writes: m.settingsWrites,
    others: [],
  });
};

const tapMinutes = async (app: Launch, faults: Faults, m: Model, n: Minutes, refused: boolean) => {
  if (refused) faults.refuse.add(MINUTES_KEY);
  await app.tap(`${n} min`);
  m.minutes = n;
  m.shown.minutes.push(`${n} min`);
  if (!refused) {
    m.disk.minutes = String(n);
    m.settingsWrites += 1;
  }
};

const tapVoice = async (app: Launch, faults: Faults, m: Model, refused: boolean) => {
  if (refused) faults.refuse.add(CHOICE_KEY);
  await app.tap('Voice');
  m.voice = nextChoice(m.voice);
  m.shown.voice.push(shownOf(m.voice));
  cover(`voice tap to ${m.voice}`);
  if (!refused) {
    m.disk.voice = m.voice;
    m.settingsWrites += 1;
  }
};

/** Collapses runs of one value, as the rig notes each change. */
const changes = (values: readonly string[]) =>
  values.filter((value, at) => at === 0 || values[at - 1] !== value);

const DEVICES = 8;

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

/** A tap on a Minutes radio or the Voice button, refused by the store one time in five. */
const tapCommand = async (run: Run, kind: 'minutes' | 'voice') => {
  const refused = run.next() < 0.2;
  if (kind === 'minutes')
    await tapMinutes(run.app, run.faults, run.m, pickOf(run.next, MINUTES), refused);
  else await tapVoice(run.app, run.faults, run.m, refused);
  if (refused) cover(`refused ${kind} tap`);
  else cover(`${kind} tap`);
};

/** The passage's recalls on the disk. */
const passageRecalls = (device: Device) =>
  [...device.disk]
    .filter(([key]) => key.startsWith(`heartseed/recall/${passage.reference}/`))
    .map(([, value]): Recall => JSON.parse(value));

/**
 * Where Today offers no Say it (its item done, or the done state): `Next`
 * when it shows, the clock set to the passage's due, and a tap on the
 * Minutes radio checked, which makes a new plan that offers it, shown and
 * stored as any tap.
 */
const renewCommand = async (run: Run, at: string) => {
  const { app, device, faults, m } = run;
  if (app.has('Say it')) return;
  if (app.has('Next')) await app.tap('Next');
  toDue(run.time, passageRecalls(device));
  await tapMinutes(app, faults, m, m.minutes, false);
  expect({ at, offered: await app.until(() => app.has('Say it')) }).toEqual({ at, offered: true });
  cover('new plan at the due');
};

/** A recital held open while the reader taps the choices 0-2 times, each tap shown and stored at once, then finished: its recall kept, the action reads `Next` (`Say it` in an unread garden, which runs no plan). */
const sayCommand = async (run: Run, at: string) => {
  const { app, device, faults, m, next } = run;
  await renewCommand(run, at);
  await settle(app, device, m, `${at} renewed`);
  await app.tap('Say it');
  expect(await app.until(() => app.has('Listening'))).toBe(true);
  const taps = below(next, 3);
  for (let t = 0; t < taps; t += 1) {
    if (next() < 0.6) await tapMinutes(app, faults, m, pickOf(next, MINUTES), false);
    else await tapVoice(app, faults, m, false);
    await settle(app, device, m, `${at} listening tap ${t}`);
    cover('tap while listening');
  }
  await app.tap('Listening');
  const then = ({ unread: 'Say it', held: 'Next', ok: 'Next' } as const)[run.faults.listing];
  expect({ at, then, shown: await app.until(() => app.has(then)) }).toEqual({
    at,
    then,
    shown: true,
  });
  cover('recital');
};

/** The field and back to Today by `Begin`, offered only in a read garden, while Today shows an action; in the done state home shows no `Begin`, and the launch ends there (true). */
const fieldCommand = async (run: Run) => {
  if (run.faults.listing === 'unread') return false;
  const acted = run.app.has('Say it') || run.app.has('Next');
  await run.app.tap('Your field');
  expect(
    await run.app.until(
      () =>
        run.app.headings().includes('Your field') &&
        run.app.host.querySelector('[data-testid="counts"]') !== null,
    ),
  ).toBe(true);
  if (!acted) {
    expect({ step: run.step, begin: run.app.has('Begin') }).toEqual({
      step: run.step,
      begin: false,
    });
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

/** One generated command, then the screen and the disk held to the model; true when it ended the launch on home. */
const command = async (run: Run, c: number) => {
  const at = `${run.step} command ${c}`;
  const kind = pickOf(run.next, COMMANDS);
  if (kind === 'minutes' || kind === 'voice') await tapCommand(run, kind);
  if (kind === 'say') await sayCommand(run, at);
  if (kind === 'field' && (await fieldCommand(run))) {
    run.faults.refuse.clear();
    return true;
  }
  if (kind === 'wait') await waitCommand(run);
  await settle(run.app, run.device, run.m, at);
  run.faults.refuse.clear();
  return false;
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

/** A first-minute launch: no frame up to the hear phase shows a choice. */
const firstMinute = async (app: Launch, step: string) => {
  app.release();
  expect(await app.until(() => app.headings().includes('Hear it'))).toBe(true);
  expect({ step, faults: app.faults, shown: app.frames.shown }).toEqual({
    step,
    faults: [],
    shown: 0,
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
  if (aside() < 0.12) failGet.add(ENABLED_KEY);
  if (listing === 'unread') cover('unread');
  if (failGet.has(MINUTES_KEY)) cover('failed minutes read');
  if (failGet.has(CHOICE_KEY) || failGet.has(ENABLED_KEY)) cover('failed voice read');
  return faultsOf({ listing, failGet });
};

/** One launch of a device with a recall: the values read shown first, then 2-4 commands, every frame held to the rig's rules. */
const launchOnce = async (run: Omit<Run, 'app'>, l: number) => {
  const { device, faults, m } = run;
  const app = await launch(device, faults, run.time);
  if (faults.listing === 'held') await holdThenRelease(app, run.step);
  if (l > 0 && m.settingsWrites > 0) cover('relaunch after a landed tap');
  m.minutes = minutesRule(m.disk.minutes, faults.failGet.has(MINUTES_KEY));
  m.voice = voiceRule(
    m.disk.voice,
    faults.failGet.has(CHOICE_KEY),
    m.disk.old,
    faults.failGet.has(ENABLED_KEY),
  );
  m.shown = { minutes: [`${m.minutes} min`], voice: [shownOf(m.voice)] };
  expect(await app.until(() => app.headings().includes('Today') && app.has('Voice'))).toBe(true);
  await settle(app, device, m, `${run.step} at launch`);
  const commands = 2 + below(run.next, 3);
  for (let c = 0; c < commands; c += 1) if (await command({ ...run, app }, c)) break;
  expect({ step: run.step, faults: app.faults }).toEqual({ step: run.step, faults: [] });
  expect({ step: run.step, seen: app.seen }).toEqual({
    step: run.step,
    seen: { minutes: changes(m.shown.minutes), voice: changes(m.shown.voice) },
  });
  await app.leave();
};

/** A generated device, launched three times over the disk each launch leaves (once, for the first minute). */
const deviceRun = async (next: () => number, d: number) => {
  const history = historyFor(next, d);
  const stored = storedFor(next, d);
  const voiced = pickOf(next, VOICES);
  const old = pickOf(aside, OLD_VOICES);
  cover(`stored:${storedKind(stored)}`);
  const device = deviceFor(history, stored, voiced, old);
  const m: Model = {
    disk: { minutes: stored, voice: voiced, old },
    minutes: 5,
    voice: 'her',
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

describe('Today’s header holds the minutes and the voice', () => {
  it('shows no choice and no counts in the pending frame, even with the session’s and the voice’s views at hand', async () => {
    const seeded = [
      [
        sessionView,
        AsyncResult.success({ minutes: 10, plan: Option.some({ items: [] }) }),
        { skipInitialRun: true },
      ],
      [voiceView, AsyncResult.success(initial('off').view), { skipInitialRun: true }],
    ] as const;
    const app = await launch(
      deviceFor('passage', '10', 'off', 'false'),
      faultsOf({ listing: 'held' }),
      { now: AT },
      seeded,
    );
    await app.until(() => false, 15);
    expect({
      pending: app.frames.pending > 0,
      today: app.frames.today,
      shown: app.frames.shown,
      counts: app.frames.counts,
      faults: app.faults,
    }).toEqual({ pending: true, today: 0, shown: 0, counts: 0, faults: [] });
    await app.leave();
  });

  it('over generated devices, launches and taps, shows and stores the reader’s choices by the rules', async () => {
    const next = random(0x5e55);
    for (let d = 0; d < DEVICES; d += 1) await deviceRun(next, d);
    const floors = {
      'stored:absent': 1,
      'stored:valid': 4,
      'stored:bad': 3,
      'first minute': 1,
      held: 2,
      unread: 2,
      'failed minutes read': 2,
      'failed voice read': 1,
      'relaunch after a landed tap': 3,
      'minutes tap': 6,
      'refused minutes tap': 1,
      'voice tap': 3,
      'voice tap to off': 1,
      'voice tap to her': 1,
      'voice tap to him': 1,
      'refused voice tap': 1,
      'tap while listening': 2,
      recital: 2,
      'new plan at the due': 2,
      'field and back': 2,
      wait: 2,
    };
    console.log(`coverage ${JSON.stringify(Object.fromEntries(coverage))}`);
    expect(
      Object.entries(floors).filter(([name, floor]) => (coverage.get(name) ?? 0) < floor),
    ).toEqual([]);
  });
});
