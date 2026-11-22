/**
 * The current hymnal's held seek rules (`src/reader/seek-rules.ts`) as
 * Exact's type check reads them (the app's `tsconfig.json` maps
 * `@manna/hymnal-app/reader/seek-rules` here): the source answers
 * `effect`'s `Option` and tagged enums, named here by the shapes they take
 * at run time. It names only what the port reads.
 * `src/follow/seek.test.ts` holds it to the source.
 */

type Maybe<A> = { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: A };

export type SeekTarget =
  | { readonly _tag: 'Line'; readonly line: number; readonly ms: number }
  | { readonly _tag: 'Word'; readonly line: number; readonly word: number; readonly ms: number };

export interface SeekTargets {
  readonly number: number;
  readonly choice: ReadonlyArray<number>;
  readonly lines: ReadonlyArray<{ readonly _tag: string; readonly line: number }>;
}

export interface Anchor {
  readonly row: number;
  readonly column: number;
}

export interface Choice {
  readonly line: number;
  readonly word: Maybe<number>;
}

/** A hymn's seek targets under a choice (`seek-targets.ts`, re-exported); none when its words and timing disagree. */
export declare const targetsOf: (
  hymn: {
    readonly number: number;
    readonly sections: ReadonlyArray<{
      readonly kind: string;
      readonly lines: ReadonlyArray<string>;
    }>;
  },
  timeline: import('@manna/hymnal-app/player/stanzas').Timeline,
  choice: ReadonlyArray<number>,
) => Maybe<SeekTargets>;

/** Where a hold anchors at sung ms `sungMs`: the eligible line and word sounding then. */
export declare const initialTarget: (targets: SeekTargets, sungMs: number) => Maybe<SeekTarget>;

/** Line `line`'s target, at `word` when it is some and the line is timed by word. */
export declare const targetAt: (
  targets: SeekTargets,
  line: number,
  word: Maybe<number>,
) => Maybe<SeekTarget>;

/** A pointer's change on the words, as the current hymnal's web adapter reads it. */
export type PointerInput =
  | {
      readonly _tag: 'Down';
      readonly id: number;
      readonly primary: boolean;
      readonly button: number;
      readonly x: number;
      readonly y: number;
      readonly startable: boolean;
    }
  | { readonly _tag: 'Move'; readonly id: number; readonly x: number; readonly y: number }
  | { readonly _tag: 'Up'; readonly id: number; readonly button: number }
  | { readonly _tag: 'Lost'; readonly id: number }
  | { readonly _tag: 'Escape' }
  | { readonly _tag: 'Deadline'; readonly id: number; readonly acquired: boolean };

/** Which pointer holds the words. */
export type Contact =
  | { readonly _tag: 'Idle' }
  | {
      readonly _tag: 'Candidate';
      readonly id: number;
      readonly x: number;
      readonly y: number;
      readonly nx: number;
      readonly ny: number;
    }
  | { readonly _tag: 'Held'; readonly id: number; readonly x: number; readonly y: number };

/** What the words do after a pointer's change. */
export type PointerEffect =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Arm' }
  | { readonly _tag: 'Disarm' }
  | { readonly _tag: 'Capture'; readonly id: number }
  | { readonly _tag: 'Drag'; readonly dx: number; readonly dy: number }
  | { readonly _tag: 'Release'; readonly id: number }
  | { readonly _tag: 'Cancel'; readonly id: number };

export declare const contactAfter: (
  contact: Contact,
  input: PointerInput,
) => readonly [Contact, PointerEffect];

export declare const HOLD_MS: number;
export declare const SLOP: number;
export declare const LINE_STEP: number;
export declare const WORD_STEP: number;
export declare const BACK_STRIP: number;

export declare const anchorOf: (targets: SeekTargets, target: SeekTarget) => Maybe<Anchor>;
export declare const choiceAt: (
  targets: SeekTargets,
  anchor: Anchor,
  dx: number,
  dy: number,
) => Maybe<Choice>;
export declare const isChoice: (target: SeekTarget, choice: Choice) => boolean;

export interface Described {
  readonly row: number;
  readonly rows: number;
  readonly line: number;
  readonly word: Maybe<{
    readonly ordinal: number;
    readonly of: number;
    readonly shared: ReadonlyArray<number>;
  }>;
}

export declare const describe: (targets: SeekTargets, target: SeekTarget) => Maybe<Described>;
export declare const spoken: (described: Described) => string;
export declare const numbersOf: (said: Described, ms: number) => string;
