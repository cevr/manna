import { Context, Effect, Layer, Option, Schema } from 'effect';
import * as SqlClient from 'effect/sql/SqlClient';
import type { SqlError } from 'effect/sql/SqlError';

import { readTopicsSchemaMajor } from '../corpus-supply/file-artifact.js';
import { TopicId } from '../topics/model.js';
import { TopicService, type TopicServiceApi } from '../topics/service.js';
import {
  AuthoredCore,
  BlocksJson,
  PhraseDictionary,
  PhraseDictionaryEntry,
  TOPICS_SCHEMA_MAJOR,
  TopicAlias,
  TopicEdge,
  TopicEdgeKind,
  TopicSlug,
  type TopicsUnavailableReason,
  WikiPage,
  type WikiSectionLineup,
  type WikiSectionsUnavailableReason,
  WikiPageSummary,
  type WikiListInput,
} from './model.js';
import {
  composeSections,
  emptySectionLineup,
  WikiSectionSources,
  type ComposeInput,
  type SectionSourcing,
} from './section-composer.js';

const WikiErrorCategory = Schema.Literals([
  'open-failed',
  'corrupt',
  'decode-failed',
  'query-failed',
]);
type WikiErrorCategory = typeof WikiErrorCategory.Type;

export class WikiUnavailableError extends Schema.TaggedError<WikiUnavailableError>()(
  'WikiUnavailableError',
  {
    operation: Schema.NonEmptyString,
    category: WikiErrorCategory,
    message: Schema.String,
  },
) {}

type WikiError = WikiUnavailableError;

export interface WikiServiceApi {
  readonly list: (input: WikiListInput) => Effect.Effect<readonly WikiPageSummary[], WikiError>;
  readonly topic: (slug: TopicSlug) => Effect.Effect<WikiPage, WikiError>;
  readonly dictionary: Effect.Effect<PhraseDictionary, WikiError>;
  readonly availability: Effect.Effect<Option.Option<TopicsUnavailableReason>, WikiError>;
}

interface TopicRow {
  readonly slug: string;
  readonly title: string;
  readonly thesis_ast: string;
  readonly body_ast: string;
}

interface AliasRow {
  readonly alias: string;
  readonly display: string;
  readonly canonical: number;
}

interface EdgeRow {
  readonly to_slug: string;
  readonly kind: string;
}

interface CatalogKeyRow {
  readonly catalog_id: string;
}

interface DictionaryRow {
  readonly alias: string;
  readonly display: string;
  readonly slug: string;
  readonly canonical: number;
}

interface MetaRow {
  readonly value: string;
}

const unavailable =
  (operation: string) =>
  (cause: SqlError): WikiUnavailableError =>
    WikiUnavailableError.make({
      operation,
      category: 'corrupt',
      message: cause.message,
    });

const decoded =
  <A>(operation: string, decode: (input: string) => Effect.Effect<A, Schema.SchemaError>) =>
  (input: string): Effect.Effect<A, WikiUnavailableError> =>
    decode(input).pipe(
      Effect.mapError((cause) =>
        WikiUnavailableError.make({
          operation,
          category: 'decode-failed',
          message: cause.message,
        }),
      ),
    );

const decodeBlocks = decoded('decode-blocks', Schema.decodeUnknownEffect(BlocksJson));
const decodeSlug = decoded('decode-slug', Schema.decodeUnknownEffect(TopicSlug));
const decodeEdgeKind = decoded('decode-edge-kind', Schema.decodeUnknownEffect(TopicEdgeKind));

const filterTerm = (input: WikiListInput, key: 'query' | 'letter'): Option.Option<string> =>
  Option.fromNullishOr(input[key]).pipe(
    Option.map((value) => value.replace(/[%_]/g, '').trim()),
    Option.filter((value) => value.length > 0),
  );

const summary = (row: TopicRow): Effect.Effect<WikiPageSummary, WikiError> =>
  decodeSlug(row.slug).pipe(
    Effect.map((slug) => WikiPageSummary.make({ slug, title: row.title, status: 'flagship' })),
  );

