/* oxlint-disable effect/noAsyncFunction, effect/noTernary, effect/noGlobals, effect/noNullish, eslint/no-await-in-loop -- a React screen walk: it drives launches of the root in happy-dom through the run rig's promise-based `act`, one generated step after another, and reads the recalls off the rig's disk, a plain map of JSON texts, where an absent reference counts no recall. */

/**
 * Today in dark, and across flips of the system, as a model-based walk
 * through the run rig (`src/test/run-rig.tsx`): over a verse due, home at the
 * launch and its `Start`, then generated
 * sequences of Say it (heard whole, heard with a word missed, unheard, and
 * each with the system flipped while it listens), a peek at a missed word,
 * a grade, Next to the end of the run (`The field is tended`; the one
 * verse is in every plan, so the bare done state never shows and the walks
 * hold that it does not), minutes chosen in home's Settings sheet
 * (`renewBySettings`: `Your field`, the radio, `Done`, then `Start` while
 * the verse shows, else the walk ends on home), the field and back, and a
 * flip of the system between any two steps. A Minutes trip ends on Today
 * when the plan made at its tap offers the verse, by the session's and the
 * run's models over the device's disk, and on home with no `Start`
 * otherwise; the fourth walk opens with an unheard recital and a trip, so
 * a trip whose plan offers the verse is walked. The model is the system's last
 * value; every frame (each DOM mutation batch) and every settled screen
 * holds the frame oracle (`src/test/look.ts`) for it, every settled Today
 * draws its stage line's plant image in it (`src/test/plant-image-rule.ts`),
 * in each scheme across the walks, every frame of the
 * sheet holds the sheet's rule for it, and the run rig's footer rule holds
 * too. It counts words without printing one.
 */

import { describe, expect, it } from 'bun:test';
import { MutableRef } from 'effect';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import { recallOf } from '../test/field-model';
import { record } from '../test/field-rig';
import { below, DAY, pickOf, PREFIX, random } from '../test/garden-model';
import { lookFaults, setSystem, watchLook } from '../test/look';
import { ownsImages, plantFaults, STAGE_IMAGE } from '../test/plant-image-rule';
import { END, endShown, rootFaults } from '../test/root-rule';
import { madeModel, NO_RUN, shownModel } from '../test/run-model';
import { deviceOf, launch, type Device, type Hearing } from '../test/run-rig';
import { planModel } from '../test/session-model';
import { renewBySettings } from '../test/settings-rig';
import { hostOffset } from '../test/zone';
import type { Recall } from '../sayit';
import type { Scheme } from '../theme';

const T0 = Date.UTC(2026, 3, 1, 9);
const WORDS = sourceWords(passage.text).length;

/** A device whose one verse, the passage, is long due. */
const dueDevice = () =>
  deviceOf([record({ ...recallOf(passage.reference, T0 - 30 * DAY, 3, 0), words: WORDS })]);

const STEPS = [
  'heard',
  'missed',
  'unheard',
  'flipListening',
  'peek',
  'grade',
  'next',
  'minutes',
  'field',
  'flip',
] as const;
type Step = (typeof STEPS)[number];

/** What the walks count: each step taken, the bare done state (`Today` with no action), the end of a run (`The field is tended`), the field from either, and each Minutes trip by whether its plan offers the verse. */
type Covered = Step | 'done' | 'end' | 'field, done' | 'minutes:due' | 'minutes:none';

/** The steps each walk opens with, in turn, before the generated steps: a recital and a peek; the fourth walk's unheard recital writes no recall, so its Minutes trip makes a plan that offers the verse. */
const OPENINGS: readonly (readonly Step[])[] = [
  ['missed', 'peek'],
  ['heard', 'peek'],
  ['flipListening', 'peek'],
  ['unheard', 'minutes', 'peek'],
];

/** The app's own piece: the passage, its own group. */
const PIECE = { reference: passage.reference, words: WORDS, group: passage.reference };

/** The recalls `device`'s disk holds, by reference. */
const plantsOn = (device: Device) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of device.disk) {
    if (!key.startsWith(PREFIX)) continue;
    const recall: Recall = JSON.parse(value);
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  }
  return plants;
};

/** Whether the plan a Minutes tap of `minutes` makes at `T0` over `device`'s disk offers the verse, by the session's and the run's models. */
const offerOf = (device: Device, minutes: number) => {
  const plants = plantsOn(device);
  const items = planModel({
    plants,
    pieces: [PIECE],
    at: T0,
    offset: hostOffset(T0),
    minutes,
  }).items;
  const recallsNow = (reference: string) => plants.get(reference)?.length ?? 0;
  return shownModel(madeModel(NO_RUN, items, false), recallsNow) !== null;
};

