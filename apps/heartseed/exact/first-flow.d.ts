import type { Option } from 'effect';

import type { GardenView } from './garden.d.ts';
import type { OrNull } from './matcher.d.ts';
import type { Ending } from './reading.d.ts';

/** The screen a launch opens on: none while the garden's read runs, the first minute when the read holds no plant, home when it holds one, and Today in an unread garden. */
export type Opening = 'pending' | 'first' | 'home' | 'today';

/** The screen a launch on `garden` opens on. */
export declare const openingOf: (garden: Option.Option<GardenView>) => Opening;

/** The screen the root shows: the one decided at the launch's read, or, until then, what the read says now. */
export declare const shownOpening: (decided: Opening, read: Opening) => Opening;

/** The first minute's phases, in order. */
export type Phase = 'welcome' | 'grows' | 'hear' | 'letters' | 'alone' | 'planted';

/** The first minute's state: its phase, and Say it's `startedAt` when the phase began. */
export interface Flow {
  readonly phase: Phase;
  readonly since: OrNull<number>;
}

/** What the first minute's screen sees; see `src/first/flow.ts`. */
export type Input =
  | { readonly _tag: 'Begin' }
  | { readonly _tag: 'Skip' }
  | { readonly _tag: 'Plant' }
  | { readonly _tag: 'Next' }
  | { readonly _tag: 'Voice'; readonly ended: OrNull<Ending> }
  | {
      readonly _tag: 'Recital';
      readonly startedAt: OrNull<number>;
      readonly finished: boolean;
    }
  | { readonly _tag: 'Garden'; readonly planted: boolean };

/** The flow as it begins. */
export declare const begin: (startedAt: OrNull<number>) => Flow;

/** Whether a recital Say it shows is the phase's own. */
export declare const isOwn: (flow: Flow, startedAt: OrNull<number>) => boolean;

/** The flow after one input. */
export declare const step: (flow: Flow, input: Input) => Flow;

/** The flow after what the screen sees now. */
export declare const observe: (
  flow: Flow,
  seen: {
    readonly voiceEnded: OrNull<Ending>;
    readonly startedAt: OrNull<number>;
    readonly finished: boolean;
    readonly planted: boolean;
  },
) => Flow;
