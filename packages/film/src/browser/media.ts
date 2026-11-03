import { type Cause, Context, Data, Effect, Layer, Option, Predicate, Ref } from 'effect';

export class PlayRefused extends Data.TaggedError('PlayRefused')<{ readonly name: string }> {}

type MediaEvent = 'canplay' | 'measured' | 'stalled' | 'ended' | 'error';

export interface Playable {
  readonly time: () => number;
  readonly duration: () => number;
  readonly ready: () => boolean;
  readonly playing: () => boolean;
  readonly seeking: () => boolean;
  readonly ended: () => boolean;
  readonly seek: (t: number) => Effect.Effect<void>;
  readonly play: Effect.Effect<void, PlayRefused>;
  readonly pause: Effect.Effect<void>;
  readonly mute: (muted: boolean) => void;
  readonly rate: (rate: number) => void;
  readonly reload: () => void;
  readonly on: (event: MediaEvent, listener: () => void, signal: AbortSignal) => void;
}

const FUTURE_DATA = 3;

const EVENTS: Record<MediaEvent, string> = {
  canplay: 'canplay',
  measured: 'loadedmetadata',
  stalled: 'waiting',
  ended: 'ended',
  error: 'error',
};

const nameOf = (error: Cause.UnknownError): string =>
  Option.match(
    Option.liftPredicate(error.cause, (c) => c instanceof DOMException),
    {
      onNone: () => '',
      onSome: (e) => e.name,
    },
  );

export type MediaElement = Pick<
  HTMLMediaElement,
  | 'currentTime'
  | 'duration'
  | 'readyState'
  | 'paused'
  | 'seeking'
  | 'ended'
  | 'muted'
  | 'playbackRate'
  | 'play'
  | 'pause'
  | 'addEventListener'
  | 'load'
>;

export const playableOf = (el: MediaElement): Playable => {
  let seeking = new AbortController();
  return {
    time: () => el.currentTime,
    duration: () => el.duration,
    ready: () => el.readyState >= FUTURE_DATA,
    playing: () => !el.paused,
    seeking: () => el.seeking,
    ended: () => el.ended,
    seek: (t) =>
      Effect.callback<void>((resume) => {
        seeking.abort();
        const mine = new AbortController();
        seeking = mine;
        mine.signal.addEventListener('abort', () => resume(Effect.void));
        el.currentTime = t;
        if (el.readyState === 0) mine.abort();
        else el.addEventListener('seeked', () => mine.abort(), { signal: mine.signal });
        return Effect.sync(() => mine.abort());
      }),
    play: Effect.mapError(
      Effect.tryPromise(() => el.play()),
      (error) => new PlayRefused({ name: nameOf(error) }),
    ),
    pause: Effect.sync(() => el.pause()),
    mute: (muted) => {
      el.muted = muted;
    },
    rate: (rate) => {
      el.playbackRate = rate;
    },
    reload: () => el.load(),
    on: (event, listener, signal) => el.addEventListener(EVENTS[event], listener, { signal }),
  };
};

export type Played = Data.TaggedEnum<{
  Playing: {};
  Muted: {};
  Blocked: {};
  Aborted: {};
  Failed: { readonly name: string };
}>;
export const Played = Data.taggedEnum<Played>();

const refusal = (refused: PlayRefused): Played => {
  if (refused.name === 'NotAllowedError') return Played.Blocked();
  if (refused.name === 'AbortError') return Played.Aborted();
  return Played.Failed({ name: refused.name });
};

const play = (media: Playable): Effect.Effect<Played> =>
  media.play.pipe(
    Effect.as(Played.Playing()),
    Effect.catchTag('PlayRefused', (refused) => Effect.succeed(refusal(refused))),
  );

interface MediaOps {
  readonly audio: (src: string) => Playable;
  readonly play: (media: Playable) => Effect.Effect<Played>;
  readonly playOrMute: (media: Playable) => Effect.Effect<Played>;
  readonly hear: (media: Playable, hushed: Effect.Effect<void>) => Effect.Effect<Played>;
  readonly hush: Effect.Effect<void>;
}

interface Heard {
  readonly media: Playable;
  readonly hushed: Effect.Effect<void>;
}

const plays: (played: Played) => boolean = Predicate.or(
  Predicate.isTagged('Playing'),
  Predicate.isTagged('Muted'),
);

const hearing = Effect.map(Ref.make(Option.none<Heard>()), (slot) => {
  const silence = (heard: Heard) => Effect.andThen(heard.media.pause, heard.hushed);
  const hear = (media: Playable, hushed: Effect.Effect<void>) =>
    Effect.gen(function* () {
      const mine: Heard = { media, hushed };
      const before = yield* Ref.getAndSet(slot, Option.some(mine));
      yield* Option.match(
        Option.filter(before, (b) => b.media !== media),
        { onNone: () => Effect.void, onSome: silence },
      );
      const played = yield* play(media);
      if (!plays(played)) yield* Ref.update(slot, (now) => Option.filter(now, (h) => h !== mine));
      return played;
    });
  const hush = Effect.flatMap(Ref.getAndSet(slot, Option.none()), (before) =>
    Option.match(before, { onNone: () => Effect.void, onSome: silence }),
  );
  return { hear, hush };
});

export class Media extends Context.Service<Media, MediaOps>()('@manna/film/browser/Media') {
  static readonly layerOver = (audio: (src: string) => Playable): Layer.Layer<Media> =>
    Layer.effect(
      Media,
      Effect.map(hearing, ({ hear, hush }) =>
        Media.of({
          audio,
          play,
          hear,
          hush,
          playOrMute: (media) =>
            Effect.flatMap(play(media), (played) => {
              if (played._tag !== 'Blocked') return Effect.succeed(played);
              media.mute(true);
              return Effect.map(play(media), (again) =>
                Played.$match(again, {
                  Playing: () => Played.Muted(),
                  Muted: () => again,
                  Blocked: () => again,
                  Aborted: () => again,
                  Failed: () => again,
                }),
              );
            }),
        }),
      ),
    );
}
