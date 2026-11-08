/**
 * The R2 adapter through its layer, over a recording `HttpClient`: each test
 * scripts the answers and reads back the requests the adapter sent, for
 * nested keys under the revision's folder. No call leaves the process.
 * Retries and timeouts run on the test clock.
 */
import * as CloudflareCredentials from '@distilled.cloud/cloudflare/Credentials';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Option, Redacted, Result } from 'effect';
import type { Duration } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import type { HttpClientRequest } from 'effect/http';
import { TestClock } from 'effect/testing';

import { CACHE_CONTROL, CONTENT_TYPE, PREFIX, keyOf } from './plan.ts';
import { TargetR2 } from './r2.ts';
import { Target } from './stores.ts';

interface Sent {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Option.Option<Uint8Array>;
}

/** An answer to the n-th request (0 first): a response, or none at all. */
type Script = (request: Sent, n: number) => Option.Option<Response>;

const bodyOf = (request: HttpClientRequest.HttpClientRequest): Option.Option<Uint8Array> => {
  if (request.body._tag === 'Uint8Array') return Option.some(request.body.body);
  return Option.none();
};

type Answer = () => Option.Option<Response>;

/** The answers in turn, the last one again for every request after it. */
const inTurn =
  (...answers: ReadonlyArray<Answer>): Script =>
  (_, n) =>
    Option.fromUndefinedOr(answers[Math.min(n, answers.length - 1)]).pipe(
      Option.flatMap((answer) => answer()),
    );

/** A client that keeps what it is sent and answers from the script. */
const recording = (script: Script) => {
  const sent: Array<Sent> = [];
  const client = HttpClient.make((request, url) => {
    const entry: Sent = {
      method: request.method,
      url: url.toString(),
      headers: request.headers,
      body: bodyOf(request),
    };
    const n = sent.length;
    sent.push(entry);
    return Option.match(script(entry, n), {
      onNone: () => Effect.never,
      onSome: (response) => Effect.succeed(HttpClientResponse.fromWeb(request, response)),
    });
  });
  return { sent, layer: Layer.succeed(HttpClient.HttpClient, client) };
};

/** A JSON body as the wire carries it. */
type Wire = string | number | boolean | ReadonlyArray<Wire> | { readonly [key: string]: Wire };

const json = (status: number, body: Wire) => Option.some(Response.json(body, { status }));

/** A 200 whose body breaks after its headers, as a connection reset does. */
const lostBody = () =>
  Option.some(
    new Response(
      new ReadableStream({
        pull: (controller) => controller.error('connection reset'),
      }),
      { status: 200 },
    ),
  );

const reasonIn = <A>(result: Result.Result<A, { readonly reason: string }>) =>
  Result.match(result, { onFailure: (e) => e.reason, onSuccess: () => '' });

const envelope = (result: Wire) => json(200, { success: true, errors: [], messages: [], result });

const page = (result: Wire, cursor: string) =>
  json(200, { success: true, errors: [], messages: [], result, result_info: { cursor } });

const refusal = (status: number, code: number, message: string) =>
  json(status, { success: false, errors: [{ code, message }], messages: [] });

const API_BASE = 'https://api.cloudflare.com/client/v4';
const OBJECTS = `${API_BASE}/accounts/acc/r2/buckets/heartseed-models/objects`;

const credentials = Layer.mergeAll(
  Layer.succeed(
    CloudflareCredentials.Credentials,
    CloudflareCredentials.Credentials.of(
      Effect.succeed({ type: 'apiToken', apiToken: Redacted.make('token'), apiBaseUrl: API_BASE }),
    ),
  ),
  Layer.succeed(
    Cloudflare.CloudflareEnvironment,
    Cloudflare.CloudflareEnvironment.of(
      Effect.succeed({
        type: 'apiToken',
        apiToken: Redacted.make('token'),
        accountId: 'acc',
        source: { type: 'env' },
      }),
    ),
  ),
);

const r2Over = (script: Script) => {
  const { sent, layer } = recording(script);
  return { sent, layer: TargetR2.pipe(Layer.provide(Layer.merge(credentials, layer))) };
};

const urlOf = (sent: ReadonlyArray<Sent>, n: number) =>
  new URL(Option.getOrElse(Option.fromUndefinedOr(sent[n]?.url), () => 'about:blank'));

/** Bytes no text encoding keeps: a body sent through text would change them. */
const bytes = Uint8Array.from([0x00, 0x80, 0xff]);
const metadata = { contentType: CONTENT_TYPE, cacheControl: CACHE_CONTROL };
const stored = () => envelope({ etag: '"5289df737df57326fcdd22597afb1fac"', size: '3' });

/** A key three folders deep, as the Core ML stages' weights are. */
const KEY = keyOf('KokoroAlbert.mlmodelc/weights/weight.bin');

/** Runs an effect while the test clock passes `duration`, and answers its result. */
const across = <A, E, R>(effect: Effect.Effect<A, E, R>, duration: Duration.Input) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(Effect.result(effect));
    yield* TestClock.adjust(duration);
    return yield* Fiber.join(fiber);
  });

const put = Effect.gen(function* () {
  const target = yield* Target;
  return yield* target.put(KEY, bytes, metadata);
});

const list = Effect.gen(function* () {
  const target = yield* Target;
  return yield* target.list(PREFIX);
});