const other = (scheme: Scheme): Scheme => (scheme === 'light' ? 'dark' : 'light');

/** Each scheme a settled Today drew its stage's plant image in, over the walks. */
const DREW = new Set<Scheme>();

/** What a settled screen draws wrong against the plant it owes in `scheme` (`plantFaults`): Today's stage line's 28 pt image of that scheme, none with no planted stage; home and the end draw their own. */
const drawing = (host: Element, scheme: Scheme) => {
  if (ownsImages(host)) return [];
  const label = host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label') ?? '';
  const name = STAGE_IMAGE.get(label);
  if (name === undefined) return plantFaults(host, null);
  DREW.add(scheme);
  return plantFaults(host, { asset: `assets/home/${name}-${scheme}.png`, size: 28 });
};

/** The model of the system: the appearance it last named. */
interface Model {
  system: Scheme;
}

/** One walk: a launch under `start`, then `steps` steps drawn from `seed`, every frame held to the oracle for the model's system. */
const walk = async (seed: number, start: Scheme, steps: number) => {
  const next = random(seed * 7919 + 17);
  const model: Model = { system: start };
  setSystem(start);
  const device = dueDevice();
  const app = await launch(device, { unread: false, refuse: false }, { now: T0 });
  const look = watchLook(app.host, () => model.system);
  const report: string[] = [];
  /** Whether the field from the end left the walk on home, which ends it. */
  const ended = { home: false };
  const flip = async () => {
    model.system = other(model.system);
    await act(async () => setSystem(model.system));
  };
  const looks = new Map<string, readonly string[]>();
  const settle = async (name: string) => {
    await app.until(() => lookFaults(app.host, model.system, looks).length === 0, 300);
    const faults = [
      ...lookFaults(app.host, model.system, looks),
      ...drawing(app.host, model.system),
    ];
    if (faults.length > 0)
      report.push(`seed ${seed} ${name} [${model.system}]: ${faults.join('; ')}`);
  };
  const say = async (hearing: Hearing, flipping: boolean) => {
    if (!(await app.tap('Say it'))) return false;
    MutableRef.set(app.hearing, hearing);
    if (!(await app.until(() => app.has('Listening')))) return false;
    if (flipping) {
      await flip();
      await settle('listening after a flip');
    }
    await app.tap('Listening');
    return app.until(() => !app.has('Listening'));
  };
  const run: Readonly<Record<Step, () => Promise<boolean>>> = {
    heard: () => say({ kind: 'heard', text: passage.text, skip: [] }, false),
    missed: () => say({ kind: 'heard', text: passage.text, skip: [below(next, WORDS)] }, false),
    unheard: () => say({ kind: 'unheard' }, false),
    flipListening: () =>
      say({ kind: 'heard', text: passage.text, skip: [below(next, WORDS)] }, true),
    peek: async () => {
      const [mark = ''] = [...app.host.querySelectorAll('[role="button"]')]
        .map((node) => node.getAttribute('aria-label') ?? '')
        .filter((label) => /^Missed word \d+$/.test(label));
      return mark !== '' && app.tap(mark);
    },
    grade: () => app.tap(pickOf(next, ['Again', 'Hard', 'Good', 'Easy']), 'radio'),
    next: () => app.tap('Next'),
    minutes: async () => {
      const minutes = pickOf(next, [2, 5, 10, 20]);
      if (!app.has('Your field')) return false;
      const offered = offerOf(device, minutes);
      const ran = await renewBySettings(app, minutes, () => model.system).then(
        (trip) => ({ trip }),
        (error: unknown) => {
          report.push(`seed ${seed} minutes ${minutes}: ${String(error)}`);
          return { failed: true };
        },
      );
      if (!('trip' in ran)) return false;
      const { trip } = ran;
      for (const fault of trip.sheet)
        report.push(`seed ${seed} minutes ${minutes} [${model.system}]: ${fault}`);
      if (trip.looked === 0)
        report.push(`seed ${seed} minutes ${minutes}: the sheet's look never checked`);
      const offer = offered ? 'minutes:due' : 'minutes:none';
      coverage[offer] = (coverage[offer] ?? 0) + 1;
      if (trip.at === 'Today') return true;
      if (offered)
        report.push(
          `seed ${seed} minutes ${minutes}: the trip ended at ${trip.at}, Start ${app.has('Start') ? 'shown' : 'none'}, where the plan offers ${passage.reference}`,
        );
      else if (trip.at !== 'Your field' || app.has('Start'))
        report.push(
          `seed ${seed} minutes ${minutes}: the trip ended at ${trip.at}, Start ${app.has('Start') ? 'shown' : 'none'}`,
        );
      ended.home = true;
      return true;
    },
    field: async () => {
      const acted = app.actions().length > 0;
      if (!(await app.tap('Your field'))) return false;
      await app.until(
        () =>
          app.headings().includes('Your field') &&
          app.host.querySelectorAll('[data-testid="today-card"]').length > 0,
      );
      await settle('the field');
      if (!acted) {
        ended.home = true;
        coverage['field, done'] = (coverage['field, done'] ?? 0) + 1;
        if (app.has('Start')) report.push(`seed ${seed} the field, done: Start shown`);
        for (const fault of rootFaults(app.host, 'read'))
          report.push(`seed ${seed} the field, done: ${fault}`);
        return true;
      }
      await app.tap('Start');
      return app.until(() => app.headings().includes('Today'));
    },
    flip: async () => {
      await flip();
      return true;
    },
  };
  if (!(await app.until(() => app.has('Start')))) report.push(`seed ${seed} launch: no Start`);
  await settle('home');
  await app.tap('Start');
  await app.until(() => app.has('Say it'));
  await settle('launch');
  const first = OPENINGS[seed % OPENINGS.length] ?? [];
  for (let n = 0; n < steps && !ended.home; n++) {
    const step = first[n] ?? pickOf(next, STEPS);
    if (await run[step]()) coverage[step] = (coverage[step] ?? 0) + 1;
    await settle(step);
    if (app.headings().includes(END)) coverage.end = (coverage.end ?? 0) + 1;
    else if (app.headings().includes('Today') && app.actions().length === 0)
      coverage.done = (coverage.done ?? 0) + 1;
  }
  if (next() < 0.5) {
    await flip();
    await settle('a last flip');
  }
  look.stop();
  const footer = await app.leave();
  setSystem('light');
  return { report, frames: look.faults, footer, seen: look.frames.seen };
};

