import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { makeLocalState } from 'alchemy/State';
import { Console, Effect, FileSystem, Option, Path, Redacted, Schema } from 'effect';
import { Digest } from 'effect/crypto';
import { Hex } from 'effect/encoding';
import { Command, Flag } from 'effect/cli';

export const STACK = 'film-store';

const StoreOutputs = Schema.Struct({
  bucket: Schema.String,
  accountId: Schema.String,
  keyId: Schema.String,
  token: Schema.Redacted(Schema.String),
});

class StoreNotDeployed extends Schema.TaggedError<StoreNotDeployed>()('StoreNotDeployed', {
  stage: Schema.String,
}) {
  override get message() {
    return `the ${STACK} stack has no outputs at stage ${this.stage}: deploy it first (bun run deploy)`;
  }
}

const PREFIX = 'FILM_STORE_';

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

const keys = Command.make(
  'store-keys',
  {
    stage: Flag.String('stage').pipe(
      Flag.withDefault('prod'),
      Flag.withDescription('the stage whose key to write'),
    ),
    env: Flag.String('env').pipe(
      Flag.withDefault('.env'),
      Flag.withDescription('the file to write it to'),
    ),
  },
  Effect.fn('store.keys')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Digest.Digest;
    const state = yield* makeLocalState();
    const raw = yield* state.getOutput({ stack: STACK, stage: input.stage });
    const found = Option.fromNullishOr(raw);
    if (Option.isNone(found)) return yield* StoreNotDeployed.make({ stage: input.stage });
    const outputs = yield* Schema.decodeUnknownEffect(StoreOutputs)(found.value);
    const secret = Hex.encode(
      yield* crypto.digest(Digest.sha256, new TextEncoder().encode(Redacted.value(outputs.token))),
    );
    const file = path.resolve(input.env);
    let existing = '';
    if (yield* fs.exists(file)) existing = yield* fs.readFileString(file);
    const next = envWith(existing, [
      ['FILM_STORE_ACCOUNT_ID', outputs.accountId],
      ['FILM_STORE_ACCESS_KEY_ID', outputs.keyId],
      ['FILM_STORE_SECRET_ACCESS_KEY', secret],
    ]);
    const partial = `${file}.partial`;
    yield* fs.writeFileString(partial, next, { mode: 0o600 });
    yield* fs.chmod(partial, 0o600);
    yield* fs.rename(partial, file);
    yield* Console.log(
      `wrote FILM_STORE_ACCOUNT_ID, FILM_STORE_ACCESS_KEY_ID, FILM_STORE_SECRET_ACCESS_KEY to ${file} (bucket ${outputs.bucket}, stage ${input.stage})`,
    );
  }),
).pipe(Command.withDescription("The film store's S3 key pair, from the deployed stack, into .env"));

if (import.meta.main)
  Command.run(keys, { version: '0.1.0' }).pipe(
    Effect.provide([BunCrypto.layerDigest, BunServices.layer]),
    BunRuntime.runMain,
  );
