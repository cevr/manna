import { TopicDetail, TopicId, TopicService } from '@manna/core/topics';
import {
  BlocksJson,
  LookupInput,
  LookupResultJson,
  LookupService,
  matchRun,
  normalizeAlias,
  ParagraphBlock,
  PhraseAutomaton,
  PhraseSpansJson,
  TextInline,
  WikiPageJson,
  WikiSectionSources,
  WikiService,
  topicSlug,
  type WikiPage,
} from '@manna/core/wiki';
import {
  DANIEL_8_9,
  LOOKUP_ADAPTER_EMPTY_TEXTS,
  LOOKUP_ADAPTER_INPUT,
  LOOKUP_ADAPTER_INPUT_NO_CONTEXT,
  LOOKUP_ADAPTER_SELECTION,
  LOOKUP_ADAPTER_TEXTS,
  PHRASE_FIXTURE_DICTIONARY,
  WIKI_ARTIFACT_DDL,
  WIKI_LOOKUP_FIXTURE_LAYER,
  WIKI_PAGE_FIXTURE,
  WIKI_PAGE_FIXTURE_IDENTITIES,
  WIKI_PAGE_FIXTURE_CATALOG,
  WIKI_PAGE_FIXTURE_PAGE,
  wikiPageFixtureRows,
  WIKI_PAGE_FIXTURE_SOURCES,
  wikiSectionIdentities,
  layerBunOrAbsent as layerBun,
} from '@manna/core/wiki/testing';
import { BunFileSystem } from '@effect/platform-bun';
import { Database } from 'bun:sqlite';
import { Effect, Exit, FileSystem, Layer, Option, Schema, SchemaGetter } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  LookupLayer,
  WikiLayer,
  WikiTopicsJson,
  lookupInput,
  topicJson,
  topicsJson,
  wiki,
} from '../../src/commands/wiki.js';
import { runCli } from '../lib/run-cli.js';

const catalog = TopicService.Test([
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)('sanctuary'),
    name: 'Sanctuary',
    alternativeNames: [],
    sections: [],
  }),
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)('grace'),
    name: 'Grace',
    alternativeNames: [],
    sections: [],
  }),
]);

const listing = Effect.gen(function* () {
  const wiki = yield* WikiService;
  return { topics: yield* wiki.list({}), unavailable: yield* wiki.availability };
});

describe('manna wiki topics --json', () => {
  it.effect('reports catalog entries and the absence reason with no artifact', () =>
    Effect.gen(function* () {
      const payload = yield* topicsJson(yield* listing);

      expect(payload.unavailable).toBe('artifact-not-installed');
      expect(payload.count).toBe(2);
      expect(
        payload.topics.map((topic) => ({
          slug: topic.slug,
          title: topic.title,
          status: topic.status,
        })),
      ).toEqual([
        { slug: 'sanctuary', title: 'Sanctuary', status: 'catalog' },
        { slug: 'grace', title: 'Grace', status: 'catalog' },
      ]);
    }).pipe(
      Effect.provide(
        WikiService.Absent.pipe(Layer.provide(catalog), Layer.provide(WikiSectionSources.NotWired)),
      ),
    ),
  );

  it.effect('reports a null absence when the artifact is readable', () =>
    Effect.gen(function* () {
      const payload = yield* topicsJson({
        topics: yield* Effect.succeed([]),
        unavailable: Option.none(),
      });
      expect(payload.unavailable).toBeNull();
    }),
  );

  it.effect('marks an authored page flagship and leaves the rest catalog', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      expect(page.status).toBe('catalog');
      expect(page.unavailable).toEqual(Option.some('artifact-not-installed'));
    }).pipe(
      Effect.provide(
        WikiService.Absent.pipe(Layer.provide(catalog), Layer.provide(WikiSectionSources.NotWired)),
      ),
    ),
  );

  it.effect('emits the page through the core schema, not a CLI-local projection', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));

      expect(yield* topicJson(page)).toEqual(yield* Schema.encodeEffect(WikiPageJson)(page));

      const emitted = yield* topicJson(page);
      expect(emitted.sections.map((section) => section._tag)).toEqual([
        'key-verses',
        'egw-statements',
        'commentary',
        'pioneer-witnesses',
        'cross-references',
        'related-topics',
      ]);
    }).pipe(
      Effect.provide(
        WikiService.Absent.pipe(Layer.provide(catalog), Layer.provide(WikiSectionSources.NotWired)),
      ),
    ),
  );
});

