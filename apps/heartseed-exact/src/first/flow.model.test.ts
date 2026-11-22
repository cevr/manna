/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noNewPromise, effect/noTernary, no-await-in-loop -- a model test over the port's sources: each step's call is awaited in turn as Exact asks them, the stand-in host's wait answers with a promise as Exact's does, the generated events are plain data picked by plain branches, and One's absent start is `null` as its reducer takes it. */

/**
 * The first minute on the port beside the current Heartseed's own root, over
 * generated runs: every input One's `Input` names (Begin, Skip, Plant, Next,
 * each ending of the voice's reading, recitals started and graded or not,
 * the garden's answer with the first verse planted or not), the tour's taps
 * the screen shows (Continue, How, Begin, Skip, See, Got it, Leave) and a
 * relaunch at any step. The port runs through its own sources
 * (`firstSources`, the garden read from a storage stand-in where the alone
 * recital's write lands); One runs `step`, `tourStep` and its root's opening
 * (`openingOf` at the launch, the decision kept until Continue). After every
 * step both show the same thing (`screenOf` against the root's choice) in
 * the same phase and tour.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import {
  begin,
  openingOf,
  step,
  type Flow,
  type Input,
  type Opening,
} from '@manna/heartseed/first/flow';
import { tourStep, type Tour, type TourTap } from '@manna/heartseed/first/tour';
import type { Ending } from '@manna/heartseed/voice/reading';
import { Effect, Logger, Option } from 'effect';

import { readGarden } from '../garden/program';
import type { storageOf } from '../test/garden-model';
import { makePort } from '../test/garden-model';
import { seeded, type Random } from '../test/random';
import { firstSources, screenOf, type FirstScreen, type FirstShown } from './flow';
import { firstReference } from './verse';

const HOST = { turn: withDataHost, wait: () => Promise.resolve() };
const NOW = Date.UTC(2026, 10, 15, 13, 0, 0);
const RUNS = 60;
const STEPS = 24;
const REFERENCE = firstReference();
const GOOD = {
  startedAt: NOW,
  offset: 0,
  grade: 3,
  suggested: 3,
  words: 37,
  missed: 0,
  peeked: 0,
  extra: 0,
};
const NO_HELP = { peeked: [], shownAt: null, cap: 4 };

/** What the current root holds of a launch: the opening it decided, the flow and the tour. */
interface OneRoot {
  readonly decided: Opening;
  readonly flow: Flow;
  readonly tour: Tour;
}

/** What the current root shows (`app/index.tsx`, `Root`): the flow's phase while the first minute is decided, else home in the tour's state. */
const oneScreen = (root: OneRoot): FirstScreen => {
  if (root.decided === 'first') return root.flow.phase;
  if (root.tour === 'welcome') return 'replay-welcome';
  if (root.tour === 'grows') return 'replay-grows';
  if (root.tour === 'tips') return 'home-tips';
  return 'home';
};

/** An Exact utterance's end, and the ending One names for it. */
const ENDS: ReadonlyArray<readonly [string, string, string, Ending]> = [
  ['ended', 'end', '', 'finished'],
  ['ended', 'error', 'canceled', 'stopped'],
  ['ended', 'error', 'interrupted', 'interrupted'],
  ['ended', 'error', 'audio-busy', 'failed'],
];

/** One generated event: what the reader or a device does, said for the port and for One. */
type Event =
  | { readonly _tag: 'tap'; readonly tap: 'Begin' | 'Skip' | 'Plant' | 'Next' }
  | { readonly _tag: 'tour'; readonly tap: TourTap }
  | {
      readonly _tag: 'see';
      readonly utterance: readonly [string, string, string];
      readonly ended: Ending | null;
      readonly startedAt: number;
      readonly graded: boolean;
    }
  | { readonly _tag: 'plant' }
  | { readonly _tag: 'relaunch' };

/** The taps the screen `shown` offers, as the port's screens send them. */
const tapsOn = (shown: FirstScreen): readonly Event[] => {
  if (shown === 'welcome')
    return [
      { _tag: 'tap', tap: 'Begin' },
      { _tag: 'tap', tap: 'Skip' },
    ];
  if (shown === 'grows') return [{ _tag: 'tap', tap: 'Plant' }];
  if (shown === 'hear') return [{ _tag: 'tap', tap: 'Next' }];
  if (shown === 'planted') return [{ _tag: 'tour', tap: 'Continue' }];
  if (shown === 'replay-welcome')
    return [
      { _tag: 'tour', tap: 'Begin' },
      { _tag: 'tour', tap: 'Skip' },
    ];
  if (shown === 'replay-grows') return [{ _tag: 'tour', tap: 'See' }];
  if (shown === 'home-tips')
    return [
      { _tag: 'tour', tap: 'How' },
      { _tag: 'tour', tap: 'GotIt' },
      { _tag: 'tour', tap: 'Leave' },
    ];
  if (shown === 'home')
    return [
      { _tag: 'tour', tap: 'How' },
      { _tag: 'tour', tap: 'Leave' },
    ];
  return [];
};

