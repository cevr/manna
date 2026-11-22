/**
 * The first minute and the tour, as the port's data module holds them for
 * one launch: the current Heartseed's own reducers (`step` and `observe` of
 * `@manna/heartseed/first/flow`, `tourStep` of `@manna/heartseed/first/tour`),
 * fed what the port's screens see. Nothing is stored, so every launch of the
 * data module begins at the welcome with the tour off.
 *
 * - A tap (`Begin`, `Skip`, `Plant`, `Next`) is One's input as it is.
 * - What Today shows is One's `observe`'s input: the voice's last reading's
 *   ending (Exact's `end` is One's `finished`, a cancel `stopped`, an
 *   interruption `interrupted`, any other error `failed`), the recital's
 *   start once it is graded (a graded try is One's recital ended
 *   `finished`), and whether the garden read holds the first verse's plant.
 * - Planted's `Continue` leaves the flow (`continued`) and is the tour's
 *   `Continue`.
 * - Each phase of the verse is said under One's cue for it: hear the full
 *   text, letters the first letters, alone none; Planted asks for the full
 *   text, so Today starts a fresh recital there and keeps no try of alone.
 */

import type { FileStorage } from '@manna/exact-kit/storage';
import {
  begin,
  observe,
  step,
  type Flow,
  type Opening,
  type Phase,
} from '@manna/heartseed/first/flow';
import { tourStep, type Tour, type TourTap } from '@manna/heartseed/first/tour';
import type { Ending } from '@manna/heartseed/voice/reading';
import type { GardenView } from '@manna/heartseed/garden';
import { Effect, Logger, Option } from 'effect';
import { runCall, type Host } from '@manna/exact-kit/effect';

import { readGarden } from '../garden/program';

/** What the Contract reads: the flow's phase and the cue Today says it under, the tour, and whether the flow was left. */
export interface FirstShown {
  phase: Phase;
  cue: string;
  tour: Tour;
  continued: boolean;
}

/** The cue each phase is said under (Today's `/first/<phase>/<cue>`). */
export const CUES: Readonly<Record<Phase, string>> = {
  welcome: 'none',
  grows: 'none',
  hear: 'full',
  letters: 'initials',
  alone: 'none',
  planted: 'full',
};

/** A tap of the first minute's controls. */
export type FirstTap = 'Begin' | 'Skip' | 'Plant' | 'Next';

/** The voice's last ending as One names it, from Exact's utterance: none before one ended. */
export const endingOf = (state: string, outcome: string, error: string): Option.Option<Ending> => {
  if (state !== 'ended') return Option.none();
  if (outcome === 'end') return Option.some('finished');
  if (error === 'canceled') return Option.some('stopped');
  if (error === 'interrupted') return Option.some('interrupted');
  return Option.some('failed');
};

/** Whether `garden` holds the plant of `reference`. */
export const plantedIn = (garden: GardenView, reference: string): boolean =>
  garden._tag === 'Read' && garden.plants.has(reference);

/** What one launch holds: the flow and the tour, from One's beginnings. */
export interface FirstLaunch {
  readonly flow: Flow;
  readonly tour: Tour;
  readonly continued: boolean;
}

const ABSENT_START = Option.getOrNull(Option.none<number>());

/** A launch as it begins: the welcome, the tour off. */
export const firstBegun = (): FirstLaunch => ({
  flow: begin(ABSENT_START),
  tour: 'off',
  continued: false,
});

/** The launch after a tap of the first minute's controls. */
export const afterTap = (launch: FirstLaunch, tap: FirstTap): FirstLaunch => ({
  ...launch,
  flow: step(launch.flow, { _tag: tap }),
});

/** What the screen sees of Today and the garden, as `observe` takes it. */
export interface FirstSeen {
  readonly ended: Option.Option<Ending>;
  readonly startedAt: Option.Option<number>;
  readonly graded: boolean;
  readonly planted: boolean;
}

/** The launch after what the screen sees now. */
export const afterSeen = (launch: FirstLaunch, seen: FirstSeen): FirstLaunch => ({
  ...launch,
  flow: observe(launch.flow, {
    voiceEnded: Option.getOrNull(seen.ended),
    startedAt: Option.getOrNull(seen.startedAt),
    finished: seen.graded,
    planted: seen.planted,
  }),
});

