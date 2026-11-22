/**
 * The current app's score clock (`apps/hymnal/src/player/sound.ts`), as the
 * port's clock model test runs it: only what the test calls is declared,
 * the device the clock runs over and the playback it answers, in `effect`'s
 * types. The test loads the source itself, after the stand-ins of
 * `../../current.testing.ts`.
 */

import type { Effect, Option, Scope, Stream, SubscriptionRef } from 'effect';
import type { Timeline } from '@manna/hymnal-app/player/stanzas';

/** What the device, or the score clock over it, says it is doing, in ms. */
export interface Status {
  readonly state: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'failed';
  readonly positionMs: number;
  readonly durationMs?: number;
}

/** The device's one playback session: the calls the score clock asks of it and answers itself. */
export interface PlaybackApi {
  readonly play: (uri: string, fromMs: number) => Effect.Effect<Status, unknown>;
  readonly pause: Effect.Effect<Status, unknown>;
  readonly resume: Effect.Effect<Status, unknown>;
  readonly seek: (positionMs: number) => Effect.Effect<Status, unknown>;
  readonly status: Effect.Effect<Status, unknown>;
  readonly stop: Effect.Effect<void, unknown>;
  readonly connection: Stream.Stream<boolean>;
  readonly announce: (announcement: {
    readonly title: string;
    readonly artist: string;
  }) => Effect.Effect<void, unknown>;
  readonly remote: Stream.Stream<never>;
}

/** The score clock over `device`: each change of `sound` hands the place over, for as long as the scope lasts. */
export const scoreClock: (
  device: PlaybackApi,
  timelineFor: (hymn: number) => Option.Option<Timeline>,
  sound: SubscriptionRef.SubscriptionRef<boolean>,
) => Effect.Effect<PlaybackApi, never, Scope.Scope>;
