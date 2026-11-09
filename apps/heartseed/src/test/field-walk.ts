/* oxlint-disable effect/noAsyncFunction, eslint/no-await-in-loop, effect/noTernary, effect/noNullish -- each generated device plays its commands one after another through the field's promise-based screen rig, its launches never held (the rig's default, left undefined). */

/**
 * The field across generated sequences of commands, through the screen rig
 * (`field-rig.tsx`), which holds every frame to the root's and the field's
 * rules. Each device starts from a generated disk (the passage's history or
 * none, other verses of any reference, a setting); each launch lands on home
 * and goes to Today by `Begin` (`opened`), and the device plays opens of the
 * field by `Your field` and ways back by `Begin`, recitals, Again, peeks and
 * relaunches in any order. The writes each
 * command may make are modelled apart from the app: a recital adds one
 * record of the passage (and, when Today offers no Say it, first makes a
 * new plan at the passage's due through the Settings sheet's Minutes radio,
 * by home and back, which writes the minutes once), Again and a peek each rewrite one (none when Again
 * is already chosen), and an open or a way back writes, removes and clears
 * nothing and leaves the whole disk as it was. Each launch ends with the disk
 * showing no key removed and no key other than the passage's recalls changed
 * or added. The walk test files each play their own seeds through it.
 */

import { expect } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { heldOn, historyOf, otherReference } from './field-model';
import { toDue, type Time } from './clock';
import { mount, record } from './field-rig';
import { below, PREFIX, pickOf, random } from './garden-model';
import { device } from './one';

export type WalkCommand = 'field' | 'say' | 'again' | 'peek' | 'relaunch' | 'renew';

type App = Awaited<ReturnType<typeof mount>>;

/** What Today shows after the last command: a recital's result, and a missed word still to peek at. */
interface Shown {
  readonly result: boolean;
  readonly peekable: boolean;
}

const NOTHING_SHOWN: Shown = { result: false, peekable: false };

/** The instant each device's first launch starts at on Effect's clock: after every day its disk's histories start on. */
const START = Date.UTC(2026, 10, 5, 15);

const passageKeys = () =>
  [...device.disk.keys()].filter((key) => key.startsWith(`${PREFIX}${passage.reference}/`)).length;

/** The writes and passage records a command may add, modelled apart from the app; a relaunch counts its writes from the new launch's zero. A recital when Today offers no Say it (its item done, or the done state) first makes a new plan at the passage's due, the Settings sheet's Minutes radio that writes the minutes once. */
const allowed = (command: WalkCommand, againChosen: boolean, offered: boolean) => {
  if (command === 'say') return { sets: offered ? 1 : 2, keys: 1 };
  if (command === 'peek') return { sets: 1, keys: 0 };
  if (command === 'again') return { sets: againChosen ? 0 : 1, keys: 0 };
  return { sets: 0, keys: 0 };
};

/** Whether a launch's home offers `Begin`. */
const begins = (app: App) => app.buttons().includes('Begin');

/**
 * Mounts a launch over the disk as it stands, at `time`, on home, and goes
 * to Today by `Begin`. When home offers no `Begin` (the done state), that
 * launch ends writing nothing, and a relaunch at the passage's due (as a
 * Minutes radio in the Settings sheet makes the plan there) offers it.
 */
const opened = async (time: Time) => {
  let app = await mount(true, undefined, time);
  expect(await app.until(app.home)).toBe(true);
  if (!begins(app)) {
    const sets = device.calls.set;
    const faults = [...app.faults];
    expect({ faults, disk: await app.leave(), sets: device.calls.set }).toEqual({
      faults: [],
      disk: [],
      sets,
    });
    device.launch();
    toDue(
      time,
      heldOn(device.disk).filter((recall) => recall.reference === passage.reference),
    );
    app = await mount(true, undefined, time);
    expect(await app.until(app.home)).toBe(true);
  }
  await app.begin();
  return app;
};

/** Plays one command on the launch, and answers the launch after it and what Today shows. */
const play = async (app: App, command: WalkCommand, shown: Shown, time: Time) => {
  if (command === 'field') {
    await app.field();
    await app.back();
    return { app, shown };
  }
  if (command === 'say') {
    if (!app.buttons().includes('Say it')) await app.renew();
    await app.say();
    return { app, shown: { result: true, peekable: true } };
  }
  if (command === 'again') {
    await app.tap('Again');
    await app.until(() => app.stage() === 'Stage: seed');
    await app.until(() => false, 8);
    return { app, shown };
  }
  if (command === 'peek') {
    const sets = device.calls.set;
    await app.tap('Missed word 11');
    expect(await app.until(() => device.calls.set === sets + 1)).toBe(true);
    await app.until(() => false, 8);
    return { app, shown: { ...shown, peekable: false } };
  }
  expect({ faults: await app.leave() }).toEqual({ faults: [] });
  device.launch();
  return { app: await opened(time), shown: NOTHING_SHOWN };
};

/** Plays one generated device per seed, `steps` commands each, and answers how often each command ran. */
export const walkField = async (seeds: readonly number[], steps: number) => {
  const cover = new Map<WalkCommand, number>();
  for (const seed of seeds) {
    const next = random(seed * 6151 + 5);
    const day = 20_000 + below(next, 300);
    const references = [
      ...(next() < 0.6 ? [passage.reference] : []),
      ...Array.from({ length: 1 + below(next, 4) }, () => otherReference(next, passage.reference)),
    ];
    device.launch([
      ...references.flatMap((reference) => historyOf(next, reference, day)).map(record),
      ['heartseed/voice/enabled', 'false'],
    ]);
    const time: Time = { now: START };
    let state = { app: await opened(time), shown: NOTHING_SHOWN };
    for (let step = 0; step < steps; step += 1) {
      const command = pickOf(next, [
        'field',
        'field',
        'say',
        ...(state.shown.result ? (['again'] as const) : []),
        ...(state.shown.peekable ? (['peek'] as const) : []),
        'relaunch',
      ] as const);
      cover.set(command, (cover.get(command) ?? 0) + 1);
      const offered = state.app.buttons().includes('Say it');
      if (command === 'say' && !offered) cover.set('renew', (cover.get('renew') ?? 0) + 1);
      const may = allowed(command, state.app.checked() === 'Again', offered);
      const before = {
        sets: command === 'relaunch' ? 0 : device.calls.set,
        keys: passageKeys(),
      };
      state = await play(state.app, command, state.shown, time);
      const where = { seed, step, command };
      expect({ ...where, sets: device.calls.set, keys: passageKeys() }).toEqual({
        ...where,
        sets: before.sets + may.sets,
        keys: before.keys + may.keys,
      });
    }
    expect({ seed, faults: state.app.faults }).toEqual({ seed, faults: [] });
    expect({ seed, disk: await state.app.leave() }).toEqual({ seed, disk: [] });
  }
  return Object.fromEntries(cover) as Partial<Record<WalkCommand, number>>;
};
