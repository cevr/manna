/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noNullish, effect/noTernary, no-await-in-loop -- a test of interleaved promises: storage answers are held and let go one by one in a generated order, and the walker's states are plain data. */

/**
 * Two garden calls overlap (spec A5): the runner lets them, and each builds
 * its own store over the one file, so the current app's `Semaphore` holds
 * within one call alone. `writes.ts` orders them, and this is how it is
 * shown, twice.
 *
 * The walker visits every interleaving of the protocol `writes.qnt` writes
 * (two calls, each a read of the file and one or two writes of it, a call
 * of two writes being a Show all's step back then its recall): with the
 * queue, every end state is one of the two serial orders' (no lost update)
 * and no read sees a file between one call's two writes (no half-seen
 * write); without it, some interleaving breaks each.
 *
 * Then the port itself: generated pairs of garden changes over a generated
 * garden, started together, their storage answers let go in a generated
 * order, end where one of the two serial orders ends, every recall kept.
 */

import { describe, expect, it } from 'bun:test';

import { makePort, plainOf, storageOf } from '../test/garden-model';
import { seeded, type Random } from '../test/random';
import { runCall } from '@manna/exact-kit/effect';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { readGarden } from './program';

/** One call of the protocol: the writes it makes after its one read. */
interface Call {
  readonly writes: 1 | 2;
}

/** Where a call stands: waiting its turn, read (with what it read), each write made, done. */
interface Walk {
  readonly pc: readonly number[];
  readonly seen: readonly (readonly string[])[];
  readonly file: readonly string[];
  readonly owner: number;
  readonly halfSeen: boolean;
}

/** Every end state of the two calls over all interleavings, and whether any read saw half a call's writes. */
const walk = (calls: readonly Call[], queued: boolean) => {
  const ends = new Set<string>();
  let halfSeen = false;
  const visit = (state: Walk) => {
    if (state.halfSeen) halfSeen = true;
    const moves = calls.flatMap((call, index) => {
      const pc = state.pc[index] ?? 0;
      if (pc > call.writes) return [];
      if (pc === 0 && queued && state.owner !== -1 && state.owner !== index) return [];
      return [index];
    });
    if (moves.length === 0) {
      ends.add(state.file.join(','));
      return;
    }
    for (const index of moves) visit(step(calls, state, index));
  };
  visit({
    pc: calls.map(() => 0),
    seen: calls.map(() => []),
    file: [],
    owner: -1,
    halfSeen: false,
  });
  return { ends, halfSeen };
};

/** Call `index` takes its next step: its read, or a write of what it read with its own changes so far. */
const step = (calls: readonly Call[], state: Walk, index: number): Walk => {
  const call = calls[index] ?? { writes: 1 };
  const pc = state.pc[index] ?? 0;
  const pcs = state.pc.map((each, at) => (at === index ? each + 1 : each));
  if (pc === 0) {
    const midway = state.pc.some(
      (each, at) => at !== index && each > 1 && each <= (calls[at]?.writes ?? 1),
    );
    return {
      ...state,
      pc: pcs,
      seen: state.seen.map((each, at) => (at === index ? state.file : each)),
      owner: index,
      halfSeen: state.halfSeen || midway,
    };
  }
  const own = Array.from({ length: pc }, (_, n) => `${index}.${n}`);
  const done = pc === call.writes;
  return {
    ...state,
    pc: pcs,
    file: [...(state.seen[index] ?? []), ...own],
    owner: done ? -1 : state.owner,
  };
};

/** The two serial orders' end states. */
const serialEnds = (calls: readonly Call[]) =>
  new Set(
    [
      [0, 1],
      [1, 0],
    ].map((order) =>
      order
        .flatMap((index) =>
          Array.from({ length: calls[index]?.writes ?? 1 }, (_, n) => `${index}.${n}`),
        )
        .join(','),
    ),
  );

const LAYOUTS: readonly (readonly Call[])[] = [
  [{ writes: 1 }, { writes: 1 }],
  [{ writes: 2 }, { writes: 1 }],
  [{ writes: 1 }, { writes: 2 }],
  [{ writes: 2 }, { writes: 2 }],
];

describe('the protocol of writes.qnt, walked whole', () => {
  it('with the queue: no lost update and no half-seen write, in every interleaving', () => {
    for (const calls of LAYOUTS) {
      const walked = walk(calls, true);
      expect({ calls, ends: [...walked.ends].sort() }).toEqual({
        calls,
        ends: [...serialEnds(calls)].sort(),
      });
      expect({ calls, halfSeen: walked.halfSeen }).toEqual({ calls, halfSeen: false });
    }
  });

  it('without it: some interleaving loses an update, and some read sees half a write', () => {
    const lost = LAYOUTS.some((calls) =>
      [...walk(calls, false).ends].some((end) => !serialEnds(calls).has(end)),
    );
    const half = LAYOUTS.some((calls) => walk(calls, false).halfSeen);
    expect({ lost, half }).toEqual({ lost: true, half: true });
  });
});

