/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noNewPromise, no-await-in-loop -- a test model: each step is awaited as Exact asks its sources one by one. */

/**
 * One generated history of the garden (spec A2, A4), run on the port's
 * sources and on the oracle (`garden-model.ts`) side by side: after every
 * step the two hold the same plants (recalls, steps back, card, stage),
 * lists and single verses, and Your verses draws the same; every answer of
 * a plant, a remove and a move back is the oracle's. On every step the
 * invariants hold: a list made holds three verses or more, single verses
 * stay at 20 or fewer and count among no list, lists stay at three or
 * fewer, a recall with a peek is kept at Hard or below, Show all leaves the
 * verse no higher than `backOf` puts it, a grade of Good or better never
 * brings a due earlier, and a read writes nothing. The tests that run them
 * are cut in three parts so each stays under its budget alone.
 */

import { runCall } from '@manna/exact-kit/effect';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { backOf, stageOf, type Stage } from '@manna/heartseed/garden';
import { listsOf } from '@manna/heartseed/lists';
import { LEAST_VERSES, MOST_PASSAGES, MOST_SINGLES } from '@manna/heartseed/passages';
import { expect } from 'bun:test';
import { Option } from 'effect';

import { readGarden, type Held } from '../garden/program';
import { shownOf, type GardenShown } from '../garden/view';
import { makeOracle, makePort, openingOf, plainOf, stepOf, type Step } from './garden-model';
import { seeded } from './random';

/** The most steps a history takes. */
export const STEPS = 30;

const START = Date.UTC(2026, 10, 15, 13, 0, 0);
const HOST = { turn: withDataHost, wait: () => Promise.resolve() };
const RANK: readonly Stage[] = ['seed', 'blade', 'ear', 'full corn'];

/** The steps whose answer the oracle gives too. */
const ANSWERED: ReadonlySet<Step['_tag']> = new Set(['plant', 'remove', 'back']);

/** The steps a reader takes a minute or two over. */
const TAKE_TIME: ReadonlySet<Step['_tag']> = new Set(['plant', 'recall', 'back']);

/** Every invariant of A4 on one step, from the port's holding before and after it. */
const invariants = (step: Step, before: Held, after: Held, seed: number) => {
  const where = `seed ${seed} ${step._tag}`;
  if (after.passages._tag === 'Read') {
    const lists = listsOf([], after.passages, []);
    expect({ where, lists: lists.length }).toEqual({
      where,
      lists: after.passages.passages.length + after.passages.lists.length,
    });
    expect({ where, most: lists.length <= MOST_PASSAGES }).toEqual({ where, most: true });
    for (const list of lists)
      expect({ where, least: list.verses.length >= LEAST_VERSES }).toEqual({ where, least: true });
  }
  Option.map(after.singles, (singles) =>
    expect({ where, singles: singles.length <= MOST_SINGLES }).toEqual({ where, singles: true }),
  );
  if (step._tag !== 'recall' || after.garden._tag === 'Unread') return;
  const plant = Option.fromUndefinedOr(after.garden.plants.get(step.reference));
  const recall = Option.flatMap(plant, (each) =>
    Option.fromUndefinedOr(each.recalls.find((kept) => kept.startedAt === step.recall.startedAt)),
  );
  expect({ where, kept: Option.isSome(recall) }).toEqual({ where, kept: true });
  if (step.help.peeked.length > 0)
    expect({ where, peek: Option.exists(recall, (kept) => kept.grade <= 2) }).toEqual({
      where,
      peek: true,
    });
  const was =
    before.garden._tag === 'Read'
      ? Option.fromUndefinedOr(before.garden.plants.get(step.reference))
      : Option.none();
  if (step.help.shownAt !== null && Option.isSome(was)) {
    const landing = Option.getOrElse(backOf(stageOf(was.value)), (): Stage => 'seed');
    expect({
      where,
      shownAll: Option.exists(
        Option.map(plant, stageOf),
        (stage) => RANK.indexOf(stage) <= RANK.indexOf(landing),
      ),
    }).toEqual({ where, shownAll: true });
  }
  if (
    Option.isSome(was) &&
    step.help.shownAt === null &&
    Option.exists(recall, (kept) => kept.grade >= 3)
  )
    expect({
      where,
      due: Option.exists(plant, (each) => each.card.due >= was.value.card.due),
    }).toEqual({ where, due: true });
};

/** Runs the history of `seed`, each step on the port and the oracle; a broken step fails with its seed. */
export const runHistory = async (seed: number) => {
  const random = seeded(seed);
  const port = makePort();
  const oracle = await makeOracle();
  const portHeld = async (now: number) => {
    const writes = port.counts.writes;
    const held = await runCall(readGarden(port.storage), { now, seed }, HOST);
    expect({ seed, readWrites: port.counts.writes }).toEqual({ seed, readWrites: writes });
    return held;
  };
  let now = START + random.below(86_400_000);
  let offset = random.pick([-300, 0, 330]);
  let held = await portHeld(now);
  let known = await oracle.held(now);
  const opening = [...openingOf(random)];
  for (let n = opening.length + 1 + random.below(STEPS - opening.length); n > 0; n--) {
    const step = opening.shift() ?? stepOf(random, { now, offset, held: known });
    const answer = await portStep(port, step, { now, offset, seed });
    if (step._tag === 'pass') now += step.ms;
    if (step._tag === 'zone') offset = step.offset;
    if (step._tag === 'read')
      expect({ seed, shown: answer }).toEqual({ seed, shown: shownOf(known, { now, offset }) });
    const expected = await oracle.run(step, now);
    if (ANSWERED.has(step._tag))
      expect<unknown>({ seed, step, answer }).toEqual({ seed, step, answer: expected });
    const after = await portHeld(now);
    known = await oracle.held(now);
    expect({ seed, step, held: plainOf(after) }).toEqual({ seed, step, held: plainOf(known) });
    expect({ seed, step, shown: shownOf(after, { now, offset }) }).toEqual({
      seed,
      step,
      shown: shownOf(known, { now, offset }),
    });
    invariants(step, held, after, seed);
    held = after;
    if (TAKE_TIME.has(step._tag)) now += 60_000 + random.below(60_000);
  }
  return { port, oracle, now, offset };
};

/** Runs `step` on the port as Exact calls its sources: a change's answer, a read's view, nothing for the rest. */
const portStep = async (
  port: ReturnType<typeof makePort>,
  step: Step,
  at: { readonly now: number; readonly offset: number; readonly seed: number },
): Promise<string | GardenShown | undefined> => {
  const { now, offset, seed } = at;
  switch (step._tag) {
    case 'plant': {
      const { book, chapter, first, last } = step.range;
      const changed = await port.call<{ answer: string }>('gardenPlant', [
        book,
        chapter,
        first,
        last,
        now,
        offset,
        seed,
      ]);
      return changed.answer;
    }
    case 'remove':
      return (await port.call<{ answer: string }>('gardenRemove', [step.id, now, offset, seed]))
        .answer;
    case 'recall':
      return (
        await port.call<{ answer: string }>('gardenRecall', [
          step.reference,
          step.recall,
          step.help,
          now,
          offset,
          seed,
        ])
      ).answer;
    case 'back':
      return (
        await port.call<{ answer: string }>('gardenBack', [step.reference, now, offset, seed])
      ).answer;
    case 'relaunch':
      port.relaunch();
      return undefined;
    case 'read':
      return port.call<GardenShown>('gardenRead', [offset, now, seed]);
    default:
      return undefined;
  }
};
