import { parseBibleQuery, type VerseReference } from '@manna/core/bible';
import {
  lookupInputOf,
  LookupResultJson,
  LookupService,
  matchRun,
  PhraseAutomaton,
  PhraseSpansJson,
  TopicSlug,
  type LookupInput,
  type LookupResult,
  WikiPageJson,
  WikiPageSummaryJson,
  WikiService,
  TopicsUnavailableReason,
  type PhraseSpan,
  type WikiPage,
  type WikiPageSummary,
  type WikiSection,
} from '@manna/core/wiki';
import { layerBunLookup, layerBunWithCatalog } from '@manna/core/wiki/bun';
import {
  Config,
  Console,
  Context,
  Effect,
  Layer,
  Option,
  Path,
  Schema,
  SchemaGetter,
} from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { BunServices } from '@effect/platform-bun';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const encodeJson = Schema.encodeUnknownEffect(JsonString);

const encodePage = Schema.encodeEffect(WikiPageJson);

export const WikiTopicsJson = Schema.Struct({
  topics: WikiPageSummaryJson,
  count: Schema.Int,
  unavailable: Schema.OptionFromNullOr(TopicsUnavailableReason),
});

const encodeTopics = Schema.encodeEffect(WikiTopicsJson);

const json = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Emit stable JSON'),
);

const query = Flag.String('query').pipe(
  Flag.optional,
  Flag.withDescription('Filter pages by title or slug'),
);

const installedWikiLayer = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    return layerBunWithCatalog({
      topics: path.join(home, '.bible', 'topics.db'),
      bible: path.join(home, '.bible', 'bible.db'),
      writings: path.join(home, '.bible', 'egw-paragraphs.db'),
    });
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
).pipe(Layer.provide(BunServices.layer));

export class WikiLayer extends Context.Reference<Layer.Layer<WikiService>>(
  '@manna/cli/wiki/WikiLayer',
  { defaultValue: () => installedWikiLayer },
) {}

const wikiService = <A, E>(use: Effect.Effect<A, E, WikiService>): Effect.Effect<A, E> =>
  Effect.flatMap(WikiLayer, (layer) => use.pipe(Effect.provide(layer)));

export const topicsJson = (result: {
  readonly topics: readonly WikiPageSummary[];
  readonly unavailable: Option.Option<TopicsUnavailableReason>;
}): Effect.Effect<typeof WikiTopicsJson.Encoded, Schema.SchemaError> =>
  encodeTopics({
    topics: result.topics,
    count: result.topics.length,
    unavailable: result.unavailable,
  });

const wikiTopics = Command.make('topics', { query, json }, (args) =>
  Effect.gen(function* () {
    const result = yield* wikiService(
      Effect.gen(function* () {
        const wiki = yield* WikiService;
        const topics = yield* wiki.list({ query: Option.getOrUndefined(args.query) });
        return { topics, unavailable: yield* wiki.availability };
      }),
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson(yield* topicsJson(result)));
      return;
    }
    if (result.topics.length === 0) {
      const reason = Option.getOrElse(result.unavailable, () => 'no approved pages');
      yield* Console.log(`No topics (${reason})`);
      return;
    }
    for (const topic of result.topics) {
      yield* Console.log(`${topic.slug}  ${topic.title}  [${topic.status}]`);
    }
    yield* Console.log(``);
    const flagship = result.topics.filter((topic) => topic.status === 'flagship').length;
    const catalog = result.topics.length - flagship;
    yield* Console.log(
      `${String(flagship)} flagship, ${String(catalog)} catalog${Option.match(result.unavailable, {
        onNone: () => '',
        onSome: (reason) => ` (authored cores unavailable: ${reason})`,
      })}`,
    );
  }).pipe(Effect.provide(BunServices.layer)),
);

const openMarker = (defaultOpen: boolean): string => {
  if (defaultOpen) return '  (open)';
  return '';
};

const missingBookCount = (section: WikiSection): number => {
  if (section._tag !== 'egw-statements' && section._tag !== 'pioneer-witnesses') return 0;
  return section.missingBooks.length;
};

const missingMarker = (section: WikiSection): string => {
  const missing = missingBookCount(section);
  if (missing === 0) return '';
  return `  +${String(missing)} to get`;
};

export const topicJson = (page: WikiPage): Effect.Effect<WikiPageJson, Schema.SchemaError> =>
  encodePage(page);

const slug = Argument.String('slug').pipe(Argument.withDescription('The topic page slug'));

const wikiTopic = Command.make('topic', { slug, json }, (args) =>
  Effect.gen(function* () {
    const page = yield* wikiService(
      Effect.gen(function* () {
        const wiki = yield* WikiService;
        return yield* wiki.topic(yield* Schema.decodeEffect(TopicSlug)(args.slug));
      }),
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson(yield* topicJson(page)));
      return;
    }
    yield* Console.log(`${page.title}  [${page.status}]`);
    yield* Option.match(page.sectionsUnavailable, {
      onNone: () => Effect.void,
      onSome: (reason) => Console.log(`sections unavailable: ${reason}`),
    });
    yield* Console.log(``);
    for (const section of page.sections) {
      yield* Console.log(
        `## ${section._tag}  ${String(section.items.length)}/${String(section.total)}${openMarker(
          section.defaultOpen,
        )}${missingMarker(section)}`,
      );
    }
  }).pipe(Effect.provide(BunServices.layer)),
);

const matchesJson = (
  spans: readonly PhraseSpan[],
): Effect.Effect<PhraseSpansJson, Schema.SchemaError> =>
  Schema.encodeEffect(PhraseSpansJson)(spans);

const text = Argument.String('text').pipe(
  Argument.withDescription('The text to match against the phrase dictionary'),
);