const fixtureWiki: Layer.Layer<WikiService> = WikiService.Absent.pipe(
  Layer.provide(catalog),
  Layer.provide(WikiSectionSources.NotWired),
);

const runWiki = (args: readonly string[]) =>
  runCli(wiki, [...args], {}).pipe(Effect.provideService(WikiLayer, fixtureWiki));

const JsonText = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const serialize = Schema.encodeUnknownEffect(JsonText);

const pageWireText = (page: WikiPage): Effect.Effect<string, Schema.SchemaError> =>
  Effect.flatMap(Schema.encodeEffect(WikiPageJson)(page), serialize);

const composeTopicPage = (layer: Layer.Layer<WikiService>, slug: string) =>
  Effect.flatMap(WikiService, (service) => service.topic(topicSlug(slug))).pipe(
    Effect.provide(layer),
  );

const composeDictionary = (layer: Layer.Layer<WikiService>) =>
  Effect.flatMap(WikiService, (service) => service.dictionary).pipe(Effect.provide(layer));

const composeTopicsEnvelope = (layer: Layer.Layer<WikiService>) =>
  Effect.gen(function* () {
    const service = yield* WikiService;
    return {
      topics: yield* service.list({}),
      unavailable: yield* service.availability,
    };
  }).pipe(Effect.provide(layer));

describe('manna wiki --json stdout', () => {
  it.effect('prints exactly the core codec encoding of the service result', () =>
    Effect.gen(function* () {
      const result = yield* runWiki(['topic', 'sanctuary', '--json']);
      expect(result.success).toBe(true);

      const page = yield* composeTopicPage(fixtureWiki, 'sanctuary');

      expect(result.stdout).toBe(yield* pageWireText(page));
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.stdout).toContain('"key-verses"');
      expect(result.stdout).toContain('"related-topics"');
    }),
  );

  it.effect('prints the listing envelope through the listing schema', () =>
    Effect.gen(function* () {
      const result = yield* runWiki(['topics', '--json']);
      expect(result.success).toBe(true);
      expect(result.stdout).toBe(
        yield* serialize(yield* topicsJson(yield* composeTopicsEnvelope(fixtureWiki))),
      );
      expect(result.stdout).toContain('"artifact-not-installed"');
    }),
  );

  it.effect('refuses a listing reason outside the closed union', () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownEffect(WikiTopicsJson);
      expect(
        Exit.isFailure(yield* Effect.exit(decode({ topics: [], count: 0, unavailable: 'bogus' }))),
      ).toBe(true);
      const accepted = yield* decode({
        topics: [],
        count: 0,
        unavailable: 'artifact-not-installed',
      });
      expect(accepted.unavailable).toEqual(Option.some('artifact-not-installed'));
    }),
  );
});