describe('R2 upload', () => {
  it.effect('PUTs the bytes under the key with its slashes, the token and the headers', () => {
    const { sent, layer } = r2Over(stored);
    return Effect.gen(function* () {
      const object = yield* put;
      expect(object).toEqual({ size: 3, etag: '"5289df737df57326fcdd22597afb1fac"' });
      expect(sent).toHaveLength(1);
      const [request] = sent;
      expect(request?.method).toBe('PUT');
      expect(request?.url).toBe(
        `${OBJECTS}/kokoro/2568276a60ff/KokoroAlbert.mlmodelc/weights/weight.bin`,
      );
      expect(request?.headers['authorization']).toBe('Bearer token');
      expect(request?.headers['content-type']).toBe('application/octet-stream');
      expect(request?.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(request?.body).toEqual(Option.some(bytes));
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails an answer with no size or etag, so a stored object is never assumed', () => {
    const { layer } = r2Over(() => envelope({ etag: '"5289df737df57326fcdd22597afb1fac"' }));
    return Effect.gen(function* () {
      const result = yield* Effect.result(put);
      expect(reasonIn(result)).toContain(`put ${KEY}: the answer gave no size or etag`);
    }).pipe(Effect.provide(layer));
  });

  it.effect('retries a 403 that Cloudflare names a transient auth blip, then stores', () => {
    const { sent, layer } = r2Over(
      inTurn(() => refusal(403, 10000, 'Authentication error'), stored),
    );
    return across(put, '30 seconds').pipe(
      Effect.map((result) => {
        expect(Result.isSuccess(result)).toBe(true);
        expect(sent).toHaveLength(2);
      }),
      Effect.provide(layer),
    );
  });

  it.effect('fails a permanent 403 at once, with Cloudflare’s code and message', () => {
    const { sent, layer } = r2Over(() => refusal(403, 10001, 'Method not allowed for token'));
    return across(put, '30 seconds').pipe(
      Effect.map((result) => {
        expect(sent).toHaveLength(1);
        expect(Result.isFailure(result)).toBe(true);
        const reason = reasonIn(result);
        expect(reason).toContain('10001');
        expect(reason).toContain('Method not allowed for token');
      }),
      Effect.provide(layer),
    );
  });

  it.effect('retries a 5xx as distilled does, then fails with what Cloudflare said', () => {
    const { sent, layer } = r2Over(() => refusal(503, 10043, 'Service unavailable'));
    return across(put, '2 minutes').pipe(
      Effect.map((result) => {
        expect(sent).toHaveLength(9);
        expect(reasonIn(result)).toContain('Service unavailable');
      }),
      Effect.provide(layer),
    );
  });

  it.effect('waits ten minutes for one upload, then fails it', () => {
    const { layer } = r2Over(() => Option.none());
    return Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(Effect.result(put));
      yield* TestClock.adjust('9 minutes');
      expect(Option.isNone(Option.fromUndefinedOr(fiber.pollUnsafe()))).toBe(true);
      yield* TestClock.adjust('1 minute');
      const result = yield* Fiber.join(fiber);
      expect(reasonIn(result)).toContain('did not complete in 10 minutes');
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails an upload whose answer loses its body as that key’s StoreFailed', () => {
    const { sent, layer } = r2Over(lostBody);
    return Effect.gen(function* () {
      const result = yield* Effect.result(put);
      expect(sent).toHaveLength(1);
      expect(reasonIn(result)).toContain(`put ${KEY}: the answer lost its body`);
    }).pipe(Effect.provide(layer));
  });
});

describe('R2 listing', () => {
  it.effect('reads every page by its cursor, the sizes and ETags as R2 lists them', () => {
    const { sent, layer } = r2Over(
      inTurn(
        () => page([{ key: keyOf('af_heart.bin'), size: 10, etag: 'a1' }], 'next'),
        () => page([{ key: keyOf('KokoroAlbert.mlmodelc/model.mil'), size: 20, etag: 'b2' }], ''),
      ),
    );
    return Effect.gen(function* () {
      const listed = yield* list;
      expect([...listed]).toEqual([
        ['kokoro/2568276a60ff/af_heart.bin', { size: 10, etag: 'a1' }],
        ['kokoro/2568276a60ff/KokoroAlbert.mlmodelc/model.mil', { size: 20, etag: 'b2' }],
      ]);
      expect(sent).toHaveLength(2);
      const first = urlOf(sent, 0);
      expect(`${first.origin}${first.pathname}`).toBe(OBJECTS);
      expect(first.searchParams.get('prefix')).toBe('kokoro/2568276a60ff/');
      expect(first.searchParams.get('per_page')).toBe('1000');
      expect(sent[0]?.headers['authorization']).toBe('Bearer token');
      expect(urlOf(sent, 1).searchParams.get('cursor')).toBe('next');
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails a refused listing with Cloudflare’s message, so the verify reports it', () => {
    const { layer } = r2Over(() => refusal(404, 10006, 'The specified bucket does not exist.'));
    return Effect.gen(function* () {
      const result = yield* Effect.result(list);
      const reason = reasonIn(result);
      expect(reason).toContain('10006');
      expect(reason).toContain('The specified bucket does not exist.');
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails a listing whose answer loses its body as a StoreFailed', () => {
    const { layer } = r2Over(lostBody);
    return Effect.gen(function* () {
      const result = yield* Effect.result(list);
      expect(reasonIn(result)).toContain(`list ${PREFIX}: the answer lost its body`);
    }).pipe(Effect.provide(layer));
  });

  it.effect('fails a listing that never completes once its time is up', () => {
    const { layer } = r2Over(() => Option.none());
    return across(list, '3 minutes').pipe(
      Effect.map((result) => {
        expect(reasonIn(result)).toContain('did not complete in 3 minutes');
      }),
      Effect.provide(layer),
    );
  });
});
