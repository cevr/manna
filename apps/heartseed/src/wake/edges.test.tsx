/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noTryCatch, eslint/no-await-in-loop -- a React screen test: it mounts the root in happy-dom through the wake rig's promise-based steps over a disk and a clock kept in plain values, each case in its zone through `process.env.TZ`, put back in a `finally` even when a step throws. */

/**
 * The foreground's edges on home and Today, each a case the walk reaches by
 * chance at most: states sent in every phase of the first minute change
 * nothing, and Continue leads to home, whose first show makes the plan at
 * Continue's instant; states sent in the pending frame are no event, and
 * the subscription reads the state it starts in, so an `active` after a
 * launch read in the background is a return, which turns home's done state
 * to `Start`; a return in an unread garden keeps its first piece, its
 * result and Say it, with no counts line; a return while a recital finishes
 * (its end held back) makes no plan, so its item stays held until Next and
 * the old plan's next item follows; and a verse planted at 21:00 is not due
 * at a return to home at 03:50 the next morning and is due at one at 04:10,
 * in Los Angeles, Kathmandu and Lord Howe. A read launch lands on home,
 * held to its counts line and `Start` (shown exactly when the plan holds an
 * item, and taken to reach Today) with no frame fault.
 */

import { describe, expect, it } from 'bun:test';
import { MutableRef } from 'effect';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import type { Recall } from '../sayit';
import type { TextPiece } from '../session';
import { keyOf, PREFIX } from '../test/garden-model';
import { deviceOf, PASSAGE, type Device, type Faults } from '../test/run-rig';
import { countsModel, DAY, dueModel, HOUR, MINUTE, planModel } from '../test/session-model';
import { cardLineModel } from '../test/home-model';
import { homeLines } from '../test/root-rule';
import { wakeLaunch, type WakeLaunch } from '../test/wake-rig';
import { wallAt } from '../test/wake-walk';
import { hostZone, offsetIn, restore, travel } from '../test/zone';

const T0 = Date.UTC(2027, 0, 14, 13);

/** `work` with the host in `zone`, the zone before put back after, even when it throws. */
const zoned = async (zone: string, work: () => Promise<void>) => {
  const before = hostZone();
  travel(zone);
  try {
    await work();
  } finally {
    restore(before);
  }
};

const pieceOf = (reference: string, group: string, words: number): TextPiece => {
  const text = Array.from({ length: words }, (_, at) => ['amber', 'brook', 'cedar'][at % 3]).join(
    ' ',
  );
  return { reference, text, words: sourceWords(text).length, group };
};

/** A recall of `piece` at `startedAt` under the offset of `zone` then, graded Good. */
const recallOf = (piece: TextPiece, startedAt: number, zone: string): Recall => ({
  reference: piece.reference,
  startedAt,
  offset: offsetIn(zone, startedAt),
  grade: 3,
  suggested: 3,
  words: piece.words,
  missed: 0,
  peeked: 0,
  extra: 0,
});

const diskOf = (recalls: readonly Recall[]) =>
  deviceOf(recalls.map((recall) => [keyOf(recall), JSON.stringify(recall)] as const));

const plantsOf = (device: Device) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of device.disk)
    if (key.startsWith(PREFIX)) {
      const recall = JSON.parse(value) as Recall;
      plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
    }
  return plants;
};

/** The recalls each reference's plant holds on `device` now. */
const recallsOn = (device: Device) => (reference: string) =>
  plantsOf(device).get(reference)?.length ?? 0;

/** The plan the model makes over `device` at `at` in `zone`, 5 minutes chosen. */
const planAt = (device: Device, pieces: readonly TextPiece[], at: number, zone: string) =>
  planModel({
    plants: plantsOf(device),
    pieces,
    at,
    offset: offsetIn(zone, at),
    minutes: 5,
  }).items;

/** Waits for Today to show `references` (none for the done state) and the counts line `counts`, and holds it there. */
const shows = async (app: WakeLaunch, references: readonly string[], counts: string) => {
  await app.until(
    () =>
      JSON.stringify([app.references(), app.counts()]) === JSON.stringify([references, [counts]]),
  );
  expect([app.references(), app.counts()]).toEqual([[...references], [counts]]);
  expect(app.faults).toEqual([]);
};

/** What home shows: its headings, its Today card's line, and whether `Start` shows. */
const homeOf = (app: WakeLaunch) => [app.headings(), homeLines(app.host), app.has('Start')];