const wikiMatches = Command.make('matches', { text, json }, (args) =>
  Effect.gen(function* () {
    const dictionary = yield* wikiService(Effect.flatMap(WikiService, (wiki) => wiki.dictionary));
    const spans = matchRun(PhraseAutomaton.make(dictionary), args.text);

    if (args.json) {
      yield* Console.log(yield* encodeJson(yield* matchesJson(spans)));
      return;
    }
    if (spans.length === 0) {
      const reason = Option.getOrElse(dictionary.unavailable, () => 'no phrases matched');
      yield* Console.log(`No matches (${reason})`);
      return;
    }
    for (const span of spans) {
      yield* Console.log(
        `${String(span.start)}-${String(span.end)}  ${span.slug}  ${args.text.slice(
          span.start,
          span.end,
        )}`,
      );
    }
  }).pipe(Effect.provide(BunServices.layer)),
);

const installedLookupLayer = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    return layerBunLookup({
      topics: path.join(home, '.bible', 'topics.db'),
      bible: path.join(home, '.bible', 'bible.db'),
      writings: path.join(home, '.bible', 'egw-paragraphs.db'),
    });
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
).pipe(Layer.provide(BunServices.layer));

export class LookupLayer extends Context.Reference<Layer.Layer<LookupService>>(
  '@manna/cli/wiki/LookupLayer',
  { defaultValue: () => installedLookupLayer },
) {}

const lookupService = <A, E>(use: Effect.Effect<A, E, LookupService>): Effect.Effect<A, E> =>
  Effect.flatMap(LookupLayer, (layer) => use.pipe(Effect.provide(layer)));

const lookupJson = (result: LookupResult): Effect.Effect<LookupResultJson, Schema.SchemaError> =>
  Schema.encodeEffect(LookupResultJson)(result);

const lookupText = Argument.String('text').pipe(
  Argument.withDescription('The selected text to look up'),
);

class NotOneVerseContextError extends Schema.TaggedError<NotOneVerseContextError>()(
  'NotOneVerseContextError',
  { reference: Schema.String },
) {
  override get message(): string {
    return `Not a single-verse --context: "${this.reference}". Try a form like "Dan 8:13".`;
  }
}

const contextFlag = Flag.String('context').pipe(
  Flag.optional,
  Flag.withDescription('The verse the selection came from, e.g. "Dan 8:13"'),
);

const lookupContext = (
  input: Option.Option<string>,
): Effect.Effect<Option.Option<VerseReference>, NotOneVerseContextError> =>
  Option.match(input, {
    onNone: () => Effect.succeedNone,
    onSome: (raw) => {
      const parsed = parseBibleQuery(raw);
      if (parsed._tag !== 'single') {
        return Effect.fail(NotOneVerseContextError.make({ reference: raw }));
      }
      return Effect.succeedSome(parsed.ref);
    },
  });

class EmptySelectionError extends Schema.TaggedError<EmptySelectionError>()('EmptySelectionError', {
  text: Schema.String,
}) {
  override get message(): string {
    return `Nothing to look up: the text argument is empty.`;
  }
}

export const lookupInput = (args: {
  readonly text: string;
  readonly context: Option.Option<string>;
}): Effect.Effect<LookupInput, NotOneVerseContextError | EmptySelectionError> =>
  Effect.flatMap(lookupContext(args.context), (context) =>
    Effect.fromOption(lookupInputOf({ text: args.text, context }), () =>
      EmptySelectionError.make({ text: args.text }),
    ),
  );

const wikiLookup = Command.make(
  'lookup',
  { text: lookupText, context: contextFlag, json },
  (args) =>
    Effect.gen(function* () {
      const input = yield* lookupInput(args);
      const result = yield* lookupService(
        Effect.flatMap(LookupService, (service) => service.resolve(input)),
      );

      if (args.json) {
        yield* Console.log(yield* encodeJson(yield* lookupJson(result)));
        return;
      }

      yield* Console.log(result.text);
      if (result.lonePeek) yield* Console.log('(lone topic hit — peek card)');
      yield* Console.log(``);

      yield* Console.log(`## topics  ${String(result.topics.length)}`);
      for (const match of result.topics) {
        yield* Console.log(`  ${match.slug}  ${match.display}  [${match.kind}]`);
      }

      yield* Console.log(`## strongs  ${String(result.strongs.length)}`);
      for (const hit of result.strongs) {
        yield* Console.log(
          `  ${hit.word}  ${Option.match(hit.entry, {
            onNone: () => '(no lexicon entry)',
            onSome: (entry) => `${entry.number}  ${entry.lemma}`,
          })}`,
        );
      }

      yield* Console.log(`## verses  ${String(result.verses.length)}`);
      for (const hit of result.verses) {
        yield* Console.log(`  ${hit.label}  ${hit.text}`);
      }

      yield* Console.log(`## writings  ${String(result.writings.length)}`);
      for (const hit of result.writings) {
        yield* Console.log(`  ${hit.refcode}  ${hit.bookTitle}`);
      }

      yield* Console.log(`## catalog  ${String(result.catalog.length)}`);
      for (const match of result.catalog) {
        yield* Console.log(`  ${match.slug}  ${match.name}`);
      }
    }).pipe(Effect.provide(BunServices.layer)),
);

export const wiki = Command.make('wiki', {}, () =>
  Console.log(
    `Usage: manna wiki topics [--query <q>] [--json]\n` +
      `       manna wiki topic <slug> [--json]\n` +
      `       manna wiki matches "<text>" [--json]\n` +
      `       manna wiki lookup "<text>" [--context "<reference>"] [--json]`,
  ),
).pipe(Command.withSubcommands([wikiTopics, wikiTopic, wikiMatches, wikiLookup]));
