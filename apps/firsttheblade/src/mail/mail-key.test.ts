import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Context, Effect, Layer, Option, Redacted } from 'effect';
import { TestConsole } from 'effect/testing';
import { HttpClient, HttpClientResponse, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { check } from '../../scripts/mail-key.ts';
import { SERIES } from '../content.ts';
import { Assets } from '../worker/assets.ts';
import { respond } from '../worker/respond.ts';
import { layerOf } from './films.ts';
import { layerTest, TEST_ADMIN_TOKEN } from './local.ts';
import { layer as tokensLayer, Tokens, type TokensService } from './tokens.ts';

const ORIGIN = 'https://firsttheblade.test';
const KEY = '33'.repeat(32);
const OTHER_KEY = '44'.repeat(32);

/** The tokens the Worker in this process holds: under `KEY`. */
class WorkerTokens extends Context.Service<WorkerTokens, TokensService>()('test/WorkerTokens') {}

const layerWorkerTokens = Layer.effect(
  WorkerTokens,
  Effect.gen(function* () {
    return yield* Tokens;
  }),
).pipe(Layer.provide(tokensLayer(Effect.succeed(Redacted.make(KEY)))));

const AssetsTest = Layer.succeed(
  Assets,
  Assets.of({ serve: () => Effect.succeed(HttpServerResponse.text('page')) }),
);

const services = Layer.mergeAll(AssetsTest, layerTest(layerOf(SERIES)), layerWorkerTokens).pipe(
  Layer.provide(BunServices.layer),
);

/** A client whose every request is answered by the Worker's policy, in this process, over `WorkerTokens`. */
const layerClient = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const context = yield* Effect.context<Layer.Success<typeof services>>();
    const tokens = yield* WorkerTokens;
    return HttpClient.make((request, url) =>
      Effect.gen(function* () {
        const web = new Request(url, { method: request.method, headers: request.headers });
        const answer = yield* respond(HttpServerRequest.fromWeb(web));
        return HttpClientResponse.fromWeb(request, HttpServerResponse.toWeb(answer));
      }).pipe(Effect.provideService(Tokens, tokens), Effect.provideContext(context)),
    );
  }),
);

const test = it.effect.layer(
  Layer.mergeAll(layerClient, TestConsole.layer).pipe(Layer.provideMerge(services)),
);

/** `bun run mail:key-check` with this `.env`. */
const checkWith = (env: Readonly<Record<string, string>>) =>
  check({ origin: ORIGIN }).pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
  );

const lastLine = Effect.map(TestConsole.logLines, (lines) =>
  Option.getOrElse(Option.map(Option.fromNullishOr(lines.at(-1)), String), () => ''),
);

describe('bun run mail:key-check', () => {
  test('says same when the local key is the Worker’s', () =>
    Effect.gen(function* () {
      const fingerprint = yield* (yield* WorkerTokens).fingerprint;
      yield* checkWith({ MAIL_ADMIN_TOKEN: TEST_ADMIN_TOKEN, MAIL_TOKEN_KEY: ` ${KEY}\n` });
      expect(yield* lastLine).toBe(
        `same: the Worker's MAIL_TOKEN_KEY is this .env's (fingerprint ${fingerprint})`,
      );
    }));

  test('fails saying DIFFERENT when it is not', () =>
    Effect.gen(function* () {
      const fingerprint = yield* (yield* WorkerTokens).fingerprint;
      const failed = yield* Effect.flip(
        checkWith({ MAIL_ADMIN_TOKEN: TEST_ADMIN_TOKEN, MAIL_TOKEN_KEY: OTHER_KEY }),
      );
      expect(failed.message).toMatch(
        new RegExp(
          `^DIFFERENT: the Worker's MAIL_TOKEN_KEY is not this \\.env's \\(Worker ${fingerprint}, \\.env [0-9a-f]{16}\\)$`,
        ),
      );
      expect(failed.message).not.toContain(OTHER_KEY);
    }));

  test('gives the Worker’s fingerprint alone, and succeeds, when no key is set here', () =>
    Effect.gen(function* () {
      const fingerprint = yield* (yield* WorkerTokens).fingerprint;
      yield* checkWith({ MAIL_ADMIN_TOKEN: TEST_ADMIN_TOKEN });
      expect(yield* lastLine).toBe(
        `the Worker's fingerprint is ${fingerprint}; no MAIL_TOKEN_KEY here to compare`,
      );
    }));

  test('fails with the Worker’s 401 for a wrong admin token', () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip(
        checkWith({ MAIL_ADMIN_TOKEN: 'wrong', MAIL_TOKEN_KEY: KEY }),
      );
      expect(failed.message).toBe('401 unauthorized');
    }));
});