/** How many times each step took effect across the walks, how many settled screens showed the end and the bare done state, and how many walks the field from there ended on home. */
const coverage: Partial<Record<Covered, number>> = {};

describe('Today in dark and across flips of the system', () => {
  it('holds every frame of generated walks (Say it heard, missed or unheard, a peek, a grade, Next to done, Minutes ending where its plan offers, the field and back) to the oracle for the system’s last value', async () => {
    const walks = [];
    for (let n = 0; n < 4; n++) walks.push(await walk(n, n % 2 === 0 ? 'dark' : 'light', 10));
    const all: readonly Covered[] = [...STEPS, 'end', 'field, done', 'minutes:due'];
    const reached = all.filter((step) => (coverage[step] ?? 0) === 0);
    expect({
      reports: walks.flatMap((each) => each.report),
      frames: walks.flatMap((each) => each.frames),
      footers: walks.flatMap((each) => each.footer ?? []),
      seen: walks.every((each) => each.seen > 5),
      unreached: reached,
      bare: coverage.done ?? 0,
      drew: [...DREW].toSorted(),
    }).toEqual({
      reports: [],
      frames: [],
      footers: [],
      seen: true,
      unreached: [],
      bare: 0,
      drew: ['dark', 'light'],
    });
  });

  it('reaches the end of the run in dark, its read exact, a flip there repainting it with no tap', async () => {
    setSystem('dark');
    const app = await launch(dueDevice(), { unread: false, refuse: false }, { now: T0 });
    const model: Model = { system: 'dark' };
    const look = watchLook(app.host, () => model.system);
    expect(await app.until(() => app.has('Start'))).toBe(true);
    await app.tap('Start');
    await app.until(() => app.has('Say it'));
    MutableRef.set(app.hearing, { kind: 'heard', text: passage.text, skip: [] });
    await app.tap('Say it');
    await app.until(() => app.has('Listening'));
    await app.tap('Listening');
    await app.until(() => app.has('Next'));
    await app.tap('Next');
    const done = await app.until(() => app.actions().length === 0);
    const shown = endShown(app.host);
    const before = lookFaults(app.host, 'dark');
    model.system = 'light';
    await act(async () => setSystem('light'));
    const after = lookFaults(app.host, 'light');
    look.stop();
    const footer = await app.leave();
    expect({ done, shown, before, after, frames: look.faults, footer }).toEqual({
      done: true,
      shown: {
        headings: [END],
        counts: [],
        grew: ['1 grew a stage.'],
        grown: [`${passage.reference}, full corn`],
      },
      before: [],
      after: [],
      frames: [],
      footer: [],
    });
  });
});
