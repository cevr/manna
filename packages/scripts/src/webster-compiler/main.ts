import { BunRuntime, BunServices, BunHttpClient } from '@effect/platform-bun';
import { WEBSTER_SOURCE } from '@manna/core/webster';
import { Console, Effect, FileSystem, Layer, Option } from 'effect';
import { Command, Flag } from 'effect/cli';
import { HttpClient, HttpClientResponse } from 'effect/http';

import { compileWebster } from './compile.js';
import { WebsterCompileError } from './csv.js';

const defaultOut = new URL('../../../core/data/webster.db', import.meta.url).pathname;
const command = Command.make(
  'build:webster',
  {
    source: Flag.String('source').pipe(
      Flag.optional,
      Flag.withDescription('Verified local copy of the pinned CSV'),
    ),
    out: Flag.String('out').pipe(
      Flag.withDefault(defaultOut),
      Flag.withDescription('Build artifact destination (never the installed owner database)'),
    ),
  },
  (args) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const bytes = yield* Option.match(args.source, {
        onSome: (file) => fs.readFile(file),
        onNone: () =>
          HttpClient.get(WEBSTER_SOURCE.url).pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.flatMap((response) => response.arrayBuffer),
            Effect.map((buffer) => new Uint8Array(buffer)),
          ),
      });
      if (bytes.length !== WEBSTER_SOURCE.bytes)
        return yield* WebsterCompileError.make({ message: 'Source byte count mismatch' });
      const result = yield* compileWebster({
        csv: bytes,
        destination: args.out,
        expectedDigest: WEBSTER_SOURCE.sha256,
      });
      yield* Console.log(
        `${result.path}: ${result.records} records, ${result.keys} keys; ${result.size} bytes; sha256:${result.sha256}`,
      );
    }),
);

Command.run(command, { version: '1' }).pipe(
  Effect.provide(Layer.merge(BunHttpClient.layer, BunServices.layer)),
  BunRuntime.runMain,
);
