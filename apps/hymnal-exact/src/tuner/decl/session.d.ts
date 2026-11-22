/**
 * `@manna/hymnal-app/tuner/session` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here; the workspace's typecheck reads the
 * source): the tuner's session machine, its events, phases and work as the
 * tagged values they are at run time, each `Option` named by its shapes, and
 * the words and measures the screen draws. `src/tuner/held.test.ts` holds it
 * to the source.
 */

import type { Opt } from '@manna/hymnal-app/hymns/chords';
import type { Reading, StringId } from '@manna/hymnal-app/tuner/tuning';

/** What the device says of the microphone. */
export type Permission = 'granted' | 'denied' | 'undetermined';

/** Why listening ended, as the ear says it. */
export type ListenEnd = 'stopped' | 'interruption' | 'route' | 'failure';

/** Why listening stopped: the ear's ends, and the session's own. */
export type StopReason =
  | Exclude<ListenEnd, 'stopped'>
  | 'player'
  | 'away'
  | 'covered'
  | 'closed'
  | 'late';

export type Phase =
  | { readonly _tag: 'Checking' }
  | { readonly _tag: 'Asking' }
  | { readonly _tag: 'Denied' }
  | { readonly _tag: 'Pausing' }
  | { readonly _tag: 'Starting' }
  | { readonly _tag: 'Listening' }
  | { readonly _tag: 'Away' }
  | { readonly _tag: 'Ended'; readonly reason: StopReason }
  | { readonly _tag: 'Closed' };

export type Event =
  | { readonly _tag: 'Read'; readonly permission: Permission; readonly check: number }
  | { readonly _tag: 'Answered'; readonly permission: Permission }
  | { readonly _tag: 'Active'; readonly active: boolean }
  | { readonly _tag: 'Covered'; readonly covered: boolean }
  | { readonly _tag: 'Sounding'; readonly sounding: boolean }
  | { readonly _tag: 'Started'; readonly attempt: number }
  | { readonly _tag: 'Refused'; readonly attempt: number }
  | { readonly _tag: 'Ended'; readonly reason: ListenEnd }
  | { readonly _tag: 'Tapped' }
  | { readonly _tag: 'Closed' };

/** The events' constructors. */
export declare const Event: {
  readonly Read: (at: { readonly permission: Permission; readonly check: number }) => Event;
  readonly Answered: (at: { readonly permission: Permission }) => Event;
  readonly Active: (at: { readonly active: boolean }) => Event;
  readonly Covered: (at: { readonly covered: boolean }) => Event;
  readonly Sounding: (at: { readonly sounding: boolean }) => Event;
  readonly Started: (at: { readonly attempt: number }) => Event;
  readonly Refused: (at: { readonly attempt: number }) => Event;
  readonly Ended: (at: { readonly reason: ListenEnd }) => Event;
  readonly Tapped: () => Event;
  readonly Closed: () => Event;
};

export type Work =
  | { readonly _tag: 'ReadPermission'; readonly check: number }
  | { readonly _tag: 'AskPermission' }
  | { readonly _tag: 'PausePlayer' }
  | { readonly _tag: 'Start'; readonly attempt: number }
  | { readonly _tag: 'Stop'; readonly reason: StopReason };

/** The session: its phase, the world as last told, whether asked, and its counters. */
export type Session = Readonly<{
  phase: Phase;
  active: boolean;
  covered: boolean;
  sounding: boolean;
  asked: boolean;
  attempt: number;
  check: number;
}>;

/** A step: the session after it and the work it asks, in order. */
export type Step = Readonly<{ session: Session; work: ReadonlyArray<Work> }>;

export declare const voiced: (session: Session) => boolean;
export declare const holdsMicrophone: (phase: Phase) => boolean;
export declare const opened: (active: boolean, sounding: boolean) => Step;
export declare const step: (session: Session, event: Event) => Step;

export declare const STRING_NAMES: Readonly<Record<StringId, string>>;
export declare const LEFT: ReadonlyArray<StringId>;
export declare const RIGHT: ReadonlyArray<StringId>;
export declare const NEEDLE_CENTS: number;
export declare const needleOf: (heard: Opt<Reading>) => number;
export declare const labelOf: (heard: Opt<Reading>) => string;
export declare const hintOf: (target: Opt<StringId>, heard: Opt<Reading>) => string;
export declare const NOT_LISTENING: string;
export declare const nameOf: (
  tag: Phase['_tag'],
  target: Opt<StringId>,
  heard: Opt<Pick<Reading, 'string'>>,
) => Opt<string>;
export declare const wordsOf: (phase: Phase['_tag'], heard: Opt<Reading>) => Opt<string>;

export declare const TUNED_FRAMES: number;

/** The strings held in tune long enough, and the run toward the next. */
export type Latch = Readonly<{
  run: Opt<Readonly<{ string: StringId; frames: number }>>;
  tuned: ReadonlySet<StringId>;
}>;

export declare const unlatched: Latch;
export declare const latch: (before: Latch, heard: Opt<Reading>) => Latch;
export declare const stringLabel: (string: StringId, tuned: boolean) => string;

export declare const FEED_RATE: number;
export declare const FRAME: number;

/** A fed tone: its string and how far off. */
export type Feed = Readonly<{ string: StringId; cents: number }>;

export declare const feedOf: (param: string) => Opt<Feed>;
export declare const feedFrame: (feed: Feed, index: number, into: Float32Array) => Float32Array;
