import { EGWApiClient, type Schemas as EGWSchemas } from '@manna/core/egw';
import {
  SearchQuery,
  SearchResultJson,
  SearchService,
  SearchTopicHit,
  SEARCH_TOPIC_LIMIT,
} from '@manna/core/search';
import { WikiService } from '@manna/core/wiki';
import { NO_FILTER, Reference } from '@manna/core/writings';
import { WritingsService } from '@manna/core/writings/service';
import { Cause, Console, Effect, Option, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';

import {
  encodeJson,
  formatLocalSearchResult,
  formatRemoteHit,
  formatSearchResult,
} from './format.js';
import { FullLayer } from './layers.js';
import { searchService } from './search-layer.js';
import { WikiLayer } from '../wiki.js';

const encodeSearchResult = Schema.encodeEffect(
  Schema.fromJsonString(SearchResultJson, { space: 2 }),
);

const searchTopics = (text: string): Effect.Effect<readonly SearchTopicHit[]> =>
  Effect.flatMap(WikiLayer, (layer) =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const summaries = yield* wiki.list({ query: text });
      return summaries.slice(0, SEARCH_TOPIC_LIMIT).map((summary) =>
        SearchTopicHit.make({
          slug: summary.slug,
          title: summary.title,
          status: summary.status,
        }),
      );
    }).pipe(
      Effect.provide(layer),
      Effect.catchCause((cause) =>
        Effect.as(
          Effect.logDebug('search.topics.unavailable').pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause) }),
          ),
          [] as readonly SearchTopicHit[],
        ),
      ),
    ),
  );

export const localSearch = (
  query: string,
  bookCode: Option.Option<string>,
  limit = 20,
  full = false,
) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;
    let publication;
    if (Option.isSome(bookCode)) {
      publication = Reference.publication((yield* service.publicationByCode(bookCode.value)).id);
    }
    const results = yield* service.search(query, {
      limit,
      publication,
    });

    if (results.length === 0) {
      yield* Console.log(`No local results found for "${query}".`);
      yield* Console.log('Try `manna egw search <query> --remote` to query the EGW API.');
      return;
    }

    let scope = '';
    if (Option.isSome(bookCode)) {
      scope = ` in ${bookCode.value}`;
    }
    yield* Console.log(`Local search results for "${query}"${scope} (${results.length}):\n`);
    for (const [i, r] of results.entries()) {
      yield* Console.log(formatLocalSearchResult(r, i, full));
    }
  });

const query = Argument.String('query').pipe(Argument.variadic());
const book = Flag.String('book').pipe(
  Flag.withDescription('Scope to a single book code (local search only)'),
  Flag.optional,
);
const limit = Flag.Int('limit').pipe(
  Flag.withDescription('Max results (default: 20)'),
  Flag.withDefault(20),
);
const remote = Flag.Boolean('remote').pipe(
  Flag.withDescription('Hit the EGW API instead of the local FTS index'),
  Flag.withDefault(false),
);
const json = Flag.Boolean('json').pipe(
  Flag.withDescription('Output raw JSON (especially useful with --remote)'),
  Flag.withDefault(false),
);
const full = Flag.Boolean('full').pipe(
  Flag.withDescription('Print each result’s full paragraph instead of a 200-character snippet'),
  Flag.withDefault(false),
);
const lang = Flag.String('lang').pipe(
  Flag.withDescription('Language code for --remote (default: en)'),
  Flag.withDefault('en'),
);
const scope = Flag.Literals('scope', ['egw', 'pioneer', 'all']).pipe(
  Flag.withDescription('Corpus scope: egw, pioneer, or all (default: egw)'),
  Flag.optional,
);
const apparatus = Flag.Boolean('apparatus').pipe(
  Flag.withDescription('Include dictionaries and topical/scripture indexes (excluded by default)'),
  Flag.withDefault(false),
);
const remoteSearch = (queryStr: string, lang: string, limit: number, json: boolean) =>
  Effect.gen(function* () {
    const client = yield* EGWApiClient;
    const params: EGWSchemas.SearchParams = { query: queryStr, lang, limit };
    const response = yield* client.search(params);

    if (json) {
      yield* Console.log(yield* encodeJson(response));
      return;
    }

    if (response.results.length === 0) {
      yield* Console.log(`No remote results for "${queryStr}".`);
      return;
    }

    yield* Console.log(
      `Remote search "${queryStr}" — ${response.total} total, showing ${response.results.length}:\n`,
    );
    for (const [i, hit] of response.results.entries()) {
      yield* Console.log(formatRemoteHit(hit, i));
    }
  }).pipe(Effect.provide(FullLayer));

export const egwSearch = Command.make(
  'search',
  { query, book, limit, remote, json, lang, scope, full, apparatus },
  (args) =>
    Effect.gen(function* () {
      const queryStr = args.query.join(' ').trim();
      if (queryStr.length === 0) {
        yield* Console.log(
          'Usage: manna egw search <query> [--book CODE] [--remote] [--limit N] [--full]',
        );
        return;
      }

      if (args.remote) {
        yield* remoteSearch(queryStr, args.lang, args.limit, args.json);
        return;
      }

      const result = yield* searchService(
        Effect.flatMap(SearchService, (service) =>
          service.query(
            SearchQuery.make({
              text: queryStr,
              scope: args.scope,
              bookCode: args.book,
              limit: Option.some(args.limit),
              filter: { ...NO_FILTER, excludeApparatus: !args.apparatus },
            }),
          ),
        ),
      );

      if (args.json) {
        yield* Console.log(yield* encodeSearchResult(result));
        return;
      }
      const topics = yield* searchTopics(queryStr);
      for (const line of formatSearchResult(result, args.full, topics)) {
        yield* Console.log(line);
      }
    }),
);
