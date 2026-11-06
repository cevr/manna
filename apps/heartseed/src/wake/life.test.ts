/**
 * The return rule (R8a) over generated sequences of the host's states:
 * every sequence of up to six states after each launch state, then long
 * random ones, each held event by event to `returnsModel`
 * (`src/test/wake-model.ts`), which reads the whole sequence instead of
 * folding it. `returnsOf`, the stream the session is woken from, gives one
 * element per return the model counts.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Stream } from 'effect';

import { lifeStep, returnsOf, UNSEEN } from '../foreground';
import { below, pickOf, random } from '../test/garden-model';
import { returnsModel } from '../test/wake-model';

const STATES = ['active', 'inactive', 'background'] as const;
/** What a launch may read as its own state: the three, and the web's `unknown`. */
const LAUNCH_STATES = [...STATES, 'unknown'] as const;

/** Every sequence over the three states of exactly `length`. */
const sequencesOf = (length: number): string[][] => {
  if (length === 0) return [[]];
  return sequencesOf(length - 1).flatMap((rest) => STATES.map((state) => [...rest, state]));
};

/** The returns `lifeStep` finds, event by event, after the launch's own state. */
const stepped = (current: string, events: readonly string[]) => {
  let life = lifeStep(UNSEEN, current).life;
  return events.map((state) => {
    const step = lifeStep(life, state);
    life = step.life;
    return step.returned;
  });
};

const streamed = (current: string, events: readonly string[]) =>
  Effect.runSync(Stream.runCount(returnsOf(Stream.fromIterable([current, ...events]))));

/** The sequences the spec names, each read as a run of the sequence: a floor the generated set must reach. */
const NAMED = {
  'background → active': (_, events) => events.join() === 'background,active',
  'inactive → background → active': (_, events) => events.join() === 'inactive,background,active',
  'inactive → background → inactive → active': (_, events) =>
    events.join() === 'inactive,background,inactive,active',
  'background → background → active': (_, events) =>
    events.join() === 'background,background,active',
  'inactive → active': (current, events) =>
    current === 'active' && events.join() === 'inactive,active',
  'a second active': (current, events) => current === 'active' && events.join() === 'active',
  'inactive repeated': (_, events) => events.join() === 'inactive,inactive,inactive',
  'a background launch whose first event is active': (current, events) =>
    current === 'background' && events[0] === 'active',
} satisfies Record<string, (current: string, events: readonly string[]) => boolean>;

describe('the return rule', () => {
  it('finds each return the model finds in every sequence of up to six states, after each launch state', () => {
    const reached = new Set<string>();
    let returns = 0;
    let quiet = 0;
    for (const current of LAUNCH_STATES)
      for (let length = 0; length <= 6; length++)
        for (const events of sequencesOf(length)) {
          const where = `${current} | ${events.join(',')}`;
          const want = returnsModel(current, events);
          expect(stepped(current, events), where).toEqual(want);
          for (const [name, holds] of Object.entries(NAMED))
            if (holds(current, events)) reached.add(name);
          if (want.some(Boolean)) returns += 1;
          else quiet += 1;
        }
    expect(Object.keys(NAMED).filter((name) => !reached.has(name))).toEqual([]);
    expect(returns).toBeGreaterThan(500);
    expect(quiet).toBeGreaterThan(500);
  });

  it('holds long random sequences to the model event by event, and the stream to its count', () => {
    let returns = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const next = random(seed);
      const current = pickOf(next, LAUNCH_STATES);
      const events = Array.from({ length: 20 + below(next, 180) }, () => pickOf(next, STATES));
      const want = returnsModel(current, events);
      const where = `seed ${seed}`;
      expect(stepped(current, events), where).toEqual(want);
      const count = want.filter(Boolean).length;
      returns += count;
      if (seed % 10 === 0) expect(streamed(current, events), where).toBe(count);
    }
    expect(returns).toBeGreaterThan(1000);
  });

  it('counts one element of the stream per return in every sequence of up to five states', () => {
    for (const current of LAUNCH_STATES)
      for (let length = 0; length <= 5; length++)
        for (const events of sequencesOf(length))
          expect(streamed(current, events), `${current} | ${events.join(',')}`).toBe(
            returnsModel(current, events).filter(Boolean).length,
          );
  });
});
