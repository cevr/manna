import { Effect, type Layer, Record as Rec, Schema } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import type { Film } from '../canvas/film.ts';
import { createTalk } from '../canvas/talk.ts';
import { TalkUnreadable } from '../core/errors.ts';
import {
  FOOTAGE_LOCK_HREF,
  FootageLockJson,
  FootageTranscriptJson,
  transcriptHref,
} from '../core/footage.ts';
import {
  TALK_FPS,
  Talk,
  type TalkCut,
  type TalkTake,
  talkCut,
  talkTakes,
  talkTranscripts,
} from '../core/talk.ts';

const TalkModule = Schema.Struct({ talk: Talk });

interface TalkPage {
  readonly talk: Talk;
  readonly takes: Readonly<Record<string, TalkTake>>;
  readonly cut: TalkCut;
}

const TRANSCRIPTS_AT_ONCE = 6;

const read = <A>(film: string, url: string, codec: Schema.Codec<A, string>) =>
  Effect.gen(function* () {
    const unreadable = (reason: string) => TalkUnreadable.make({ film, url, reason });
    const http = yield* HttpClient.HttpClient;
    const res = yield* Effect.mapError(http.get(url), (e) => unreadable(e.message));
    if (res.status < 200 || res.status >= 300) return yield* unreadable(`status ${res.status}`);
    const text = yield* Effect.mapError(res.text, (e) => unreadable(e.message));
    return yield* Effect.mapError(Schema.decodeEffect(codec)(text), (e) => unreadable(e.message));
  });

const loadTalk = (
  film: string,
  module: unknown,
): Effect.Effect<TalkPage, TalkUnreadable, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const refused = (reason: string) => TalkUnreadable.make({ film, reason });
    const { talk } = yield* Effect.mapError(Schema.decodeUnknownEffect(TalkModule)(module), (e) =>
      refused(`its talk.ts does not read: ${e.message}`),
    );
    const lock = yield* read(film, FOOTAGE_LOCK_HREF, FootageLockJson);
    const transcripts = new Map(
      yield* Effect.forEach(
        talkTranscripts(talk, lock),
        (file) =>
          Effect.map(
            read(film, transcriptHref(file), FootageTranscriptJson),
            (heard) => [file, heard] as const,
          ),
        { concurrency: TRANSCRIPTS_AT_ONCE },
      ),
    );
    const takes = yield* Effect.mapError(
      Effect.fromResult(talkTakes(talk, lock, transcripts)),
      (e) => refused(e.message),
    );
    const cut = yield* Effect.mapError(Effect.fromResult(talkCut(talk, takes)), (e) =>
      refused(e.message),
    );
    return { talk, takes, cut };
  });

interface TalkFilmModule {
  readonly fps: number;
  readonly film: (narrated: { readonly audio: string }) => Film;
}

export const talkFilms = <K extends string>(
  talks: Readonly<Record<K, () => Promise<unknown>>>,
  http: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer,
): Record<K, () => Promise<TalkFilmModule>> =>
  Rec.map(
    talks,
    (load, id) => () =>
      Effect.runPromise(
        Effect.promise(load).pipe(
          Effect.flatMap((module) => loadTalk(id, module)),
          Effect.map((page): TalkFilmModule => ({
            fps: TALK_FPS,
            film: (narrated) => ({
              ...createTalk(page.talk, page.takes, page.cut),
              audio: narrated.audio,
            }),
          })),
          Effect.provide(http),
        ),
      ),
  );
