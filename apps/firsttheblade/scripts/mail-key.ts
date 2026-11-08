/**
 * `bun run mail:key-check`: whether the deployed Worker's `MAIL_TOKEN_KEY`
 * (a secret of the account's Secrets Store) is the one in this `.env`. It
 * asks the Worker's key route (`src/mail/routes.ts`) for the key's
 * fingerprint, with `MAIL_ADMIN_TOKEN` as its bearer token, and compares it
 * with the fingerprint of the local key, made here by the same tokens
 * (`src/mail/tokens.ts`). Run it once after the first deploy that reads the
 * key from the store, before the key's line leaves `.env`: a key that
 * differs gives every subscriber a new id and breaks every link sent.
 *
 * It prints one line: `same: …` (exit 0), `DIFFERENT: …` (exit 1), the
 * Worker's fingerprint alone when no `MAIL_TOKEN_KEY` is set here (exit 0),
 * or the Worker's refusal with its status (exit 1). `--origin` names the
 * site to ask (a throwaway stage's `workers.dev` address). Bun loads `.env`
 * here.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Config, Console, Context, Effect, Layer, Option, type Redacted, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';

import { KeyAnswer } from '../src/mail/admin.ts';
import { MAIL_ROUTES } from '../src/mail/paths.ts';
import { layer as tokensLayer, Tokens } from '../src/mail/tokens.ts';
import { ORIGIN } from '../src/site.ts';

/** The key check failed: the keys differ, or the Worker refused; the line is the message. */
class KeyCheckFailed extends Schema.TaggedError<KeyCheckFailed>()('KeyCheckFailed', {
  message: Schema.String,
}) {}

/** The fingerprint of the token key `key`, as the Worker's tokens make it. */
const fingerprintOf = (key: Redacted.Redacted<string>) =>
  Effect.scoped(
    Effect.flatMap(
      Layer.build(tokensLayer(Effect.succeed(key))),
      (context) => Context.get(context, Tokens).fingerprint,
    ),
  );

export const check = Effect.fn('MailKey.check')(function* (input: { readonly origin: string }) {
  const token = yield* Config.Redacted('MAIL_ADMIN_TOKEN');
  const local = yield* Config.option(Config.Redacted('MAIL_TOKEN_KEY'));
  const client = yield* HttpClient.HttpClient;
  const request = HttpClientRequest.get(new URL(MAIL_ROUTES.key, input.origin)).pipe(
    HttpClientRequest.bearerToken(token),
  );
  const response = yield* client.execute(request);
  const answer = yield* response.json.pipe(Effect.flatMap(Schema.decodeUnknownEffect(KeyAnswer)));
  if ('error' in answer) {
    return yield* KeyCheckFailed.make({ message: `${response.status} ${answer.error}` });
  }
  const worker = answer.fingerprint;
  if (Option.isNone(local)) {
    return yield* Console.log(
      `the Worker's fingerprint is ${worker}; no MAIL_TOKEN_KEY here to compare`,
    );
  }
  const here = yield* fingerprintOf(local.value);
  if (here !== worker) {
    return yield* KeyCheckFailed.make({
      message: `DIFFERENT: the Worker's MAIL_TOKEN_KEY is not this .env's (Worker ${worker}, .env ${here})`,
    });
  }
  yield* Console.log(`same: the Worker's MAIL_TOKEN_KEY is this .env's (fingerprint ${worker})`);
});

const command = Command.make(
  'mail-key-check',
  {
    origin: Flag.String('origin').pipe(
      Flag.withDefault(ORIGIN),
      Flag.withDescription('The deployed site to ask'),
    ),
  },
  check,
).pipe(Command.withDescription("Check that the Worker's token key is this .env's"));

const platform = Layer.mergeAll(FetchHttpClient.layer, BunServices.layer);

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(Effect.provide(platform), BunRuntime.runMain);
}
