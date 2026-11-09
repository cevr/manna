/* oxlint-disable effect/noAsyncFunction, effect/noTernary, eslint/no-await-in-loop -- a React screen walk: it drives launches of the root in happy-dom through the run rig's promise-based `act`, one generated step after another. */

/**
 * Today in dark, and across flips of the system, as a model-based walk
 * through the run rig (`src/test/run-rig.tsx`): over a verse due, generated
 * sequences of Say it (heard whole, heard with a word missed, unheard, and
 * each with the system flipped while it listens), a peek at a missed word,
 * a grade, Next to the done state, a Minutes pill, the field and back, and a
 * flip of the system between any two steps. The model is the system's last
 * value; every frame (each DOM mutation batch) and every settled screen
 * holds the frame oracle (`src/test/look.ts`) for it, and the run rig's
 * footer rule holds too. It counts words without printing one.
 */

import { describe, expect, it } from 'bun:test';
import { MutableRef } from 'effect';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import { recallOf } from '../test/field-model';
import { record } from '../test/field-rig';
import { below, DAY, pickOf, random } from '../test/garden-model';
import { lookFaults, setSystem, watchLook } from '../test/look';
import { rootFaults } from '../test/root-rule';
import { deviceOf, launch, type Hearing } from '../test/run-rig';
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

/** The recitals a walk opens with, one per walk in turn, before a peek and the generated steps. */
const SAYS: readonly Step[] = ['missed', 'heard', 'flipListening', 'unheard'];

const other = (scheme: Scheme): Scheme => (scheme === 'light' ? 'dark' : 'light');

/** The model of the system: the appearance it last named. */
interface Model {
  system: Scheme;
}

/** One walk: a launch under `start`, then `steps` steps drawn from `seed`, every frame held to the oracle for the model's system. */
const walk = async (seed: number, start: Scheme, steps: number) => {
  const next = random(seed * 7919 + 17);
  const model: Model = { system: start };
  setSystem(start);
  const app = await launch(dueDevice(), { unread: false, refuse: false }, { now: T0 });
  const look = watchLook(app.host, () => model.system);
  const report: string[] = [];
  /** Whether the field in the done state left the walk on home, which ends it. */
  const ended = { home: false };
  const flip = async () => {
    model.system = other(model.system);
    await act(async () => setSystem(model.system));
  };
  const settle = async (name: string) => {
    await app.until(() => lookFaults(app.host, model.system).length === 0, 300);
    const faults = lookFaults(app.host, model.system);
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
    minutes: () => app.tap(pickOf(next, ['2 min', '5 min', '10 min', '20 min']), 'radio'),
    field: async () => {
      const acted = app.actions().length > 0;
      if (!(await app.tap('Your field'))) return false;
      await app.until(
        () =>
          app.headings().includes('Your field') &&
          app.host.querySelectorAll('[data-testid="counts"]').length > 0,
      );
      await settle('the field');
      if (!acted) {
        ended.home = true;
        coverage['field, done'] = (coverage['field, done'] ?? 0) + 1;
        if (app.has('Begin')) report.push(`seed ${seed} the field, done: Begin shown`);
        for (const fault of rootFaults(app.host, 'read'))
          report.push(`seed ${seed} the field, done: ${fault}`);
        return true;
      }
      await app.tap('Begin');
      return app.until(() => app.headings().includes('Today'));
    },
    flip: async () => {
      await flip();
      return true;
    },
  };
  await app.until(() => app.has('Say it'));
  await settle('launch');
  const opening: readonly Step[] = [SAYS[seed % SAYS.length] ?? 'heard', 'peek'];
  for (let n = 0; n < steps && !ended.home; n++) {
    const step = opening[n] ?? pickOf(next, STEPS);
    if (await run[step]()) coverage[step] = (coverage[step] ?? 0) + 1;
    await settle(step);
    if (app.headings().includes('Today') && app.actions().length === 0)
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

/** How many times each step took effect across the walks, how many settled screens showed the done state, and how many walks the field in the done state ended on home. */
const coverage: Partial<Record<Step | 'done' | 'field, done', number>> = {};

describe('Today in dark and across flips of the system', () => {
  it('holds every frame of generated walks (Say it heard, missed or unheard, a peek, a grade, Next to done, Minutes, the field and back) to the oracle for the system’s last value', async () => {
    const walks = [];
    for (let n = 0; n < 4; n++) walks.push(await walk(n, n % 2 === 0 ? 'dark' : 'light', 10));
    const all: readonly (Step | 'done' | 'field, done')[] = [...STEPS, 'done', 'field, done'];
    const reached = all.filter((step) => (coverage[step] ?? 0) === 0);
    expect({
      reports: walks.flatMap((each) => each.report),
      frames: walks.flatMap((each) => each.frames),
      footers: walks.flatMap((each) => each.footer ?? []),
      seen: walks.every((each) => each.seen > 5),
      unreached: reached,
    }).toEqual({ reports: [], frames: [], footers: [], seen: true, unreached: [] });
  });

  it('reaches the done state in dark, a flip there repainting it with no tap', async () => {
    setSystem('dark');
    const app = await launch(dueDevice(), { unread: false, refuse: false }, { now: T0 });
    const model: Model = { system: 'dark' };
    const look = watchLook(app.host, () => model.system);
    await app.until(() => app.has('Say it'));
    MutableRef.set(app.hearing, { kind: 'heard', text: passage.text, skip: [] });
    await app.tap('Say it');
    await app.until(() => app.has('Listening'));
    await app.tap('Listening');
    await app.until(() => app.has('Next'));
    await app.tap('Next');
    const done = await app.until(() => app.actions().length === 0);
    model.system = 'light';
    await act(async () => setSystem('light'));
    const after = lookFaults(app.host, 'light');
    look.stop();
    const footer = await app.leave();
    expect({ done, after, frames: look.faults, footer }).toEqual({
      done: true,
      after: [],
      frames: [],
      footer: [],
    });
  });
});
