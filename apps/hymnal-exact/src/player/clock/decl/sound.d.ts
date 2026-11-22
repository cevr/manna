/**
 * The current app's score clock (`apps/hymnal/src/player/sound.ts`), as the
 * port's clock model test runs it: only what the test calls is declared,
 * the device the clock runs over and the playback it answers, in `effect`'s
 * types, each call's failure left open. The test loads the source itself,
 * after the stand-ins of `../../current.testing.ts`.
 */

import type { Effect, Option, Scope, Stream, SubscriptionRef } from 'effect';
import type { Timeline } from '@manna/hymnal-app/player/stanzas';

/** What the device, or the score clock over it, tells of its state and place, in ms. */
export type Told = {
  readonly state: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'failed';
  readonly positionMs: number;
  readonly durationMs?: number;
};

/** One of the session's calls: its answer, its failure the device's own. */
type Call<A> = Effect.Effect<A, unknown>;

/** The device's one playback session: the calls the score clock asks of it, and answers itself. */
export type PlaybackApi = {
  readonly status: Call<Told>;
  readonly play: (uri: string, fromMs: number) => Call<Told>;
  readonly seek: (positionMs: number) => Call<Told>;
  readonly pause: Call<Told>;
  readonly resume: Call<Told>;
  readonly stop: Call<void>;
  readonly remote: Stream.Stream<never>;
  readonly connection: Stream.Stream<boolean>;
  readonly announce: (shown: { readonly title: string; readonly artist: string }) => Call<void>;
};

/** The score clock over `device`: each change of `sound` hands the place over, for as long as the scope lasts. */
export const scoreClock: (
  device: PlaybackApi,
  timelineFor: (hymn: number) => Option.Option<Timeline>,
  sound: SubscriptionRef.SubscriptionRef<boolean>,
) => Effect.Effect<PlaybackApi, never, Scope.Scope>;
