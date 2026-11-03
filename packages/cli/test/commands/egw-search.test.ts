import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Ref, Schema } from 'effect';
import {
  MODEL_FINGERPRINT,
  QueryEmbedder,
  SearchQuery,
  SearchResultJson,
  SearchService,
  VectorIndexBytes,
} from '@manna/core/search';
import {
  GOLDEN_QUERIES,
  GOLDEN_TOPIC_QUERY,
  GOLDEN_TOPIC_SLUG,
  goldenSearchLayer,
  goldenSearchSources,
  goldenTopicCatalog,
  goldenVector,
  goldenVectorIndexBytes,
} from '@manna/core/search/testing';
import { WikiService } from '@manna/core/wiki';

import { egwSearch } from '../../src/commands/egw/search.js';
import { SearchLayer, verifiedVectorIndex } from '../../src/commands/egw/search-layer.js';
import { WikiLayer } from '../../src/commands/wiki.js';
import { runCli } from '../lib/run-cli.js';

const embedder = Layer.succeed(
  QueryEmbedder,
  QueryEmbedder.of({
    fingerprint: MODEL_FINGERPRINT,
    embedQuery: (query: string) => Effect.succeed(goldenVector(query)),
    embedDocument: (text: string) => Effect.succeed(goldenVector(text)),
  }),
);

const fixtureSearch = goldenSearchLayer({
  index: Option.some(goldenVectorIndexBytes()),
  embedder,
});

const WORDY_QUERY = 'what happens at the close of probation';

const lexicalOnlySearch = goldenSearchLayer();

const brokenWiki = WikiService.Broken({
  operation: 'list',
  message: 'topics.db is not readable',
});

const cliJson = (args: readonly string[], layer = fixtureSearch) =>
  runCli(egwSearch, [...args, '--json'], {}).pipe(Effect.provideService(SearchLayer, layer));

const serviceJson = (query: SearchQuery, layer = fixtureSearch) =>
  Effect.flatMap(SearchService, (service) => service.query(query)).pipe(
    Effect.flatMap(Schema.encodeEffect(Schema.fromJsonString(SearchResultJson, { space: 2 }))),
    Effect.provide(layer),
  );

const resultOf = (query: SearchQuery, layer = fixtureSearch) =>
  Effect.flatMap(SearchService, (service) => service.query(query)).pipe(Effect.provide(layer));

const argsFor = (query: SearchQuery): readonly string[] => {
  const args: string[] = [query.text];
  if (Option.isSome(query.scope)) args.push('--scope', query.scope.value);
  if (Option.isSome(query.bookCode)) args.push('--book', query.bookCode.value);
  return args;
};

const withCliLimit = (query: SearchQuery): SearchQuery =>
  SearchQuery.make({
    text: query.text,
    scope: query.scope,
    bookCode: query.bookCode,
    limit: Option.some(20),
  });

describe('manna egw search — §9.7 golden query set', () => {
  for (const golden of GOLDEN_QUERIES) {
    it.scopedLive(`emits the service's bytes for "${golden.query.text}"`, () =>
      Effect.gen(function* () {
        const cli = yield* cliJson(argsFor(golden.query));
        const wire = yield* serviceJson(withCliLimit(golden.query));
        expect(cli.success).toBe(true);
        expect(cli.stdout).toBe(wire);
      }),
    );
  }

  it.scopedLive('answers the topic-shaped query out of the corpus alone', () =>
    Effect.gen(function* () {
      const query = SearchQuery.make({
        text: GOLDEN_TOPIC_QUERY,
        scope: Option.none(),
        bookCode: Option.none(),
        limit: Option.some(20),
      });
      const parsed = yield* resultOf(query);

      expect(parsed.paragraphs.length).toBeGreaterThan(0);
      expect(parsed.paragraphs.some((hit) => String(hit.paragraphId) === GOLDEN_TOPIC_SLUG)).toBe(
        false,
      );
    }),
  );

  it.scopedLive('prints the topic group as the /wiki route the app decodes', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(egwSearch, [GOLDEN_TOPIC_QUERY], {}).pipe(
        Effect.provideService(SearchLayer, fixtureSearch),
        Effect.provideService(WikiLayer, goldenTopicCatalog),
      );
      expect(cli.success).toBe(true);
      const lines = cli.stdout.split('\n');
      const bullets = lines.filter((line) => line.startsWith('  • '));
      expect(bullets.length).toBe(1);
      expect(bullets).toEqual([
        `  • What happens at the close of probation [catalog] — /wiki/${GOLDEN_TOPIC_SLUG}`,
      ]);
      expect(
        lines.some((line) => line.includes(`— /${GOLDEN_TOPIC_SLUG}`) && !line.includes('/wiki/')),
      ).toBe(false);
    }),
  );

  it.scopedLive('prints the ranking with no topic group when no wiki is installed', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(egwSearch, [GOLDEN_TOPIC_QUERY], {}).pipe(
        Effect.provideService(SearchLayer, fixtureSearch),
        Effect.provideService(WikiLayer, brokenWiki),
      );
      expect(cli.success).toBe(true);
      expect(cli.stdout.includes('Topics (')).toBe(false);
      expect(cli.stdout.includes(`Results for "${GOLDEN_TOPIC_QUERY}"`)).toBe(true);
    }),
  );

  it.scopedLive('routes each golden query the way §9.3 says it does', () =>
    Effect.gen(function* () {
      for (const golden of GOLDEN_QUERIES) {
        const parsed = yield* resultOf(withCliLimit(golden.query));
        expect({ query: golden.query.text, route: parsed.route }).toEqual({
          query: golden.query.text,
          route: golden.route,
        });
      }
    }),
  );
});