const catalogSummaries = (
  topics: TopicServiceApi,
  input: WikiListInput,
): Effect.Effect<readonly WikiPageSummary[], WikiError> =>
  topics.list(input).pipe(
    Effect.mapError((cause) =>
      WikiUnavailableError.make({
        operation: 'list-catalog',
        category: 'query-failed',
        message: cause.message,
      }),
    ),
    Effect.flatMap((found) =>
      Effect.forEach(found, (topic) =>
        decodeSlug(topic.id).pipe(
          Effect.map((slug) =>
            WikiPageSummary.make({ slug, title: topic.name, status: 'catalog' }),
          ),
        ),
      ),
    ),
  );

const mergeSummaries = (
  flagship: readonly WikiPageSummary[],
  catalog: readonly WikiPageSummary[],
): readonly WikiPageSummary[] => {
  const claimed = new Set(flagship.map((page) => String(page.slug)));
  return [...flagship, ...catalog.filter((page) => !claimed.has(String(page.slug)))];
};

const catalogPage = (
  sourcing: SectionSourcing,
  slug: TopicSlug,
  reason: Option.Option<TopicsUnavailableReason>,
  artifact: ArtifactReads,
): Effect.Effect<WikiPage> =>
  Effect.gen(function* () {
    const catalogId = Schema.decodeOption(TopicId)(String(slug));
    const title = yield* catalogTitle(sourcing, catalogId);
    return WikiPage.make({
      slug,
      title,
      status: 'catalog',
      core: Option.none(),
      sections: yield* composed(sourcing, {
        slug,
        title,
        core: Option.none(),
        catalogId,
        titleOf: artifact.titleOf,
        backlinksTo: artifact.backlinksTo,
      }),
      unavailable: reason,
      sectionsUnavailable: sectionsUnavailableFor(sourcing),
    });
  });

interface ArtifactReads {
  readonly titleOf: ComposeInput['titleOf'];
  readonly backlinksTo: ComposeInput['backlinksTo'];
}

const noArtifactReads: ArtifactReads = {
  titleOf: () => Effect.succeedNone,
  backlinksTo: () => Effect.succeed([]),
};

const catalogTitle = (
  sourcing: SectionSourcing,
  catalogId: Option.Option<TopicId>,
): Effect.Effect<string> => {
  if (sourcing._tag === 'not-wired' || Option.isNone(catalogId)) {
    return Effect.succeed(Option.getOrElse(catalogId, () => 'Topic'));
  }
  return sourcing.sources.catalog.topic(catalogId.value).pipe(
    Effect.map((detail) => detail.name),
    Effect.orElseSucceed(() => String(catalogId.value)),
  );
};

const composed = (
  sourcing: SectionSourcing,
  input: ComposeInput,
): Effect.Effect<WikiSectionLineup> => {
  if (sourcing._tag === 'not-wired') return Effect.succeed(emptySectionLineup());
  return composeSections(sourcing.sources, input);
};

const sectionsUnavailableFor = (
  sourcing: SectionSourcing,
): Option.Option<WikiSectionsUnavailableReason> => {
  if (sourcing._tag === 'not-wired') return Option.some('sources-not-wired');
  return Option.none();
};

const readSchemaMajor = (
  operation: string,
  sql: SqlClient.SqlClient,
): Effect.Effect<number, WikiError> =>
  sql<MetaRow>`SELECT value FROM meta WHERE key = 'schema_major' LIMIT 1`.pipe(
    Effect.mapError(unavailable(operation)),
    Effect.flatMap((rows) =>
      Option.fromNullishOr(rows[0]).pipe(
        Option.flatMap((row) => readTopicsSchemaMajor(row.value)),
        Effect.fromOption(() =>
          WikiUnavailableError.make({
            operation,
            category: 'corrupt',
            message: 'Topics Artifact has no readable schema_major',
          }),
        ),
      ),
    ),
  );