const writeDictionaryArtifact = (file: string): string => {
  const database = new Database(file, { create: true });
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
  `);
  const insert = database.prepare(
    'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?, ?, ?, ?)',
  );
  for (const entry of PHRASE_FIXTURE_DICTIONARY.entries) {
    insert.run(entry.alias, entry.display, entry.slug, 1);
  }
  database.close();
  return file;
};

const dictionaryWiki = (file: string): Layer.Layer<WikiService> =>
  layerBun(file).pipe(
    Layer.provide(catalog),
    Layer.provide(WikiSectionSources.NotWired),
    Layer.provide(BunFileSystem.layer),
  );

describe('manna wiki matches', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('returns the fixture spans for the Daniel 8:9 acceptance workflow', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-matches-' })
        .pipe(Effect.orDie);
      const file = writeDictionaryArtifact(`${directory}/topics.db`);

      const result = yield* runCli(wiki, ['matches', DANIEL_8_9, '--json'], {}).pipe(
        Effect.provideService(WikiLayer, dictionaryWiki(file)),
      );
      expect(result.success).toBe(true);

      const expected = yield* serialize(
        yield* Schema.encodeEffect(PhraseSpansJson)(
          matchRun(PhraseAutomaton.make(PHRASE_FIXTURE_DICTIONARY), DANIEL_8_9),
        ),
      );
      expect(result.stdout).toBe(expected);

      const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(PhraseSpansJson))(
        result.stdout,
      );
      expect(
        decoded.map((span) => ({
          start: span.start,
          end: span.end,
          slug: String(span.slug),
          alias: span.alias,
        })),
      ).toEqual([{ start: 36, end: 47, slug: 'little-horn', alias: 'little horn' }]);
    }));

  test('reports the typed absence when no artifact is installed', () =>
    Effect.gen(function* () {
      const result = yield* runCli(wiki, ['matches', DANIEL_8_9], {}).pipe(
        Effect.provideService(WikiLayer, fixtureWiki),
      );
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('artifact-not-installed');
    }));
});

const TWENTY_THREE_HUNDRED = {
  slug: '2300-days',
  title: '2300 Days / 1844',
  aliases: [
    '2300 days',
    'the 2300',
    '1844',
    'twenty-three hundred days',
    'two thousand and three hundred days',
    'tenth day of the seventh month',
  ],
} as const;

const writeTopicArtifact = (file: string): string => {
  const database = new Database(file, { create: true });
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
  `);
  const emptyBlocks = Schema.encodeSync(BlocksJson)([]);
  const thesis = Schema.encodeSync(BlocksJson)([
    ParagraphBlock.make({
      content: [
        TextInline.make({
          text: 'The 2300 evenings and mornings of Daniel 8:14 close in 1844.',
        }),
      ],
    }),
  ]);
  database
    .prepare(
      'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
    )
    .run(TWENTY_THREE_HUNDRED.slug, TWENTY_THREE_HUNDRED.title, thesis, emptyBlocks, 0);
  const insertAlias = database.prepare(
    'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?, ?, ?, ?)',
  );
  const CANONICAL = 1;
  const SECONDARY = 0;
  for (const [position, alias] of TWENTY_THREE_HUNDRED.aliases.entries()) {
    let canonical = SECONDARY;
    if (position === 0) canonical = CANONICAL;
    insertAlias.run(normalizeAlias(alias), alias, TWENTY_THREE_HUNDRED.slug, canonical);
  }
  database.close();
  return file;
};

describe('manna wiki topic 2300-days --json', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('prints the composed page through the core schema, section for section', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-2300-' })
        .pipe(Effect.orDie);
      const layer = dictionaryWiki(writeTopicArtifact(`${directory}/topics.db`));

      const result = yield* runCli(wiki, ['topic', TWENTY_THREE_HUNDRED.slug, '--json'], {}).pipe(
        Effect.provideService(WikiLayer, layer),
      );
      expect(result.success).toBe(true);

      const page = yield* composeTopicPage(layer, TWENTY_THREE_HUNDRED.slug);

      expect(result.stdout).toBe(yield* pageWireText(page));

      const emitted = yield* Schema.encodeEffect(WikiPageJson)(page);
      expect(emitted.status).toBe('flagship');
      expect(emitted.title).toBe(TWENTY_THREE_HUNDRED.title);
      expect(emitted.sections.map((section) => section._tag)).toEqual([
        'key-verses',
        'egw-statements',
        'commentary',
        'pioneer-witnesses',
        'cross-references',
        'related-topics',
      ]);
      expect(emitted.sections.map((section) => section.defaultOpen)).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
      ]);
      expect(Option.isSome(page.core)).toBe(true);
      expect(result.stdout).toContain('2300 evenings and mornings');
    }));

  test('the authored aliases reach the dictionary the renderer matches with', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-2300-aliases-' })
        .pipe(Effect.orDie);
      const layer = dictionaryWiki(writeTopicArtifact(`${directory}/topics.db`));

      const dictionary = yield* composeDictionary(layer);
      expect(dictionary.entries.map((entry) => entry.alias).toSorted()).toEqual(
        TWENTY_THREE_HUNDRED.aliases.map(normalizeAlias).toSorted(),
      );

      const automaton = PhraseAutomaton.make(dictionary);
      const spans = matchRun(automaton, 'Unto two thousand and three hundred days.');
      expect(spans.map((span) => String(span.slug))).toEqual([TWENTY_THREE_HUNDRED.slug]);
    }));
});

