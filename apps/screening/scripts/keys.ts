import { BunRuntime, BunServices } from '@effect/platform-bun';
import { makeLocalState } from 'alchemy/State';
import { Console, Effect, FileSystem, Option, Path, Redacted, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';

import { DOMAIN, SERVED_FROM } from '../src/site.ts';

const STACK = 'screening';

const SiteOutputs = Schema.Struct({
  url: Schema.OptionFromOptionalNullOr(Schema.String),
  desk: Schema.String,
  token: Schema.Redacted(Schema.String),
});

class SiteNotDeployed extends Schema.TaggedError<SiteNotDeployed>()('SiteNotDeployed', {
  stage: Schema.String,
}) {
  override get message() {
    return `the ${STACK} stack has no outputs at stage ${this.stage}: deploy it first`;
  }
}

const PREFIX = 'SCREENING_';

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

const bare = (url: string) => url.replace(/\/+$/, '');

const siteUrl = (stage: string, url: Option.Option<string>): string => {
  if (stage === 'prod' && SERVED_FROM === 'custom-domain') return `https://${DOMAIN}`;
  return bare(Option.getOrElse(url, () => ''));
};

const keys = Command.make(
  'screening-keys',
  {
    stage: Flag.String('stage').pipe(
      Flag.withDefault('prod'),
      Flag.withDescription('the stage to publish to'),
    ),
    env: Flag.String('env').pipe(
      Flag.withDefault('../animations/.env'),
      Flag.withDescription('the file to write it to'),
    ),
  },
  Effect.fn('screening.keys')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const state = yield* makeLocalState();
    const raw = yield* state.getOutput({ stack: STACK, stage: input.stage });
    const found = Option.fromNullishOr(raw);
    if (Option.isNone(found)) return yield* SiteNotDeployed.make({ stage: input.stage });
    const outputs = yield* Schema.decodeUnknownEffect(SiteOutputs)(found.value);
    const file = path.resolve(input.env);
    let existing = '';
    if (yield* fs.exists(file)) existing = yield* fs.readFileString(file);
    const next = envWith(existing, [
      ['SCREENING_URL', siteUrl(input.stage, outputs.url)],
      ['SCREENING_DESK_URL', bare(outputs.desk)],
      ['SCREENING_DESK_TOKEN', Redacted.value(outputs.token)],
    ]);
    const partial = `${file}.partial`;
    yield* fs.writeFileString(partial, next, { mode: 0o600 });
    yield* fs.chmod(partial, 0o600);
    yield* fs.rename(partial, file);
    yield* Console.log(
      `wrote SCREENING_URL, SCREENING_DESK_URL, SCREENING_DESK_TOKEN to ${file} (stage ${input.stage})`,
    );
  }),
).pipe(
  Command.withDescription(
    "The site's and the desk's URLs and the desk's secret, from the deployed stack, into .env",
  ),
);

if (import.meta.main)
  Command.run(keys, { version: '0.1.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
