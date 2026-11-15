/**
 * `src/player/player.ts`'s states, as the port's tests read them: Exact's
 * type check stages declarations, never source, and `effect`'s cannot be
 * staged here, so each `Option` is named by the two shapes it takes at run
 * time. Only the pure parts are declared: the states, their constructors
 * and the held hymn of a state. The port's `rules.test.ts` runs the source
 * itself against them.
 */

export type Opt<A> = { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: A };

/** A hymn the player plays: its number names its recording. */
export interface Track {
  readonly number: number;
  readonly title: string;
}

export type Player =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Loading'; readonly track: Track }
  | {
      readonly _tag: 'Playing';
      readonly track: Track;
      readonly at: number;
      readonly length: Opt<number>;
    }
  | {
      readonly _tag: 'Paused';
      readonly track: Track;
      readonly at: number;
      readonly length: Opt<number>;
    }
  | {
      readonly _tag: 'Buffering';
      readonly track: Track;
      readonly at: number;
      readonly length: Opt<number>;
      readonly retry: boolean;
    }
  | { readonly _tag: 'Ended'; readonly track: Track; readonly length: Opt<number> }
  | { readonly _tag: 'Stopped'; readonly track: Track; readonly at: Opt<number> }
  | {
      readonly _tag: 'Failed';
      readonly track: Track;
      readonly offline: boolean;
      readonly at: Opt<number>;
    };

type Fields<T extends Player['_tag']> = Omit<Extract<Player, { readonly _tag: T }>, '_tag'>;

/** Each state's constructor. */
export declare const Player: {
  readonly Idle: () => Player;
  readonly Loading: (fields: Fields<'Loading'>) => Player;
  readonly Playing: (fields: Fields<'Playing'>) => Player;
  readonly Buffering: (fields: Fields<'Buffering'>) => Player;
  readonly Paused: (fields: Fields<'Paused'>) => Player;
  readonly Ended: (fields: Fields<'Ended'>) => Player;
  readonly Stopped: (fields: Fields<'Stopped'>) => Player;
  readonly Failed: (fields: Fields<'Failed'>) => Player;
};

/** The hymn `player` holds, if any. */
export declare const trackOf: (player: Player) => Opt<Track>;