/** Waits for home to show the Today card's line `counts` and `Start` exactly when `begin`, holds it there with no frame fault, then takes `Start` when it shows. */
const atHome = async (app: WakeLaunch, counts: string, begin: boolean) => {
  const want = [['Your field'], [counts], begin];
  await app.until(() => JSON.stringify(homeOf(app)) === JSON.stringify(want));
  expect(homeOf(app)).toEqual(want);
  expect(app.faults).toEqual([]);
  if (begin) expect(await app.tap('Start')).toBe(true);
};

const faultsOf = (): Faults => ({ unread: false, refuse: false });

describe('the foreground at Today’s edges', () => {
  it('changes nothing in each phase of the first minute, and Continue makes the plan at its own instant', () =>
    zoned('UTC', async () => {
      const device = deviceOf();
      const time = { now: T0 };
      const other = pieceOf('Alder 1:1', 'G1', 6);
      const pieces = [PASSAGE, other];
      const app = await wakeLaunch(device, faultsOf(), time, pieces);
      MutableRef.set(app.hearing, { kind: 'heard', text: passage.text, skip: [] });
      const phase = async (heading: string) => {
        expect(await app.until(() => app.headings().includes(heading))).toBe(true);
        for (const states of [
          ['background', 'active'],
          ['inactive', 'active'],
        ] as const) {
          time.now += HOUR;
          await app.send(states);
          await app.until(() => false, 5);
          expect(app.headings()).toContain(heading);
          expect(app.counts()).toEqual([]);
        }
      };
      const recite = async () => {
        await app.tap('Say it');
        expect(await app.until(() => app.has('Listening'))).toBe(true);
        await app.tap('Listening');
        await app.until(() => !app.has('Listening'));
      };
      await phase('Hear it');
      await app.tap('Next');
      await phase('Say it with help');
      await recite();
      await phase('Say it alone');
      await recite();
      await phase('Planted');
      time.now += DAY;
      await app.tap('Continue');
      const plan = planAt(device, pieces, time.now, 'UTC');
      const recalls = recallsOn(device);
      const first = plan.find((item) => recalls(item.reference) <= item.recalls);
      expect(plan.some((item) => item.reference === other.reference && item.fresh)).toBe(true);
      await atHome(app, cardLineModel(plan, recalls), true);
      await shows(app, [first?.reference ?? ''], countsModel(plan, recalls));
      expect(device.writes.filter((key) => key.startsWith(PREFIX))).toHaveLength(1);
      expect(await app.leave()).toEqual([]);
    }));

  it('takes no state sent in the pending frame as an event, and reads the state the subscription starts in', () =>
    zoned('America/Los_Angeles', async () => {
      const piece = pieceOf('Alder 1:1', 'G0', 4);
      const planted = recallOf(piece, T0 - 2 * DAY, 'America/Los_Angeles');
      const device = diskOf([planted]);
      const due = dueModel([planted]);
      const time = { now: due - 2 * HOUR };
      const app = await wakeLaunch(device, faultsOf(), time, [piece], { held: true });
      expect(app.headings()).not.toContain('Today');
      await app.send(['inactive', 'background', 'active', 'background']);
      expect(app.subscribed()).toBe(false);
      await app.open();
      await atHome(app, 'All tended for today | Nothing is due right now.', false);
      time.now = due + MINUTE;
      await app.send(['inactive']);
      await app.until(() => false, 5);
      await atHome(app, 'All tended for today | Nothing is due right now.', false);
      await app.send(['active']);
      const plan = planAt(device, [piece], time.now, 'America/Los_Angeles');
      await atHome(app, cardLineModel(plan, recallsOn(device)), true);
      await shows(app, [piece.reference], countsModel(plan, recallsOn(device)));
      expect(await app.leave()).toEqual([]);
    }));

  it('keeps an unread garden’s first piece, its result and Say it at a return, with no counts line', () =>
    zoned('Asia/Kathmandu', async () => {
      const [first, second] = [pieceOf('Alder 1:1', 'G0', 3), pieceOf('Alder 2:1', 'G1', 5)];
      const device = diskOf([recallOf(second, T0 - 9 * DAY, 'Asia/Kathmandu')]);
      const time = { now: T0 };
      const app = await wakeLaunch(device, { unread: true, refuse: false }, time, [first, second]);
      const unchanged = async (grades: number, alerts: number) => {
        for (const states of [
          ['background', 'active'],
          ['inactive', 'background', 'inactive', 'active'],
        ] as const) {
          time.now += DAY;
          await app.send(states);
          await app.until(() => false, 5);
          expect([app.references(), app.actions(), app.counts()]).toEqual([
            [first.reference],
            ['Say it'],
            [],
          ]);
          expect([app.grades().length, app.alerts()]).toEqual([grades, alerts]);
        }
      };
      expect(await app.until(() => app.has('Say it'))).toBe(true);
      await unchanged(0, 0);
      await app.tap('Say it');
      expect(await app.until(() => app.has('Listening'))).toBe(true);
      await app.tap('Listening');
      expect(await app.until(() => app.alerts() === 1)).toBe(true);
      await unchanged(0, 1);
      MutableRef.set(app.hearing, { kind: 'heard', text: first.text, skip: [] });
      await app.tap('Say it');
      expect(await app.until(() => app.has('Listening'))).toBe(true);
      await app.tap('Listening');
      expect(await app.until(() => app.grades().length === 1)).toBe(true);
      await unchanged(1, 0);
      expect(await app.leave()).toEqual([]);
    }));

  it('makes no plan at a return while a recital finishes: its item stays held until Next, and the old plan’s next item follows', () =>
    zoned('UTC', async () => {
      const [a, b, c] = [
        pieceOf('Alder 1:1', 'G0', 3),
        pieceOf('Birch 1:1', 'G1', 3),
        pieceOf('Cedar 1:1', 'G0', 3),
      ];
      const easy = (at: number) => ({ ...recallOf(c, at, 'UTC'), grade: 4 as const });
      const late = easy(T0 + DAY - (dueModel([easy(T0)]) - T0));
      const device = diskOf([
        recallOf(a, T0 - 20 * DAY, 'UTC'),
        recallOf(b, T0 - 19 * DAY, 'UTC'),
        late,
      ]);
      const time = { now: T0 };
      const pieces = [a, b, c];
      const app = await wakeLaunch(device, faultsOf(), time, pieces);
      const old = planAt(device, pieces, time.now, 'UTC');
      expect(old.map((item) => item.reference)).toEqual([a.reference, b.reference]);
      await atHome(app, cardLineModel(old, recallsOn(device)), true);
      await shows(app, [a.reference], countsModel(old, recallsOn(device)));
      MutableRef.set(app.hearing, { kind: 'heard', text: a.text, skip: [] });
      await app.tap('Say it');
      expect(await app.until(() => app.has('Listening'))).toBe(true);
      app.deferEnd();
      await app.tap('Listening');
      expect(await app.until(() => app.status() === 'finishing')).toBe(true);
      time.now = dueModel([late]) + HOUR;
      const remade = planAt(device, pieces, time.now, 'UTC');
      expect(remade.map((item) => item.reference)).not.toEqual(old.map((item) => item.reference));
      await app.send(['inactive', 'background', 'active']);
      expect(app.status()).toBe('finishing');
      await app.release();
      expect(await app.until(() => app.has('Next'))).toBe(true);
      expect([app.references(), app.grades().length]).toEqual([[a.reference], 1]);
      await app.tap('Next');
      await shows(app, [b.reference], countsModel(old, recallsOn(device)));
      expect(await app.leave()).toEqual([]);
    }));

  for (const zone of ['America/Los_Angeles', 'Asia/Kathmandu', 'Australia/Lord_Howe'])
    it(`keeps a verse planted at 21:00 out of a return at 03:50 and brings it at 04:10, in ${zone}`, () =>
      zoned(zone, async () => {
        const piece = pieceOf('Alder 1:1', 'G0', 4);
        const device = diskOf([recallOf(piece, wallAt(zone, T0, 1, 21), zone)]);
        const time = { now: wallAt(zone, T0, 1, 22) };
        const app = await wakeLaunch(device, faultsOf(), time, [piece]);
        await atHome(app, 'All tended for today | Nothing is due right now.', false);
        time.now = wallAt(zone, T0, 0, 3 + 50 / 60);
        await app.send(['inactive', 'background', 'active']);
        await app.until(() => false, 5);
        expect(planAt(device, [piece], time.now, zone)).toEqual([]);
        await atHome(app, 'All tended for today | Nothing is due right now.', false);
        time.now = wallAt(zone, T0, 0, 4 + 10 / 60);
        await app.send(['background', 'active']);
        const plan = planAt(device, [piece], time.now, zone);
        expect(plan.map((item) => item.reference)).toEqual([piece.reference]);
        await atHome(app, cardLineModel(plan, recallsOn(device)), true);
        await shows(app, [piece.reference], countsModel(plan, recallsOn(device)));
        expect(app.actions()).toEqual(['Say it']);
        expect(device.writes).toEqual([]);
        expect(await app.leave()).toEqual([]);
      }));
});
