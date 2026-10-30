/**
 * Hymnal Service
 *
 * The portable hymnal capability. Host adapters provide storage layers.
 */

import {
  Context,
  Effect,
  Layer,
  Match,
  Option,
  Predicate,
  Record as Records,
  Schema,
} from 'effect';

import type { CategoryId, HymnId } from '../types/ids.js';
import type {
  Category,
  Hymn,
  HymnIndexes,
  IndexPassage,
  IndexRef,
  PassageQuery,
} from './schemas.js';
import { HymnSummary, hymnFirstLine, passageReaches } from './schemas.js';

export class HymnalError extends Schema.TaggedError<HymnalError>()('HymnalError', {
  cause: Schema.Unknown,
  operation: Schema.String,
  message: Schema.optional(Schema.String),
}) {}

export class HymnNotFoundError extends Schema.TaggedError<HymnNotFoundError>()(
  'HymnNotFoundError',
  { id: Schema.Finite },
) {}

/**
 * The failure of every index method over a database that lacks index tables:
 * one built before them (`absent` holds every table) or one with only some.
 * `manna init` replaces such a database, so the message names it. A read or
 * decode failure of tables that are present is a `HymnalError`, never this.
 */
export class HymnalIndexesMissing extends Schema.TaggedError<HymnalIndexesMissing>()(
  'HymnalIndexesMissing',
  {
    /** The index tables the database lacks. */
    absent: Schema.Array(Schema.String),
    /** Whether the database holds some index tables, so it was built part way. */
    partial: Schema.Boolean,
    message: Schema.String,
  },
) {}

/** The tables a database holds the indexes in: the index methods read every one. */
export const INDEX_TABLES = [
  'index_files',
  'index_topics',
  'index_topic_refs',
  'index_passages',
  'index_passage_verses',
  'index_passage_see',
  'index_people',
  'index_person_hymns',
  'index_tunes',
  'index_tune_hymns',
  'index_metres',
  'index_metre_tune_hymns',
] as const;

/**
 * The `HymnalIndexesMissing` for a database lacking `absent`, with the message a user reads.
 * `override` is the path `HYMNAL_DB_PATH` names when it is not `~/.bible/hymnal.db`:
 * `manna init` replaces only that default file, so the message names the file to replace.
 */
export const indexesMissing = (
  absent: readonly string[] = INDEX_TABLES,
  override: Option.Option<string> = Option.none(),
) => {
  const partial = absent.length < INDEX_TABLES.length;
  const lacks = Match.value(partial).pipe(
    Match.when(true, () => `lacks the index tables ${absent.join(', ')}`),
    Match.orElse(() => 'has no indexes'),
  );
  const message = Option.match(override, {
    onNone: () => `this hymnal.db ${lacks}; run manna init to replace it`,
    onSome: (path) =>
      `the hymnal.db at ${path} ${lacks}; replace that file, since manna init refreshes only ~/.bible/hymnal.db`,
  });
  return HymnalIndexesMissing.make({ absent, partial, message });
};

/** The hymns (1-695) the back-matter indexes give numbers for. */
export const isIndexedHymn = (id: number) => Number.isInteger(id) && id >= 1 && id <= 695;

const summarizeHymn = (hymn: Hymn): HymnSummary =>
  HymnSummary.make({
    id: hymn.id,
    name: hymn.name,
    category: hymn.category,
    firstLine: hymnFirstLine(hymn.verses),
  });

interface HymnalServiceApi {
  readonly getHymn: (id: HymnId) => Effect.Effect<Hymn, HymnalError | HymnNotFoundError>;
  readonly getCategories: Effect.Effect<readonly Category[], HymnalError>;
  readonly getHymnsByCategory: (
    categoryId: CategoryId,
  ) => Effect.Effect<readonly HymnSummary[], HymnalError>;
  readonly searchHymns: (
    query: string,
    limit?: number,
  ) => Effect.Effect<readonly HymnSummary[], HymnalError>;
  /** A hymn's topics, passages, `see` hymns, tunes, metres, authors and composers. */
  readonly getHymnIndexes: (
    id: HymnId,
  ) => Effect.Effect<HymnIndexes, HymnalError | HymnalIndexesMissing | HymnNotFoundError>;
  /** A topic's hymns in printed order; an unknown topic has none. */
  readonly getTopicHymns: (
    name: string,
  ) => Effect.Effect<readonly IndexRef[], HymnalError | HymnalIndexesMissing>;
  /** A tune's hymns in printed order; an unknown tune has none. */
  readonly getTuneHymns: (
    name: string,
  ) => Effect.Effect<readonly IndexRef[], HymnalError | HymnalIndexesMissing>;
  /** A metre's hymns, its tunes' hymns in printed order; an unknown metre has none. */
  readonly getMetreHymns: (
    metre: string,
  ) => Effect.Effect<readonly IndexRef[], HymnalError | HymnalIndexesMissing>;
  /** The scriptural index's hymns that reach a chapter or a verse, in printed order. */
  readonly getPassageHymns: (
    query: PassageQuery,
  ) => Effect.Effect<readonly IndexRef[], HymnalError | HymnalIndexesMissing>;
}

