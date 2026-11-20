/**
 * The current app's player buttons, as the bar's model test reads them.
 * This file is `@manna/hymnal-app/player/button` as both type checks read
 * it (`tsconfig.json` and `tsconfig.src.json` map it here): Exact's stages
 * a package's declarations, never its source, and the source's imports
 * reach the current app's `~/` paths, which the port's typecheck cannot
 * resolve. A button is named by its kind and label, its command by its
 * tag alone. `bar.model.test.ts` runs the source itself against it.
 */

import type { Opt, Player, Track } from '@manna/hymnal-app/player/player';

export type Kind = 'play' | 'pause' | 'again' | 'retry' | 'loading';

export interface Button {
  readonly kind: Kind;
  readonly label: string;
  readonly command: Opt<{ readonly _tag: string }>;
}

/** `track`'s buttons in the order drawn, as the player's `state` stands. */
export declare const buttonsOf: (state: Player, track: Track) => ReadonlyArray<Button>;
