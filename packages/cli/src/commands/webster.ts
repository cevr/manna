import { WebsterEntry, WebsterLookup, WebsterService } from '@manna/core/webster';
import { Console, Effect, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';

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
