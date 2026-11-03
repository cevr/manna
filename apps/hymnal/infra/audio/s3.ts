import { Effect, Layer, Option, Schedule } from 'effect';
import { HttpClient, HttpClientRequest } from 'effect/http';
import type { HttpClientError } from 'effect/http';

import type { SourceHead } from './stores.ts';
import { Source, StoreFailed } from './stores.ts';

const S3_ORIGIN = 'https://cvr-hymns.s3.amazonaws.com';

const s3Url = (hymn: number) => `${S3_ORIGIN}/${hymn}.mp3`;

const failure = (reason: string) => StoreFailed.make({ store: 's3', reason });

const transport = (hymn: number) => (error: HttpClientError.HttpClientError) =>
  failure(`${hymn}.mp3: ${error.message}`);

const HEAD_TIMEOUT = '1 minute';
const GET_TIMEOUT = '3 minutes';

const within =
  (hymn: number, duration: typeof HEAD_TIMEOUT | typeof GET_TIMEOUT) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    Effect.timeoutOrElse(self, {
      duration,
      orElse: () => Effect.fail(failure(`${hymn}.mp3: no answer in ${duration}`)),
    });

const headOf = (
  hymn: number,
  status: number,
  headers: Readonly<Record<string, string>>,
): Effect.Effect<Option.Option<SourceHead>, StoreFailed> => {
  if (status === 403 || status === 404) return Effect.succeedNone;
  if (status !== 200) return Effect.fail(failure(`${hymn}.mp3: HEAD answered ${status}`));
  const header = (name: string) =>
    Option.filter(Option.fromUndefinedOr(headers[name]), (value) => value !== '');
  const size = Option.filter(Option.map(header('content-length'), Number), Number.isSafeInteger);
  const etag = header('etag');
  if (Option.isNone(size) || Option.isNone(etag)) {
    return Effect.fail(failure(`${hymn}.mp3: HEAD answered no content-length or etag`));
  }
  const contentType = Option.getOrElse(header('content-type'), () => 'audio/mpeg');
  return Effect.succeedSome({ size: size.value, etag: etag.value, contentType });
};

export const SourceS3 = Layer.effect(
  Source,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.retryTransient({
        schedule: Schedule.exponential('250 millis'),
        times: 4,
      }),
    );
    const ok = client.pipe(HttpClient.filterStatusOk);

    const head = Effect.fn('Source.head')(function* (hymn: number) {
      const response = yield* client
        .execute(HttpClientRequest.head(s3Url(hymn)))
        .pipe(Effect.mapError(transport(hymn)), within(hymn, HEAD_TIMEOUT));
      return yield* headOf(hymn, response.status, response.headers);
    });

    const get = Effect.fn('Source.get')(function* (hymn: number) {
      const body = yield* ok.get(s3Url(hymn)).pipe(
        Effect.flatMap((response) => response.arrayBuffer),
        Effect.mapError(transport(hymn)),
        within(hymn, GET_TIMEOUT),
      );
      return new Uint8Array(body);
    });

    return Source.of({ head, get });
  }),
);