/** A storage whose every answer is held until the test lets it go. */
const heldStorageOf = () => {
  const stand = storageOf();
  const held: (() => void)[] = [];
  const later = <A>(answer: () => Promise<A>) =>
    new Promise<A>((resolve, reject) => {
      held.push(() => {
        answer().then(resolve, reject);
      });
    });
  const { fs } = stand.storage;
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
  };
};

const settle = async () => {
  for (let n = 0; n < 40; n++) await Promise.resolve();
};

const START = Date.UTC(2026, 10, 15, 13, 0, 0);
const REFERENCES = ['John 3:16', 'John 3:17', 'John 3:18', 'Psalms 23:1'];

/** A garden change as the Contract sends it, at `now`. */
const changeOf = (random: Random, now: number): readonly [string, readonly unknown[]] => {
  const reference = random.pick(REFERENCES);
  const recall = {
    startedAt: now,
    offset: 0,
    grade: random.pick([1, 2, 3, 4]),
    suggested: 3,
    words: 10,
    missed: 0,
    peeked: 0,
    extra: 0,
  };
  const help = random.pick([
    { peeked: [], shownAt: null, cap: 4 },
    { peeked: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], shownAt: now - 1000, cap: 2 },
  ]);
  switch (random.below(5)) {
    case 0:
      return ['gardenPlant', [19, 23, 1, random.pick([1, 3]), now, 0, 1]];
    case 1:
      return [
        'gardenRemove',
        [random.pick(['single:Psalms 23:1', 'passage:0:43.3.16-18']), now, 0, 1],
      ];
    case 2:
      return ['gardenBack', [reference, now, 0, 1]];
    default:
      return ['gardenRecall', [reference, recall, help, now, 0, 1]];
  }
};

/** The garden a pair starts from: John 3:16-18 and Psalm 23:1 planted, and a few recalls. */
const openOn = async (port: ReturnType<typeof makePort>, random: Random) => {
  await port.call('gardenPlant', [43, 3, 16, 18, START, 0, 1]);
  await port.call('gardenPlant', [19, 23, 1, 1, START, 0, 1]);
  for (let n = random.below(4); n > 0; n--) {
    const reference = random.pick(REFERENCES);
    await port.call('gardenRecall', [
      reference,
      {
        startedAt: START + n,
        offset: 0,
        grade: 3,
        suggested: 3,
        words: 10,
        missed: 0,
        peeked: 0,
        extra: 0,
      },
      { peeked: [], shownAt: null, cap: 4 },
      START + n,
      0,
      1,
    ]);
  }
};

const HOST = { turn: withDataHost, wait: () => Promise.resolve() };
const heldOn = (port: ReturnType<typeof makePort>, now: number) =>
  runCall(readGarden(port.storage), { now, seed: 1 }, HOST).then(plainOf);

describe('two garden calls at once', () => {
  it('end as one of their serial orders, every recall kept, for generated pairs and answer orders', async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const random = seeded(seed);
      const now = START + 3_600_000;
      const pair = [changeOf(random, now), changeOf(random, now + 1)] as const;
      const order = random.next();
      const serial = async (first: 0 | 1) => {
        const port = makePort();
        await openOn(port, seeded(seed));
        for (const index of [first, 1 - first]) {
          const [source, args] = pair[index] ?? pair[0];
          await port.call(source as never, args);
        }
        return heldOn(port, now + 2);
      };
      const orders = [await serial(0), await serial(1)];

      const { stand, held } = heldStorageOf();
      const port = makePort(stand);
      const opening = openOn(port, seeded(seed));
      while (true) {
        await settle();
        const next = held.shift();
        if (next === undefined) break;
        next();
      }
      await opening;
      const ended = { count: 0 };
      const both = pair.map(([source, args]) =>
        port.call(source as never, args).then(() => {
          ended.count++;
        }),
      );
      const pick = seeded(Math.floor(order * 1e9));
      while (ended.count < 2) {
        await settle();
        if (held.length === 0) continue;
        const [next] = held.splice(pick.below(held.length), 1);
        next?.();
      }
      await Promise.all(both);
      const together = await heldOn(makePort(storageOf(stand.files)), now + 2);
      expect({ seed, pair, ended: orders.some((each) => Bun.deepEquals(each, together)) }).toEqual({
        seed,
        pair,
        ended: true,
      });
      for (const [source, args] of pair) {
        if (source !== 'gardenRecall' || together.plants === 'Unread') continue;
        const [reference, recall] = args as readonly [string, { startedAt: number }];
        const plant = together.plants.find((each) => each.reference === reference);
        expect({
          seed,
          kept: plant?.recalls.some((each) => each.startedAt === recall.startedAt),
        }).toEqual({
          seed,
          kept: true,
        });
      }
    }
  });
});
