/**
 * The first minute's flow as a pure reducer: the welcome, then how a verse
 * grows, then hear, letters, alone and Planted. Its state is the screen's
 * for the launch; nothing of it is stored, so a relaunch starts again at
 * the welcome.
 *
 * - The welcome goes on to how a verse grows at `Begin`, or straight to
 *   hear at `Skip`; how a verse grows goes on to hear at `Plant`. No other
 *   input moves either, and these three move no other phase.
 * - Hear goes on to letters at `Next`, or by itself once the voice's
 *   reading ends `finished`; any other ending stays.
 * - Letters goes on to alone once a recital of its own ends finished, with
 *   any number of words missed. A recital is the phase's own when Say it
 *   shows one that started after the phase began: `since` is Say it's
 *   `startedAt` when the phase began, and the phase's recitals are those
 *   with another.
 * - Alone goes on to Planted once the garden's read holds the passage's
 *   plant (the alone recital is the only one that is kept), never at the
 *   recital's end, so a refused write plants nothing.
 * - Planted stays: Continue leaves the flow.
 */

import { Match, Option } from 'effect';

import type { GardenView } from '../garden';
import type { OrNull } from '../sayit';
import type { Ending } from '../voice/reading';

const ABSENT: OrNull<never> = Option.getOrNull(Option.none());

/** The screen a launch opens on: none while the garden's read runs, the first minute when the read holds no recall of any verse, home when it holds one, and Today in an unread garden, which cannot know there is no seed and shows no field. */
export type Opening = 'pending' | 'first' | 'home' | 'today';

/** The screen a launch on `garden` opens on: home for a read garden with a plant. */
export const openingOf = (garden: Option.Option<GardenView>): Opening =>
  Option.match(garden, {
    onNone: (): Opening => 'pending',
    onSome: (view): Opening => {
      if (view._tag !== 'Read') return 'today';
      if (view.plants.size === 0) return 'first';
      return 'home';
    },
  });

/** The screen the root shows: the one decided at the launch's read, or, until then, what the read says now. */
export const shownOpening = (decided: Opening, read: Opening): Opening => {
  if (decided !== 'pending') return decided;
  return read;
};

export type Phase = 'welcome' | 'grows' | 'hear' | 'letters' | 'alone' | 'planted';

export interface Flow {
  readonly phase: Phase;
  /** Say it's `startedAt` when the phase began. */
  readonly since: OrNull<number>;
}

/** What the screen sees: a press of Begin, Skip, Plant your first verse or Next, how the voice's last reading ended, Say it's latest recital, and whether the garden's read holds the passage's plant. */
export type Input =
  | { readonly _tag: 'Begin' }
  | { readonly _tag: 'Skip' }
  | { readonly _tag: 'Plant' }
  | { readonly _tag: 'Next' }
  | { readonly _tag: 'Voice'; readonly ended: OrNull<Ending> }
  | {
      readonly _tag: 'Recital';
      readonly startedAt: OrNull<number>;
      /** The recital is over and ended `finished`. */
      readonly finished: boolean;
    }
  | { readonly _tag: 'Garden'; readonly planted: boolean };

/** The flow as it begins, with Say it's `startedAt` at that moment. */
export const begin = (startedAt: OrNull<number>): Flow => ({ phase: 'welcome', since: startedAt });

/** Whether a recital Say it shows is the phase's own: one started after the phase began. */
export const isOwn = (flow: Flow, startedAt: OrNull<number>): boolean =>
  startedAt !== ABSENT && startedAt !== flow.since;

const enter = (phase: Phase, since: OrNull<number>): Flow => ({ phase, since });

/** The flow after one input: each phase moves on only at its own input, and no phase moves back. */
export const step = (flow: Flow, input: Input): Flow =>
  Match.type<Input>().pipe(
    Match.tagsExhaustive({
      Begin: () => {
        if (flow.phase !== 'welcome') return flow;
        return enter('grows', flow.since);
      },
      Skip: () => {
        if (flow.phase !== 'welcome') return flow;
        return enter('hear', flow.since);
      },
      Plant: () => {
        if (flow.phase !== 'grows') return flow;
        return enter('hear', flow.since);
      },
      Next: () => {
        if (flow.phase !== 'hear') return flow;
        return enter('letters', flow.since);
      },
      Voice: ({ ended }) => {
        if (flow.phase !== 'hear' || ended !== 'finished') return flow;
        return enter('letters', flow.since);
      },
      Recital: ({ startedAt, finished }) => {
        if (flow.phase !== 'letters' || !finished || !isOwn(flow, startedAt)) return flow;
        return enter('alone', startedAt);
      },
      Garden: ({ planted }) => {
        if (flow.phase !== 'alone' || !planted) return flow;
        return enter('planted', flow.since);
      },
    }),
  )(input);

/** The flow after what the screen sees now: the voice's ending, Say it's recital and the garden, in that order. */
export const observe = (
  flow: Flow,
  seen: {
    readonly voiceEnded: OrNull<Ending>;
    readonly startedAt: OrNull<number>;
    readonly finished: boolean;
    readonly planted: boolean;
  },
): Flow =>
  [
    { _tag: 'Voice', ended: seen.voiceEnded } as const,
    { _tag: 'Recital', startedAt: seen.startedAt, finished: seen.finished } as const,
    { _tag: 'Garden', planted: seen.planted } as const,
  ].reduce<Flow>(step, flow);
