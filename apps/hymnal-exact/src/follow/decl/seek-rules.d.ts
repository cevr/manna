/**
 * The current hymnal's held seek rules (`src/reader/seek-rules.ts`) as
 * Exact's type check reads them (the app's `tsconfig.json` maps
 * `@manna/hymnal-app/reader/seek-rules` here): the source answers
 * `effect`'s `Option` and tagged enums, named here by the shapes they take
 * at run time, each a tag and its fields. It names only what the port
 * reads, in its own terms. `src/follow/seek.test.ts` runs the source itself
 * and holds the port to it.
 */

import type { Timeline } from '@manna/hymnal-app/player/stanzas';

/** A tagged shape: its `_tag` and its fields, all read only. */
type Tagged<T extends string, F = {}> = Readonly<F> & { readonly _tag: T };
type Maybe<A> = Tagged<'None'> | Tagged<'Some', { value: A }>;
/** A pointer's place on the page, in points. */
type Place = { x: number; y: number };

export type SeekTarget =
  | Tagged<'Line', { line: number; ms: number }>
  | Tagged<'Word', { line: number; word: number; ms: number }>;

export type SeekTargets = Readonly<{
  number: number;
  choice: ReadonlyArray<number>;
  lines: ReadonlyArray<Tagged<string, { line: number }>>;
}>;

export type Anchor = Readonly<{ row: number; column: number }>;
export type Choice = Readonly<{ line: number; word: Maybe<number> }>;

type Hymn = Readonly<{
  number: number;
  sections: ReadonlyArray<Readonly<{ kind: string; lines: ReadonlyArray<string> }>>;
}>;

/** A hymn's seek targets under a choice (`seek-targets.ts`, re-exported); none when its words and timing disagree. */
export declare const targetsOf: (
  hymn: Hymn,
  timeline: Timeline,
  choice: ReadonlyArray<number>,
) => Maybe<SeekTargets>;

/** Where a hold anchors at sung ms `sungMs`: the eligible line and word sounding then. */
export declare const initialTarget: (all: SeekTargets, sungMs: number) => Maybe<SeekTarget>;

/** Line `line`'s target, at `word` when it is some and the line is timed by word. */
export declare const targetAt: (
  all: SeekTargets,
  line: number,
  word: Maybe<number>,
) => Maybe<SeekTarget>;

/** A pointer's change on the words, as the current hymnal's web adapter reads it. */
export type PointerInput =
  | Tagged<'Down', Place & { id: number; primary: boolean; button: number; startable: boolean }>
  | Tagged<'Move', Place & { id: number }>
  | Tagged<'Up', { id: number; button: number }>
  | Tagged<'Lost', { id: number }>
  | Tagged<'Escape'>
  | Tagged<'Deadline', { id: number; acquired: boolean }>;

/** Which pointer holds the words: where it landed, and (a candidate's) where it is now. */
export type Contact =
  | Tagged<'Idle'>
  | Tagged<'Candidate', Place & { id: number; nx: number; ny: number }>
  | Tagged<'Held', Place & { id: number }>;

/** What the words do after a pointer's change. */
export type PointerEffect =
  | Tagged<'None' | 'Arm' | 'Disarm'>
  | Tagged<'Capture' | 'Release' | 'Cancel', { id: number }>
  | Tagged<'Drag', { dx: number; dy: number }>;

export declare const contactAfter: (
  now: Contact,
  change: PointerInput,
) => readonly [Contact, PointerEffect];

export declare const HOLD_MS: number;
export declare const SLOP: number;
export declare const LINE_STEP: number;
export declare const WORD_STEP: number;
export declare const BACK_STRIP: number;

export declare const anchorOf: (all: SeekTargets, at: SeekTarget) => Maybe<Anchor>;
export declare const choiceAt: (
  all: SeekTargets,
  from: Anchor,
  dx: number,
  dy: number,
) => Maybe<Choice>;
export declare const isChoice: (at: SeekTarget, chosen: Choice) => boolean;

/** A choice as it is said: its eligible row of all, its sung line, and its word's place among the line's. */
export type Described = Readonly<{
  row: number;
  rows: number;
  line: number;
  word: Maybe<Readonly<{ ordinal: number; of: number; shared: ReadonlyArray<number> }>>;
}>;

export declare const describe: (all: SeekTargets, at: SeekTarget) => Maybe<Described>;
export declare const spoken: (said: Described) => string;
export declare const numbersOf: (said: Described, ms: number) => string;