/** The launch after a tour's tap; `Continue`, which only Planted shows, also leaves the flow, and does nothing anywhere else. */
export const afterTour = (launch: FirstLaunch, tap: TourTap): FirstLaunch => {
  if (tap === 'Continue' && (launch.continued || launch.flow.phase !== 'planted')) return launch;
  return {
    ...launch,
    tour: tourStep(launch.tour, tap),
    continued: launch.continued || tap === 'Continue',
  };
};

/** What the Contract reads of a launch. */
export const shownOf = (launch: FirstLaunch): FirstShown => ({
  phase: launch.flow.phase,
  cue: CUES[launch.flow.phase],
  tour: launch.tour,
  continued: launch.continued,
});

/** What a launch shows over home: a phase of the first minute, the replayed welcome or second screen, or home, with its tips or not. */
export type FirstScreen = Phase | 'replay-welcome' | 'replay-grows' | 'home' | 'home-tips';

/**
 * What the launch shows, as the current root decides it (`app/index.tsx`,
 * `Root`): the first minute's phase while the opening is `first` and its
 * Continue has not been tapped, else home in the tour's state. The Contract
 * composes the same rule as `firstWanted` (features/first.contract) for a
 * launch at the Garden tab's root, the one the current app has, its
 * `first` opening being `firstOpened` there; `flow.model.test.ts` holds
 * this rule to the current root.
 */
export const screenOf = (shown: FirstShown, opening: Opening): FirstScreen => {
  if (opening === 'first' && !shown.continued) return shown.phase;
  if (shown.tour === 'welcome') return 'replay-welcome';
  if (shown.tour === 'grows') return 'replay-grows';
  if (shown.tour === 'tips') return 'home-tips';
  return 'home';
};

const TAPS: ReadonlySet<string> = new Set<FirstTap>(['Begin', 'Skip', 'Plant', 'Next']);
const TOUR_TAPS: ReadonlySet<string> = new Set<TourTap>([
  'Continue',
  'How',
  'Begin',
  'Skip',
  'See',
  'GotIt',
  'Leave',
]);

const isTap = (tap: string): tap is FirstTap => TAPS.has(tap);
const isTourTap = (tap: string): tap is TourTap => TOUR_TAPS.has(tap);

/** Exact's `Store` argument, as much of it as names it: the flow keeps nothing there. */
interface ExactStore {
  readonly forget: (name: string) => void;
}

/** How the sources run: the runner's host, and whether logs are dropped. */
export interface FirstOptions {
  readonly host?: Host;
  readonly quiet?: boolean;
}

/** The first minute's sources over the first verse at `reference`, holding one launch's flow and tour. */
export const firstSources = (reference: string, options: FirstOptions = {}) => {
  let launch = firstBegun();
  const logged = <A>(program: Effect.Effect<A>) => {
    if (options.quiet === true) return Effect.provide(program, Logger.layer([]));
    return program;
  };
  const planted = (storage: FileStorage, [now, seed]: readonly [number, number]) =>
    runCall(
      logged(Effect.map(readGarden(storage), (held) => plantedIn(held.garden, reference))),
      { now, seed },
      options.host,
    );
  return {
    firstBoot: (): FirstShown => shownOf(launch),
    firstTap: ([tap]: readonly [string]): FirstShown => {
      if (isTap(tap)) launch = afterTap(launch, tap);
      return shownOf(launch);
    },
    firstTour: ([tap]: readonly [string]): FirstShown => {
      if (isTourTap(tap)) launch = afterTour(launch, tap);
      return shownOf(launch);
    },
    firstSee: (
      [state, outcome, error, startedAt, graded, now, seed]: readonly [
        string,
        string,
        string,
        number,
        boolean,
        number,
        number,
      ],
      _store: ExactStore,
      storage: FileStorage,
    ): Promise<FirstShown> =>
      planted(storage, [now, seed]).then((held) => {
        launch = afterSeen(launch, {
          ended: endingOf(state, outcome, error),
          startedAt: Option.filter(Option.some(startedAt), () => graded),
          graded,
          planted: held,
        });
        return shownOf(launch);
      }),
  };
};