describe('manna egw search — §9.6 typed absence', () => {
  it.scopedLive('reports lexical-only rather than pretending the vector leg ran', () =>
    Effect.gen(function* () {
      const cli = yield* cliJson([WORDY_QUERY], lexicalOnlySearch);
      expect(cli.stdout).toContain('"_tag": "unavailable"');

      const parsed = yield* resultOf(
        SearchQuery.make({
          text: WORDY_QUERY,
          scope: Option.none(),
          bookCode: Option.none(),
          limit: Option.some(20),
        }),
        lexicalOnlySearch,
      );
      expect(parsed.vector._tag).toBe('unavailable');
      if (parsed.vector._tag !== 'unavailable') return;
      expect(parsed.vector.reason).toBe('absent');
      expect(parsed.paragraphs.length).toBeGreaterThan(0);
    }),
  );

  it.effect('says so in the human output too', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(egwSearch, ['sanctuary'], {}).pipe(
        Effect.provideService(SearchLayer, lexicalOnlySearch),
      );
      expect(cli.success).toBe(true);
      expect(cli.stdout).toContain('lexical only');
    }),
  );

  it.effect('still answers, and marks which leg each hit came from', () =>
    Effect.gen(function* () {
      const cli = yield* runCli(egwSearch, ['sanctuary'], {}).pipe(
        Effect.provideService(SearchLayer, lexicalOnlySearch),
      );
      expect(cli.stdout).toContain('text #1');
    }),
  );
});

describe('manna egw search — narrowings reach the service', () => {
  it.scopedLive('passes --scope through to the corpus scope', () =>
    Effect.gen(function* () {
      const cli = yield* cliJson(['the king of the north', '--scope', 'pioneer']);
      expect(cli.stdout).toContain('"scope": "pioneer"');
    }),
  );

  it.effect('rejects a scope the schema would refuse, at parse time', () =>
    Effect.gen(function* () {
      const cli = yield* cliJson(['sanctuary', '--scope', 'nonsense']);
      expect(cli.success).toBe(false);
    }),
  );
});

describe('manna egw search — the index is read once at startup (F8)', () => {
  const intactReads = Ref.makeUnsafe(0);
  const intactBytes = goldenVectorIndexBytes();
  const countingIntact = Layer.succeed(
    VectorIndexBytes,
    VectorIndexBytes.of({
      read: Ref.update(intactReads, (count) => count + 1).pipe(Effect.as(Option.some(intactBytes))),
    }),
  );

  const intactLayer = SearchService.Live.pipe(
    Layer.provide(goldenSearchSources),
    Layer.provide(verifiedVectorIndex('/fixture/vectors.bvi', countingIntact)),
    Layer.provide(embedder),
  );

  it.scopedLive('parses the artifact once across the gate and the service', () =>
    Effect.gen(function* () {
      const service = yield* SearchService;
      yield* service.query(
        SearchQuery.make({
          text: WORDY_QUERY,
          scope: Option.none(),
          bookCode: Option.none(),
          limit: Option.some(20),
        }),
      );
      for (const golden of GOLDEN_QUERIES) yield* service.query(golden.query);

      expect(yield* Ref.get(intactReads)).toBe(1);
    }).pipe(Effect.provide(intactLayer)),
  );

  const foreignReads = Ref.makeUnsafe(0);
  const foreignBytes = goldenVectorIndexBytes('some-other-model/512d');
  const countingForeign = Layer.succeed(
    VectorIndexBytes,
    VectorIndexBytes.of({
      read: Ref.update(foreignReads, (count) => count + 1).pipe(
        Effect.as(Option.some(foreignBytes)),
      ),
    }),
  );
  const foreignLayer = SearchService.Live.pipe(
    Layer.provide(goldenSearchSources),
    Layer.provide(verifiedVectorIndex('/fixture/vectors.bvi', countingForeign)),
    Layer.provide(embedder),
  );

  it.scopedLive('still refuses an index the shipped parser rejects, on one read', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(SearchService, (service) =>
        service.query(
          SearchQuery.make({
            text: WORDY_QUERY,
            scope: Option.none(),
            bookCode: Option.none(),
            limit: Option.some(20),
          }),
        ),
      );

      expect(result.vector._tag).toBe('unavailable');
      if (result.vector._tag !== 'unavailable') return;
      expect(result.vector.reason).toBe('fingerprint');
      expect(yield* Ref.get(foreignReads)).toBe(1);
    }).pipe(Effect.provide(foreignLayer)),
  );
});
