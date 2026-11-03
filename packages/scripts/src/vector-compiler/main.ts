import {
  DIMENSIONS,
  encodeVectorIndex,
  MODEL_FINGERPRINT,
  VectorManifest,
} from '@manna/core/search';
import { BunRuntime, BunServices } from '@effect/platform-bun';
import {
  Cause,
  Config,
  Console,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
  SchemaGetter,
} from 'effect';
import { Command, Flag } from 'effect/cli';

import { clearCheckpoint, embedAllResumable } from './checkpoint.js';
import { bookRanges, paragraphIds } from './emit.js';
import { vectorBuildEmbedder } from './paths.js';
import { readVectorSource } from './source.js';

const repoRoot = new URL('../../../../', import.meta.url).pathname.replace(/\/$/u, '');

const out = Flag.String('out').pipe(
  Flag.withDefault(`${repoRoot}/packages/core/data/vectors.bvi`),
  Flag.withDescription('Destination path for the compiled vector index'),
);

const writingsDb = Flag.String('writings-db').pipe(
  Flag.withDefault(''),
  Flag.withDescription('Writings database to embed from (default ~/.bible)'),
);

const limit = Flag.Int('limit').pipe(
  Flag.withDefault(200),
  Flag.withDescription('Paragraphs to embed; 0 means the entire EGW scope (hours)'),
);

class CompilerInputError extends Schema.TaggedError<CompilerInputError>()('CompilerInputError', {
  message: Schema.String,
}) {}

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);
const encodeJson = Schema.encodeUnknownEffect(JsonString);

const json = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Emit the manifest as JSON'),
);

const buildVectors = Command.make('build:vectors', { out, writingsDb, limit, json }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    const writingsFile = Option.match(
      Option.liftPredicate(args.writingsDb, (value) => value.length > 0),
      {
        onNone: () => path.join(home, '.bible', 'egw-paragraphs.db'),
        onSome: (value) => value,
      },
    );

    if (!(yield* fs.exists(writingsFile))) {
      return yield* CompilerInputError.make({
        message: `writings database not found at ${writingsFile} — run 'manna egw sync' first`,
      });
    }

    const rows = yield* readVectorSource({
      filename: writingsFile,
      limit: Option.liftPredicate(args.limit, (value) => value > 0),
    });
    if (rows.length === 0) {
      return yield* CompilerInputError.make({
        message: `no EGW-scope paragraphs in ${writingsFile}`,
      });
    }

    yield* fs.makeDirectory(path.dirname(args.out), { recursive: true });
    const vectors = yield* embedAllResumable(rows, args.out);

    const buffer = encodeVectorIndex({
      fingerprint: MODEL_FINGERPRINT,
      manifest: VectorManifest.make({
        books: bookRanges(rows),
        paragraphIds: paragraphIds(rows),
      }),
      vectors,
    });

    yield* fs.writeFile(args.out, new Uint8Array(buffer));
    yield* clearCheckpoint(args.out);

    const manifest = {
      path: args.out,
      fingerprint: MODEL_FINGERPRINT,
      dimensions: DIMENSIONS,
      vectors: rows.length,
      books: bookRanges(rows).length,
      bytes: buffer.byteLength,
      partial: args.limit !== 0,
    };
    if (args.json) {
      yield* Console.log(yield* encodeJson(manifest));
      return;
    }
    yield* Console.log(`✓ ${manifest.path}`);
    yield* Console.log(`  fingerprint  ${manifest.fingerprint}`);
    yield* Console.log(`  vectors      ${String(manifest.vectors)} × ${String(DIMENSIONS)}d int8`);
    yield* Console.log(`  books        ${String(manifest.books)}`);
    yield* Console.log(`  size         ${String(manifest.bytes)} bytes`);
    if (manifest.partial) {
      yield* Console.error(``);
      yield* Console.error(
        `⚠ PARTIAL index: ${String(rows.length)} of the EGW scope, from --limit ${String(args.limit)}.`,
      );
      yield* Console.error(
        `  Search will find only these paragraphs. Use --limit 0 for a release.`,
      );
    }
  }).pipe(Effect.provide(vectorBuildEmbedder)),
);

const cli = Command.run(buildVectors, { version: '1.0.0' });

cli.pipe(
  Effect.tapCause((cause) =>
    Console.error(`build:vectors failed\n${Cause.pretty(cause)}`).pipe(Effect.ignore),
  ),
  Effect.provide(BunServices.layer),
  Effect.scoped,
  BunRuntime.runMain,
);
