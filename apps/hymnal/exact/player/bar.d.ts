/**
 * `src/player/bar.ts`'s choice of hymn, as the port's tests read it (see
 * `player.d.ts` for why each `Option` is named by its shapes): which hymn
 * the docked bar acts on, for the player's state and the hymn page shown.
 */

import type { Opt, Player, Track } from './player';

export type Bar =
  | { readonly _tag: 'Hidden' }
  | {
      readonly _tag: 'Shown';
      readonly track: Track;
      readonly state: Player;
      readonly page: Opt<Track>;
    };

/** The player as `track` sees it: its own state, or idle when it holds another hymn. */
export declare const playerFor: (state: Player, track: Track) => Player;

/** Whether the player is making, or about to make, sound. */
export declare const sounding: (state: Player) => boolean;

/** The bar for `state`, over the hymn page shown, if any. */
export declare const barFor: (state: Player, page: Opt<Track>) => Bar;

/** The bar docked under the stack: `barFor`'s while the player holds a hymn, else hidden. */
export declare const dockedBar: (state: Player, page: Opt<Track>) => Bar;
