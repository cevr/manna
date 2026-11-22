/**
 * The current app's `localOver` (`apps/hymnal/src/player/offline.ts`), as
 * the port's source test runs it: only what the test passes and reads, in
 * `effect`'s types. The source imports `~/offline/cache` and
 * `~/follow/clock`, which only the current app's own type check resolves;
 * the test loads the source itself (`src/offline/local.test.ts`).
 */

import type { Effect, Option } from 'effect';

/** A saved recording's identity: the hymn and the key offset it sounds in. */
export type Choice = { readonly number: number; readonly offset: number };

/** What the device tells of a play. */
export type Told = { readonly state: string; readonly positionMs: number };

/** What a play asks, as far as `localOver` reads it. */
export type Asks = { readonly recording?: Choice; readonly intent?: 'play' | 'pause' };

/** The device's playback, as far as `localOver` calls it. */
export type LocalDevice = {
  readonly play: (uri: string, fromMs: number, options?: Asks) => Effect.Effect<Told, unknown>;
  readonly pause: Effect.Effect<Told, unknown>;
  readonly resume: Effect.Effect<Told, unknown>;
  readonly stop: Effect.Effect<void, unknown>;
};

export declare const localOver: (
  device: LocalDevice,
  cache: { readonly local: (id: Choice) => Effect.Effect<Option.Option<string>> },
) => LocalDevice;
