/**
 * `bun run mail:import`: brings the subscribers of the D1 list the model
 * replaced into the model, once, after the deploy that brings the model. It
 * asks the Worker's import route (`src/mail/routes.ts`), which keeps each
 * address and imports each subscriber under its row's command id, so running
 * it again changes nothing. `--origin` names the site to ask, as `bun run
 * mail:send` does; the admin secret is `MAIL_ADMIN_TOKEN` from the
 * environment. Once prod has imported, this script, its route and
 * `src/mail/legacy.ts` go.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Config, Console, Effect, Layer, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';

import { ImportAnswer } from '../src/mail/admin.ts';
import { MAIL_ROUTES } from '../src/mail/paths.ts';
import { ORIGIN } from '../src/site.ts';

/** The Worker refused the import; its words and status are the message. */
class ImportFailed extends Schema.TaggedError<ImportFailed>()('ImportFailed', {
  message: Schema.String,
}) {}

export const importList = Effect.fn('MailImport.import')(function* (input: {
  readonly origin: string;
}) {
  const token = yield* Config.Redacted('MAIL_ADMIN_TOKEN');
  const client = yield* HttpClient.HttpClient;
  const request = HttpClientRequest.post(new URL(MAIL_ROUTES.import, input.origin)).pipe(
    HttpClientRequest.bearerToken(token),
  );
  const response = yield* client.execute(request);
  const answer = yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ImportAnswer)),
  );
  if ('error' in answer) {
    return yield* ImportFailed.make({ message: `${response.status} ${answer.error}` });
  }
  yield* Console.log(`Imported ${answer.imported} subscribers from the D1 list.`);
});

const command = Command.make(
  'mail-import',
  {
    origin: Flag.String('origin').pipe(
      Flag.withDefault(ORIGIN),
      Flag.withDescription('The deployed site to ask'),
    ),
  },
  importList,
).pipe(Command.withDescription("Bring the D1 list's subscribers into the model, once"));

const platform = Layer.mergeAll(FetchHttpClient.layer, BunServices.layer);

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(Effect.provide(platform), BunRuntime.runMain);
}