/** What `HymnalService.Test` answers the index methods from, keyed by name. */
export interface HymnalTestIndexes {
  readonly hymns?: readonly HymnIndexes[];
  readonly topics?: Readonly<Record<string, readonly IndexRef[]>>;
  readonly tunes?: Readonly<Record<string, readonly IndexRef[]>>;
  readonly metres?: Readonly<Record<string, readonly IndexRef[]>>;
  /** The scriptural index's entries in printed order. */
  readonly passages?: readonly { readonly passage: IndexPassage; readonly ref: IndexRef }[];
}

const emptyIndexes = (number: number): HymnIndexes => ({
  number,
  topics: [],
  passages: [],
  see: [],
  tunes: [],
  metres: [],
  authors: [],
  composers: [],
});

const testIndexMethods = (config: { readonly indexes?: HymnalTestIndexes }) => {
  const { indexes } = config;
  if (Predicate.isUndefined(indexes)) {
    const missing = () => Effect.fail(indexesMissing());
    return {
      getHymnIndexes: (id: HymnId) => {
        if (isIndexedHymn(id)) return missing();
        return Effect.fail(HymnNotFoundError.make({ id }));
      },
      getTopicHymns: missing,
      getTuneHymns: missing,
      getMetreHymns: missing,
      getPassageHymns: missing,
    };
  }
  const named =
    (table: Readonly<Record<string, readonly IndexRef[]>> = {}) =>
    (name: string): Effect.Effect<readonly IndexRef[]> =>
      Effect.succeed(Option.getOrElse(Records.get(table, name), () => []));
  return {
    getHymnIndexes: (id: HymnId) => {
      if (!isIndexedHymn(id)) return Effect.fail(HymnNotFoundError.make({ id }));
      const found = (indexes.hymns ?? []).find((entry) => entry.number === id);
      return Effect.succeed(found ?? emptyIndexes(id));
    },
    getTopicHymns: named(indexes.topics),
    getTuneHymns: named(indexes.tunes),
    getMetreHymns: named(indexes.metres),
    getPassageHymns: (query: PassageQuery) =>
      Effect.succeed(
        (indexes.passages ?? [])
          .filter((entry) => passageReaches(entry.passage, query))
          .map((entry) => entry.ref),
      ),
  };
};

export class HymnalService extends Context.Service<HymnalService, HymnalServiceApi>()(
  '@manna/core/hymnal/HymnalService',
) {
  /** With no `indexes`, the index methods fail as over a database built without them. */
  static Test = (
    config: {
      hymns?: readonly Hymn[];
      categories?: readonly Category[];
      indexes?: HymnalTestIndexes;
    } = {},
  ): Layer.Layer<HymnalService> => {
    const hymns = config.hymns ?? [];
    const categories = config.categories ?? [];

    return Layer.succeed(
      HymnalService,
      HymnalService.of({
        getHymn: (id) => {
          const hymn = hymns.find((candidate) => candidate.id === id);
          if (Predicate.isUndefined(hymn)) return Effect.fail(HymnNotFoundError.make({ id }));
          return Effect.succeed(hymn);
        },
        getCategories: Effect.succeed(categories),
        getHymnsByCategory: (categoryId) =>
          Effect.succeed(hymns.filter((hymn) => hymn.categoryId === categoryId).map(summarizeHymn)),
        searchHymns: (query, limit = 20) => {
          const normalizedQuery = query.toLowerCase();
          const matches = hymns.filter(
            (hymn) =>
              hymn.name.toLowerCase().includes(normalizedQuery) ||
              hymn.verses.some((verse) => verse.text.toLowerCase().includes(normalizedQuery)),
          );
          let limited = matches;
          if (limit >= 0) limited = matches.slice(0, limit);
          return Effect.succeed(limited.map(summarizeHymn));
        },
        ...testIndexMethods(config),
      }),
    );
  };
}