const writePopulatedArtifact = (file: string): string => {
  const database = new Database(file, { create: true });
  database.exec(WIKI_ARTIFACT_DDL);
  for (const row of wikiPageFixtureRows()) database.prepare(row.sql).run(...row.params);
  database.close();
  return file;
};

const populatedWiki = (file: string): Layer.Layer<WikiService> =>
  layerBun(file).pipe(
    Layer.provide(WIKI_PAGE_FIXTURE_CATALOG),
    Layer.provide(WIKI_PAGE_FIXTURE_SOURCES),
    Layer.provide(BunFileSystem.layer),
  );

describe('manna wiki topic --json over a populated page', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('every section carries its items, and they are the identities the UI renders', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-populated-' })
        .pipe(Effect.orDie);
      const layer = populatedWiki(writePopulatedArtifact(`${directory}/topics.db`));

      const result = yield* runCli(wiki, ['topic', WIKI_PAGE_FIXTURE.slug, '--json'], {}).pipe(
        Effect.provideService(WikiLayer, layer),
      );
      expect(result.success).toBe(true);

      const page = yield* composeTopicPage(layer, WIKI_PAGE_FIXTURE.slug);

      expect(result.stdout).toBe(yield* pageWireText(page));

      expect(wikiSectionIdentities(page.sections)).toEqual(WIKI_PAGE_FIXTURE_IDENTITIES);

      for (const section of page.sections) expect(section.items.length).toBeGreaterThan(0);

      for (const identities of Object.values(WIKI_PAGE_FIXTURE_IDENTITIES)) {
        for (const identity of identities) expect(result.stdout).toContain(identity);
      }

      expect(wikiSectionIdentities((yield* WIKI_PAGE_FIXTURE_PAGE).sections)).toEqual(
        wikiSectionIdentities(page.sections),
      );
    }));

  test('§6.3 rides beside the ranked hits, on the wire the UI reads', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-populated-missing-' })
        .pipe(Effect.orDie);
      const layer = populatedWiki(writePopulatedArtifact(`${directory}/topics.db`));

      const result = yield* runCli(wiki, ['topic', WIKI_PAGE_FIXTURE.slug, '--json'], {}).pipe(
        Effect.provideService(WikiLayer, layer),
      );
      const page = yield* composeTopicPage(layer, WIKI_PAGE_FIXTURE.slug);
      expect(result.stdout).toBe(yield* pageWireText(page));

      const egw = page.sections[1];
      expect(egw.missingBooks.map((book) => book.bookCode)).toEqual(['ABSENT']);
      expect(egw.total).toBe(egw.items.length);
      expect(Option.isSome(egw.handoff)).toBe(true);
    }));
});

const runLookup = (args: readonly string[]) =>
  runCli(wiki, ['lookup', ...args], {}).pipe(
    Effect.provideService(LookupLayer, WIKI_LOOKUP_FIXTURE_LAYER),
  );

const lookupResult = (input: LookupInput) =>
  Effect.flatMap(LookupService, (service) => service.resolve(input)).pipe(
    Effect.provide(WIKI_LOOKUP_FIXTURE_LAYER),
  );

