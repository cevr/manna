/**
 * `bun run keys [--stage s] [--env file]`: what the publisher needs to reach
 * a deployed stage, from the stack's outputs, into the publisher's
 * git-ignored `.env` (`../animations/.env` by default, where
 * `bun run screening` reads it): the account, the bucket-scoped S3 key pair,
 * the bucket's name and the site's URL (`SCREENING_*`).
 *
 * The deploy keeps the token's value in the stack's local state
 * (`.alchemy/`, git-ignored). R2's S3 API takes the token's id as the access
 * key id and the sha256 of its value as the secret; both are derived here and
 * written beside whatever else `.env` holds, replacing only the `SCREENING_*`
 * lines, the file readable by its owner alone. Nothing but the variables'
 * names is printed.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { makeLocalState } from 'alchemy/State';
import { Console, Crypto, Effect, FileSystem, Option, Path, Redacted, Schema } from 'effect';
import { Hex } from 'effect/encoding';
import { Command, Flag } from 'effect/cli';

import { DOMAIN, SERVED_FROM } from '../src/site.ts';

/** The stack `alchemy.run.ts` declares. */
const STACK = 'screening';

/** The stack's outputs `keys` reads. */
const SiteOutputs = Schema.Struct({
  /** The Worker's `workers.dev` URL; none on a stage served from its custom domain alone. */
  url: Schema.OptionFromOptionalNullOr(Schema.String),
  bucket: Schema.String,
  accountId: Schema.String,
  keyId: Schema.String,
  token: Schema.Redacted(Schema.String),
});

/** The stack was never deployed at the stage (or was destroyed). */
class SiteNotDeployed extends Schema.TaggedError<SiteNotDeployed>()('SiteNotDeployed', {
  stage: Schema.String,
}) {
  override get message() {
    return `the ${STACK} stack has no outputs at stage ${this.stage}: deploy it first`;
  }
}

/** The variables the publisher reads, and the prefix they share. */
const PREFIX = 'SCREENING_';

/** `.env` text with `entries` in place of every `SCREENING_*` line it had, every other line kept. */
const envWith = (existing: string, entries: ReadonlyArray<readonly [string, string]>): string => {
  const kept = existing
    .split('\n')
    .filter((line) => !line.trimStart().startsWith(PREFIX))
    .join('\n')
    .replace(/\n+$/, '');
  const added = entries.map(([name, value]) => `${name}=${value}`).join('\n');
  if (kept === '') return `${added}\n`;
  return `${kept}\n${added}\n`;
};

/**
 * The site's address on `stage`: `prod` served from its custom domain is
 * `https://films.cvr.im`; any other stage, its `workers.dev` URL.
 */
const siteUrl = (stage: string, url: Option.Option<string>): string => {
  if (stage === 'prod' && SERVED_FROM === 'custom-domain') return `https://${DOMAIN}`;
  return Option.getOrElse(url, () => '').replace(/\/+$/, '');
};

const keys = Command.make(
  'screening-keys',
  {
    stage: Flag.String('stage').pipe(
      Flag.withDefault('prod'),
      Flag.withDescription('the stage whose key to write'),
    ),
    env: Flag.String('env').pipe(
      Flag.withDefault('../animations/.env'),
      Flag.withDescription('the file to write it to'),
    ),
  },
  Effect.fn('screening.keys')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const state = yield* makeLocalState();
    const raw = yield* state.getOutput({ stack: STACK, stage: input.stage });
    const found = Option.fromNullishOr(raw);
    if (Option.isNone(found)) return yield* SiteNotDeployed.make({ stage: input.stage });
    const outputs = yield* Schema.decodeUnknownEffect(SiteOutputs)(found.value);
    const secret = Hex.encode(
      yield* crypto.digest('SHA-256', new TextEncoder().encode(Redacted.value(outputs.token))),
    );
    const file = path.resolve(input.env);
    let existing = '';
    if (yield* fs.exists(file)) existing = yield* fs.readFileString(file);
    const next = envWith(existing, [
      ['SCREENING_ACCOUNT_ID', outputs.accountId],
      ['SCREENING_ACCESS_KEY_ID', outputs.keyId],
      ['SCREENING_SECRET_ACCESS_KEY', secret],
      ['SCREENING_BUCKET', outputs.bucket],
      ['SCREENING_URL', siteUrl(input.stage, outputs.url)],
    ]);
    const partial = `${file}.partial`;
    yield* fs.writeFileString(partial, next, { mode: 0o600 });
    yield* fs.chmod(partial, 0o600);
    yield* fs.rename(partial, file);
    yield* Console.log(
      `wrote SCREENING_ACCOUNT_ID, SCREENING_ACCESS_KEY_ID, SCREENING_SECRET_ACCESS_KEY, SCREENING_BUCKET, SCREENING_URL to ${file} (stage ${input.stage})`,
    );
  }),
).pipe(
  Command.withDescription(
    "The publisher's key, bucket and URL, from the deployed stack, into .env",
  ),
);

if (import.meta.main)
  Command.run(keys, { version: '0.1.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
