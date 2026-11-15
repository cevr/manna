/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noNullish, effect/noTernary, no-await-in-loop -- a test of interleaved promises: storage answers are held and let go one by one in every order, and each order is replayed from the start. */

/**
 * Calls overlap (spec A3): Next (a write) racing a Minutes change (a
 * making), and two Nexts sent at once (a double tap). Every order in which
 * their storage answers can come back is walked, each replayed from the
 * same start: the garden and the session end as one of the two serial
 * orders ends them, and the try is recorded once.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { runCall } from '@manna/exact-kit/effect';
import { offsetAt } from '@manna/heartseed/day';

import { readGarden } from '../garden/program';
import { plainOf, storageOf } from '../test/garden-model';
import { makeSessionPort } from '../test/session-model';
import type { TodayScreen } from '../today/sources';

const START = Date.UTC(2026, 10, 16, 14, 0, 0);
const SEED = 7;
const HOST = { turn: withDataHost, wait: () => Promise.resolve() };

/** A storage stand-in whose answers, once `hold` is on, wait until the walk lets each go. */
const holdingStorage = () => {
  const stand = storageOf();
  const held: (() => void)[] = [];
  const state = { hold: false };
  const { fs } = stand.storage;
  const later = <A>(answer: () => Promise<A>): Promise<A> => {
    if (!state.hold) return answer();
    return new Promise<A>((resolve, reject) => {
      held.push(() => {
        answer().then(resolve, reject);
      });
    });
  };
  return {
    stand: {
      ...stand,
      storage: {
        fs: {
          readFile: (path: string) => later(() => Promise.resolve(fs.readFile(path))),
          atomicWriteFile: (path: string, data: Uint8Array) =>
            later(() => Promise.resolve(fs.atomicWriteFile(path, data))),
        },
      },
    },
    held,
    state,
  };
};

const settle = async () => {
  for (let n = 0; n < 60; n++) await Promise.resolve();
};

/** A port at Today with John 3:16-18 and Psalm 23:1 planted, its first item said through and graded. */
const graded = async () => {
  const holding = holdingStorage();
  const port = makeSessionPort(holding.stand);
  const offset = offsetAt(START);
  await port.call('gardenPlant', [43, 3, 16, 18, START, offset, SEED]);
  await port.call('gardenPlant', [19, 23, 1, 1, START, offset, SEED]);
  const shown = await port.call<TodayScreen>('todayOpen', [
    'today',
    '',
    '',
    '5',
    'her',
    START,
    SEED,
  ]);
  await port.call('todaySay', ['r1', START + 1000, SEED]);
  await port.call('todayHeard', ['r1', shown.passage, true]);
  const done = await port.call<TodayScreen>('todayFinish', []);
  return { port, holding, reference: done.reference, startedAt: done.pending?.recall.startedAt };
};

type Pair = readonly (readonly [string, readonly unknown[]])[];

const NOW = START + 60_000;

const NEXT = ['todayNext', [offsetAt(NOW), NOW, SEED]] as const;
const MINUTES = ['todayOpen', ['today', '', '', '20', 'her', NOW, SEED]] as const;

/** Where both calls leave the garden and the session, and how many recalls the try left. */
const endOf = async (
  port: Awaited<ReturnType<typeof graded>>['port'],
  reference: string,
  startedAt: number | undefined,
) => {
  const held = await runCall(readGarden(port.storage), { now: NOW, seed: SEED }, HOST);
  const screen = await port.call<TodayScreen>('todayBoot', []);
  const recalls =
    held.garden._tag === 'Read'
      ? (held.garden.plants.get(reference)?.recalls ?? []).filter(
          (each) => each.startedAt === startedAt,
        ).length
      : -1;
  return { garden: plainOf(held), wire: screen.session.wire, shown: screen.reference, recalls };
};

/** The two calls one after the other, in `order`. */
const serial = async (pair: Pair, order: readonly number[]) => {
  const at = await graded();
  for (const index of order) {
    const [source, args] = pair[index] ?? pair[0] ?? NEXT;
    await at.port.call(source as never, args);
  }
  return endOf(at.port, at.reference, at.startedAt);
};

/** The two calls sent at once, their held answers let go in the order `choices` names (the first held for any past it); the branching seen at each let-go. */
const together = async (pair: Pair, choices: readonly number[]) => {
  const at = await graded();
  at.holding.state.hold = true;
  const ended = { count: 0 };
  const calls = pair.map(([source, args]) =>
    at.port.call(source as never, args).then(() => {
      ended.count++;
    }),
  );
  const branching: number[] = [];
  while (ended.count < pair.length) {
    await settle();
    if (at.holding.held.length === 0) continue;
    const pick = choices[branching.length] ?? 0;
    branching.push(at.holding.held.length);
    const [next] = at.holding.held.splice(pick, 1);
    next?.();
  }
  await Promise.all(calls);
  at.holding.state.hold = false;
  return { end: await endOf(at.port, at.reference, at.startedAt), branching };
};

/**
 * Every order of the held answers, walked whole by replaying each from the
 * start: at each let-go with more than one answer held, each is tried in
 * turn. Each end, and the orders walked.
 */
const walk = async (pair: Pair) => {
  const ends: Awaited<ReturnType<typeof endOf>>[] = [];
  const visit = async (prefix: readonly number[]) => {
    const ran = await together(pair, prefix);
    const fork = ran.branching.findIndex((width, at) => at >= prefix.length && width > 1);
    if (fork === -1) {
      ends.push(ran.end);
      return;
    }
    const fixed = [...prefix, ...ran.branching.slice(prefix.length, fork).map(() => 0)];
    for (let choice = 0; choice < (ran.branching[fork] ?? 1); choice++)
      await visit([...fixed, choice]);
  };
  await visit([]);
  return ends;
};

describe('calls that overlap', () => {
  it('Next racing a Minutes change ends as one of the two serial orders, the try recorded once, sent in either order and in every order of their answers', async () => {
    const serials = [await serial([NEXT, MINUTES], [0, 1]), await serial([NEXT, MINUTES], [1, 0])];
    expect(Bun.deepEquals(serials[0], serials[1])).toBe(false);
    for (const pair of [
      [NEXT, MINUTES],
      [MINUTES, NEXT],
    ] satisfies Pair[]) {
      const ends = await walk(pair);
      expect(ends.length).toBeGreaterThan(1);
      for (const end of ends) {
        expect(end.recalls).toBe(1);
        expect(serials.some((each) => Bun.deepEquals(each, end))).toBe(true);
      }
    }
  });

  it('two Nexts at once record the try once, and end as Next alone does, in every order of their answers', async () => {
    const alone = await serial([NEXT], [0]);
    const ends = await walk([NEXT, NEXT]);
    expect(ends.length).toBeGreaterThan(1);
    for (const end of ends) {
      expect(end.recalls).toBe(1);
      expect(end).toEqual(alone);
    }
  });
});
