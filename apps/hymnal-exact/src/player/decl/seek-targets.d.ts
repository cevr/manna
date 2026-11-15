/**
 * Where a hymn's sung lines start under a stanza choice, as the player
 * seeks to them. This file is `@manna/hymnal-app/follow/seek-targets` as
 * Exact's type check reads it (the app's `tsconfig.json` maps it here):
 * that check stages a package's declarations, never its source, and the
 * source answers `effect`'s `Option`, named here by the two shapes it takes
 * at run time. It names only what the player reads, in its own terms. The
 * repo's typecheck reads the source itself, so a call here that the source
 * renames or retypes fails it.
 */

import type { Timeline } from '@manna/hymnal-app/player/stanzas';

type Maybe<A> = { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: A };

/** A sung line's place: its index among the hymn's sung lines, and where it starts in the cut, in ms. */
interface LinePlace {
  readonly line: number;
  readonly start: number;
}

/** The lines a choice sings, each with its place in the cut. */
interface Targets {
  readonly lines: ReadonlyArray<LinePlace>;
}

/** A hymn's lines as a choice cuts them; none when its words and timing disagree. */
export declare const targetsOf: (
  hymn: {
    readonly number: number;
    readonly sections: ReadonlyArray<{
      readonly kind: string;
      readonly lines: ReadonlyArray<string>;
    }>;
  },
  timeline: Timeline,
  choice: ReadonlyArray<number>,
) => Maybe<Targets>;

/** Line `line`'s place in `targets`, when `word` is none; none for a line the choice does not sing. */
export declare const targetAt: (
  targets: Targets,
  line: number,
  word: Maybe<number>,
) => Maybe<{ readonly ms: number }>;
