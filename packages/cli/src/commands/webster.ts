import { WebsterEntry, WebsterLookup, WebsterService } from '@manna/core/webster';
import { CorpusSupply, Target } from '@manna/core/corpus-supply';
import {
  layerNativeWebsterArtifacts,
  type NativeFileArtifactSource,
} from '@manna/core/corpus-supply/bun';
import { Console, Effect, Layer, Path, Result, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { packagedDataCandidates } from '../lib/paths.js';

/** The optional init leg owns source priority, supply and its user-facing receipt. */
export const initializeWebster = Effect.fn('WebsterCommand.initialize')(function* (input: {
  readonly directory: string;
  readonly refresh?: boolean;
  readonly packagedPaths?: readonly string[];
  readonly workspaceRoot?: string;
}) {
  const path = yield* Path.Path;
  const destination = path.join(input.directory, 'webster.db');
  const sources: NativeFileArtifactSource[] = [
    ...(input.packagedPaths ?? packagedDataCandidates('webster.db')).map(
      (candidate): NativeFileArtifactSource => ({
        kind: 'packaged',
        path: candidate,
        label: 'packaged-webster',
      }),
    ),
    {
      kind: 'workspace',
      path: path.resolve(input.workspaceRoot ?? process.cwd(), 'packages/core/data/webster.db'),
      label: 'workspace-webster',
    },
    { kind: 'runtime', path: destination, label: 'runtime-webster' },
  ];
  const result = yield* Effect.result(
    ensureWebster({ destination, sources, refresh: input.refresh }),
  );
  if (Result.isFailure(result)) {
    yield* Console.error(
      `✗ webster.db — ${result.failure._tag}: data is not built/shipped, or the candidate was rejected.`,
    );
    yield* Console.error(
      '  Run bun run build:webster, then manna init. Binary distributions must ship data/webster.db and its licence/notice.',
    );
    return result;
  }
  let status = 'ready';
  if (result.success.activated.length > 0) status = 'installed and verified';
  yield* Console.log(`✓ webster.db (${status})`);
  return result;
});

const ensureWebster = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly refresh?: boolean;
}) =>
  CorpusSupply.use((supply) =>
    supply.ensure({ target: Target.webster(), refresh: input.refresh }),
  ).pipe(
    Effect.provide(CorpusSupply.layer.pipe(Layer.provide(layerNativeWebsterArtifacts(input)))),
  );

const json = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Emit JSON with query and entries'),
);
const query = Argument.String('word').pipe(Argument.optional);
const encodeLookup = Schema.encodeEffect(Schema.fromJsonString(WebsterLookup));
const encodeSearch = Schema.encodeEffect(
  Schema.fromJsonString(
    Schema.Struct({ query: Schema.String, entries: Schema.Array(WebsterEntry) }),
  ),
);

const print = Effect.fn('WebsterCommand.print')(function* (result: WebsterLookup, asJson: boolean) {
  if (asJson) return yield* Console.log(yield* encodeLookup(result));
  if (result.entries.length === 0)
    return yield* Console.log(`No Webster 1828 entry for "${result.query}".`);
  if (result.match === 'kjv-inflection')
    yield* Console.log(`${result.query} → ${result.key} (KJV inflection heuristic)`);
  if (result.match === 'kjv-alias')
    yield* Console.log(`${result.query} → ${result.key} (audited KJV alias)`);
  for (const entry of result.entries)
    yield* Console.log(`${entry.headword}\n${entry.definition}\n`);
});

const search = Command.make(
  'search',
  {
    words: Argument.String('words').pipe(Argument.variadic({ min: 1 })),
    limit: Flag.Int('limit').pipe(
      Flag.withDefault(20),
      Flag.withDescription('Maximum results, 1–100 (default 20)'),
    ),
    json,
  },
  (args) =>
    Effect.gen(function* () {
      const service = yield* WebsterService;
      const query = args.words.join(' ');
      const entries = yield* service.search(query, args.limit);
      if (args.json) return yield* Console.log(yield* encodeSearch({ query, entries }));
      yield* print({ query, entries, match: 'none', key: '' }, false);
    }),
);

export const webster = Command.make('webster', { query, json }, (args) =>
  Effect.gen(function* () {
    const service = yield* WebsterService;
    if (args.query._tag === 'None')
      return yield* Console.log(
        'Webster 1828\nUsage: manna webster <word> [--json]\n       manna webster search <definition words> [--limit 20] [--json]',
      );
    yield* print(yield* service.lookup(args.query.value), args.json);
  }),
).pipe(
  Command.withDescription('Look up Webster 1828 words or search their definitions'),
  Command.withSubcommands([search]),
);
