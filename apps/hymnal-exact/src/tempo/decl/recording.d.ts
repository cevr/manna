import type { Effect, Stream } from 'effect';

import type { PlaybackApi as Clocked, Told } from '../../player/clock/decl/sound';

/**
 * The current app's `recording.ts`, as the port's tests read it: its source
 * reaches the app's own `~/` aliases, which the port's typecheck does not
 * resolve, so `tsconfig.src.json` maps it here. Only what
 * `src/tempo/tempo.test.ts` hands it and reads back is declared, over the
 * score clock's device (`sound.d.ts`): a play's recording asked by its key,
 * and the selection a fall back leaves; the test runs the source.
 */
export type Status = Told & { readonly recording?: Selection; readonly replacementMs?: number };

/** The recording a play asked for, and the one that sounds. */
type Selection = { readonly number: number; readonly requested: number } & {
  readonly effective: number;
};

/** A play's options, the recording named by its hymn and key offset. */
type Asked = { readonly continuous: boolean; readonly ready: boolean } & {
  readonly recording?: { readonly number: number; readonly offset: number };
};

/** The device under the player, as far as the fall back asks it. */
export type PlaybackApi = Omit<Clocked, 'play' | 'status' | 'remote'> & {
  readonly play: (uri: string, fromMs: number, options?: Asked) => Effect.Effect<Status, unknown>;
  readonly status: Effect.Effect<Status, unknown>;
  readonly remote: Stream.Stream<never>;
};

export declare const recordingsOver: (device: PlaybackApi) => PlaybackApi;