/** A device's report: the voice's state, a recital's start and whether it is graded. */
const seeOf = (random: Random, since: number): Event => {
  const end = random.pick<readonly [string, string, string, Ending | null]>([
    ...ENDS,
    ['speaking', '', '', null],
    ['', '', '', null],
  ]);
  return {
    _tag: 'see',
    utterance: [end[0], end[1], end[2]],
    ended: end[3],
    startedAt: random.chance(0.3) ? since : NOW + random.below(1000) * 1000,
    graded: random.chance(0.6),
  };
};

const eventOf = (random: Random, shown: FirstScreen, since: number): Event => {
  const roll = random.below(100);
  if (roll < 4) return { _tag: 'relaunch' };
  if (roll < 10) return { _tag: 'plant' };
  if (roll < 45) return seeOf(random, since);
  const taps = tapsOn(shown);
  if (taps.length === 0) return seeOf(random, since);
  return random.pick(taps);
};

/** One's input for a device report: the voice's ending, the recital, the garden, in `observe`'s order. */
const oneInputs = (event: Event & { _tag: 'see' }, planted: boolean): readonly Input[] => [
  { _tag: 'Voice', ended: event.ended },
  { _tag: 'Recital', startedAt: event.graded ? event.startedAt : null, finished: event.graded },
  { _tag: 'Garden', planted },
];

const oneOpening = async (storage: ReturnType<typeof storageOf>['storage']) =>
  Effect.runPromise(
    Effect.map(readGarden(storage), (held) => openingOf(Option.some(held.garden))).pipe(
      Effect.provide(Logger.layer([])),
    ),
  );

/** One generated run: the port and One step by step, compared after each. */
const run = async (seed: number) => {
  const random = seeded(seed);
  const garden = makePort();
  let planted = false;
  let sources = firstSources(REFERENCE, { host: HOST, quiet: true });
  let opening = await oneOpening(garden.storage);
  let shown: FirstShown = sources.firstBoot();
  let one: OneRoot = { decided: opening, flow: begin(null), tour: 'off' };
  const seen: string[] = [];
  for (let at = 0; at < STEPS; at++) {
    const event = eventOf(random, oneScreen(one), one.flow.since ?? NOW);
    if (event._tag === 'relaunch') {
      sources = firstSources(REFERENCE, { host: HOST, quiet: true });
      opening = await oneOpening(garden.storage);
      shown = sources.firstBoot();
      one = { decided: opening, flow: begin(null), tour: 'off' };
    } else if (event._tag === 'plant') {
      if (!planted) await garden.call('gardenRecall', [REFERENCE, GOOD, NO_HELP, NOW, 0, 1]);
      planted = true;
    } else if (event._tag === 'tap') {
      shown = sources.firstTap([event.tap]);
      one = { ...one, flow: step(one.flow, { _tag: event.tap }) };
    } else if (event._tag === 'tour') {
      shown = sources.firstTour([event.tap]);
      const decided = event.tap === 'Continue' ? 'home' : one.decided;
      one = { ...one, decided, tour: tourStep(one.tour, event.tap) };
    } else {
      shown = await withDataHost(() =>
        sources.firstSee(
          [...event.utterance, event.startedAt, event.graded, NOW, 1],
          { forget: () => undefined },
          garden.storage,
        ),
      );
      one = { ...one, flow: oneInputs(event, planted).reduce(step, one.flow) };
    }
    seen.push(`${event._tag}:${oneScreen(one)}`);
    expect({ at, seen, screen: screenOf(shown, opening) }).toEqual({
      at,
      seen,
      screen: oneScreen(one),
    });
    expect([shown.phase, shown.tour]).toEqual([one.flow.phase, one.tour]);
  }
  return seen;
};

describe('the first minute and the tour on the port, beside the current root', () => {
  it('the first verse names a reference', () => {
    expect(REFERENCE.length).toBeGreaterThan(0);
  });

  it(`shows what the current root shows over ${RUNS} generated runs`, async () => {
    const reached = new Set<string>();
    for (let seed = 1; seed <= RUNS; seed++)
      for (const each of await run(seed)) reached.add(each.split(':')[1] ?? '');
    expect([...reached].toSorted()).toEqual(
      [
        'welcome',
        'grows',
        'hear',
        'letters',
        'alone',
        'planted',
        'home',
        'home-tips',
        'replay-welcome',
        'replay-grows',
      ].toSorted(),
    );
  });
});