export class WikiService extends Context.Service<WikiService, WikiServiceApi>()(
  '@manna/core/wiki/WikiService',
) {
  static Live: Layer.Layer<
    WikiService,
    never,
    SqlClient.SqlClient | TopicService | WikiSectionSources
  > = Layer.effect(
    WikiService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const catalog = yield* TopicService;
      const sourcing = yield* WikiSectionSources;

      const gate = Effect.fn('WikiService.gate')(function* (operation: string) {
        const major = yield* readSchemaMajor(operation, sql);
        if (major > TOPICS_SCHEMA_MAJOR) {
          return Option.some<TopicsUnavailableReason>('schema-too-new');
        }
        return Option.none<TopicsUnavailableReason>();
      });

      const flagship = (input: WikiListInput): Effect.Effect<readonly TopicRow[], WikiError> =>
        Effect.gen(function* () {
          if (Option.isSome(yield* gate('list'))) return [];
          const query = filterTerm(input, 'query');
          const letter = filterTerm(input, 'letter').pipe(Option.map((value) => value.slice(0, 1)));
          if (Option.isSome(query)) {
            const like = `%${query.value}%`;
            return yield* sql<TopicRow>`
              SELECT slug, title, thesis_ast, body_ast
              FROM topics
              WHERE title LIKE ${like} OR slug LIKE ${like}
              ORDER BY position
            `;
          }
          if (Option.isSome(letter)) {
            return yield* sql<TopicRow>`
              SELECT slug, title, thesis_ast, body_ast
              FROM topics
              WHERE title LIKE ${`${letter.value}%`}
              ORDER BY position
            `;
          }
          return yield* sql<TopicRow>`
            SELECT slug, title, thesis_ast, body_ast FROM topics ORDER BY position
          `;
        }).pipe(
          Effect.catchIf(
            (cause): cause is SqlError => !Schema.is(WikiUnavailableError)(cause),
            (cause) => Effect.fail(unavailable('list')(cause)),
          ),
        );

      const list = Effect.fn('WikiService.list')((input: WikiListInput) =>
        Effect.gen(function* () {
          const rows = yield* flagship(input);
          const pages = yield* Effect.forEach(rows, summary);
          return mergeSummaries(pages, yield* catalogSummaries(catalog, input));
        }),
      );

      const titleOf = (slug: TopicSlug): Effect.Effect<Option.Option<string>> =>
        sql<{ readonly title: string }>`SELECT title FROM topics WHERE slug = ${slug} LIMIT 1`.pipe(
          Effect.map((rows) => Option.fromNullishOr(rows[0]).pipe(Option.map((row) => row.title))),
          Effect.orElseSucceed(() => Option.none<string>()),
        );

      const backlinksTo = (slug: TopicSlug): Effect.Effect<readonly TopicEdge[]> =>
        sql<{ readonly from_slug: string }>`
          SELECT from_slug FROM topic_edges WHERE to_slug = ${slug} ORDER BY position, from_slug
        `.pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              decodeSlug(row.from_slug).pipe(
                Effect.map((from) => TopicEdge.make({ slug: from, kind: 'backlink' })),
              ),
            ),
          ),
          Effect.orElseSucceed((): readonly TopicEdge[] => []),
        );

      const topic = Effect.fn('WikiService.topic')((slug: TopicSlug) =>
        Effect.gen(function* () {
          const refused = yield* gate('topic');
          if (Option.isSome(refused)) {
            return yield* catalogPage(sourcing, slug, refused, { titleOf, backlinksTo });
          }
          const rows = yield* sql<TopicRow>`
            SELECT slug, title, thesis_ast, body_ast FROM topics WHERE slug = ${slug} LIMIT 1
          `;
          const found = Option.fromNullishOr(rows[0]);
          if (Option.isNone(found)) {
            return yield* catalogPage(sourcing, slug, Option.none(), { titleOf, backlinksTo });
          }
          const aliases = yield* sql<AliasRow>`
            SELECT alias, display, canonical FROM topic_aliases WHERE slug = ${slug} ORDER BY alias
          `;
          const edges = yield* sql<EdgeRow>`
            SELECT to_slug, kind FROM topic_edges WHERE from_slug = ${slug}
            ORDER BY kind, position
          `;
          const keys = yield* sql<CatalogKeyRow>`
            SELECT catalog_id FROM topic_catalog_keys WHERE slug = ${slug} LIMIT 1
          `;
          const decodedSlug = yield* decodeSlug(found.value.slug);
          const core = AuthoredCore.make({
            thesis: yield* decodeBlocks(found.value.thesis_ast),
            body: yield* decodeBlocks(found.value.body_ast),
            aliases: aliases.map((row) =>
              TopicAlias.make({
                alias: row.alias,
                display: row.display,
                canonical: row.canonical === 1,
              }),
            ),
            edges: yield* Effect.forEach(edges, (row) =>
              Effect.gen(function* () {
                return TopicEdge.make({
                  slug: yield* decodeSlug(row.to_slug),
                  kind: yield* decodeEdgeKind(row.kind),
                });
              }),
            ),
          });
          return WikiPage.make({
            slug: decodedSlug,
            title: found.value.title,
            status: 'flagship',
            core: Option.some(core),
            sections: yield* composed(sourcing, {
              slug: decodedSlug,
              title: found.value.title,
              core: Option.some(core),
              catalogId: Option.fromNullishOr(keys[0]).pipe(
                Option.flatMap((row) => Schema.decodeOption(TopicId)(row.catalog_id)),
              ),
              titleOf,
              backlinksTo,
            }),
            unavailable: Option.none(),
            sectionsUnavailable: sectionsUnavailableFor(sourcing),
          });
        }).pipe(
          Effect.catchIf(
            (cause): cause is SqlError => !Schema.is(WikiUnavailableError)(cause),
            (cause) => Effect.fail(unavailable('topic')(cause)),
          ),
        ),
      );

      const dictionary = Effect.fn('WikiService.dictionary')(function* () {
        const refused = yield* gate('dictionary');
        if (Option.isSome(refused)) {
          return PhraseDictionary.make({ entries: [], unavailable: refused });
        }
        const rows = yield* sql<DictionaryRow>`
          SELECT alias, display, slug, canonical FROM topic_aliases ORDER BY alias
        `.pipe(Effect.mapError(unavailable('dictionary')));
        return PhraseDictionary.make({
          entries: yield* Effect.forEach(rows, (row) =>
            decodeSlug(row.slug).pipe(
              Effect.map((slug) =>
                PhraseDictionaryEntry.make({
                  alias: row.alias,
                  display: row.display,
                  slug,
                  canonical: row.canonical === 1,
                }),
              ),
            ),
          ),
          unavailable: Option.none(),
        });
      });

      const availability = gate('availability');

      return WikiService.of({ list, topic, dictionary: dictionary(), availability });
    }),
  );

  static Broken = (input: {
    readonly operation: string;
    readonly message: string;
  }): Layer.Layer<WikiService> => {
    const failure = WikiUnavailableError.make({
      operation: input.operation,
      category: 'open-failed',
      message: input.message,
    });
    return Layer.succeed(
      WikiService,
      WikiService.of({
        list: () => Effect.fail(failure),
        topic: () => Effect.fail(failure),
        dictionary: Effect.fail(failure),
        availability: Effect.fail(failure),
      }),
    );
  };

  static Absent: Layer.Layer<WikiService, never, TopicService | WikiSectionSources> = Layer.effect(
    WikiService,
    Effect.gen(function* () {
      const catalog = yield* TopicService;
      const sourcing = yield* WikiSectionSources;
      return WikiService.of({
        list: (input) => catalogSummaries(catalog, input),
        topic: (slug) =>
          catalogPage(sourcing, slug, Option.some('artifact-not-installed'), noArtifactReads),
        dictionary: Effect.succeed(
          PhraseDictionary.make({
            entries: [],
            unavailable: Option.some('artifact-not-installed'),
          }),
        ),
        availability: Effect.succeedSome('artifact-not-installed'),
      });
    }),
  );
}