describe('manna wiki lookup', () => {
  it.effect('builds the portable lookup input the DOM hosts build', () =>
    Effect.gen(function* () {
      const built = yield* lookupInput({
        text: LOOKUP_ADAPTER_SELECTION.text,
        context: Option.some(LOOKUP_ADAPTER_SELECTION.reference),
      });
      expect(built).toEqual(LOOKUP_ADAPTER_INPUT);
    }),
  );

  it.effect('builds that input from every raw argument the fixture names', () =>
    Effect.gen(function* () {
      for (const row of LOOKUP_ADAPTER_TEXTS) {
        const built = yield* lookupInput({ text: row.raw, context: Option.none() });
        expect(built.text).toBe(row.text);
      }
    }),
  );

  it.effect('refuses an argument that is nothing but whitespace', () =>
    Effect.gen(function* () {
      for (const raw of LOOKUP_ADAPTER_EMPTY_TEXTS) {
        const exit = yield* Effect.exit(lookupInput({ text: raw, context: Option.none() }));
        expect(Exit.isFailure(exit)).toBe(true);
      }
    }),
  );

  it.effect('builds the no-context input the DOM hosts build outside Scripture', () =>
    Effect.gen(function* () {
      const built = yield* lookupInput({
        text: LOOKUP_ADAPTER_SELECTION.text,
        context: Option.none(),
      });
      expect(built).toEqual(LOOKUP_ADAPTER_INPUT_NO_CONTEXT);
    }),
  );

  it.effect('refuses a --context that does not name one verse', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        lookupInput({ text: 'the daily', context: Option.some('Dan 8') }),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }),
  );

  it.effect('prints exactly the core codec encoding of the service result', () =>
    Effect.gen(function* () {
      const result = yield* runLookup([WIKI_PAGE_FIXTURE.phrase, '--json']);
      expect(result.success).toBe(true);

      const resolved = yield* lookupResult(
        LookupInput.make({ text: WIKI_PAGE_FIXTURE.phrase, context: Option.none() }),
      );
      expect(result.stdout).toBe(
        yield* serialize(yield* Schema.encodeEffect(LookupResultJson)(resolved)),
      );

      const wire = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(result.stdout);
      expect(Object.keys(wire as object)).toEqual([
        'text',
        'topics',
        'strongs',
        'verses',
        'writings',
        'catalog',
        'lonePeek',
      ]);
      expect(resolved.topics.length).toBeGreaterThan(0);
      expect(resolved.verses.length).toBeGreaterThan(0);
      expect(resolved.writings.length).toBeGreaterThan(0);
      expect(resolved.catalog.length).toBeGreaterThan(0);
    }),
  );

  it.effect('runs §10’s CLI JSON workflow, context and all', () =>
    Effect.gen(function* () {
      const result = yield* runLookup([
        LOOKUP_ADAPTER_SELECTION.text,
        '--context',
        LOOKUP_ADAPTER_SELECTION.reference,
        '--json',
      ]);
      expect(result.success).toBe(true);

      const resolved = yield* lookupResult(LOOKUP_ADAPTER_INPUT);
      expect(result.stdout).toBe(
        yield* serialize(yield* Schema.encodeEffect(LookupResultJson)(resolved)),
      );
      expect(resolved.strongs.map((hit) => hit.word)).toEqual(['the daily']);

      const without = yield* runLookup([LOOKUP_ADAPTER_SELECTION.text, '--json']);
      expect(without.stdout).not.toBe(result.stdout);
    }),
  );

  it.effect('prints all five groups in panel order, empty ones included', () =>
    Effect.gen(function* () {
      const result = yield* runLookup([WIKI_PAGE_FIXTURE.phrase]);
      expect(result.success).toBe(true);

      const headings = result.stdout
        .split('\n')
        .filter((line) => line.startsWith('## '))
        .map((line) => line.split('  ')[0]);
      expect(headings).toEqual([
        '## topics',
        '## strongs',
        '## verses',
        '## writings',
        '## catalog',
      ]);
      expect(result.stdout).toContain('## strongs  0');
      expect(result.stdout).toContain(WIKI_PAGE_FIXTURE.slug);
    }),
  );
});
