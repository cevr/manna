import { Effect, Layer, Option, Schema } from 'effect';

import {
  BibleDatabase,
  type CrossReference,
  type StrongsEntry,
} from '../bible-db/bible-database.js';
import { Reference, type VerseReference } from '../bible/model.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type * as EGWSchemas from '../egw/schemas.js';
import { TopicDetail, TopicId, TopicReference, TopicSection } from '../topics/model.js';
import { TopicService } from '../topics/service.js';
import { EGW_SCOPE_AUTHORS } from '../writings/corpus-scope.js';
import { WritingsService } from '../writings/service.js';
import { LookupService } from './lookup-service.js';
import {
  AuthoredCore,
  BlocksJson,
  CitationInline,
  ParagraphBlock,
  PhraseDictionary,
  PhraseDictionaryEntry,
  TextInline,
  TopicAlias,
  TopicEdge,
  topicSlug,
  WikiPage,
  type WikiSectionKind,
  type WikiSectionLineup,
} from './model.js';
import { normalizeAlias } from './normalize.js';
import { composeSections, WikiSectionSources } from './section-composer.js';
import { WikiService } from './service.js';

export const WIKI_PAGE_FIXTURE = {
  slug: 'sanctuary',
  title: 'The Sanctuary',
  phrase: 'sanctuary',
  related: { slug: 'day-of-atonement', title: 'Day of Atonement' },
  thesis: 'The sanctuary is the framework of the plan of redemption.',
} satisfies {
  readonly slug: string;
  readonly title: string;
  readonly phrase: string;
  readonly related: { readonly slug: string; readonly title: string };
  readonly thesis: string;
};

const CATALOG_ID = 'naves-topical-bible.sanctuary';

const CATALOG = TopicDetail.make({
  id: Schema.decodeSync(TopicId)(CATALOG_ID),
  name: 'SANCTUARY',
  alternativeNames: [],
  sections: [
    TopicSection.make({
      label: 'General references',
      references: [
        TopicReference.make({ raw: 'Jn 11:1', osis: ['John.11.1'] }),
        TopicReference.make({ raw: 'Jn 11:5', osis: ['John.11.5'] }),
        TopicReference.make({ raw: 'Jn 11:9', osis: ['John.11.9'] }),
      ],
    }),
  ],
});

const VERSES = [1, 5, 9].map((verse) => ({
  book: 43,
  chapter: 11,
  verse,
  versionCode: 'KJV',
  text: `John 11:${String(verse)} names the sanctuary and its service.`,
}));

export const LOOKUP_CONTEXT = { book: 27, chapter: 8, verse: 13 } satisfies {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
};

export const LOOKUP_CONTEXT_REFERENCE: VerseReference = Reference.verse(
  LOOKUP_CONTEXT.book,
  LOOKUP_CONTEXT.chapter,
  LOOKUP_CONTEXT.verse,
);

const LOOKUP_CONTEXT_VERSE = {
  ...LOOKUP_CONTEXT,
  versionCode: 'KJV',
  text: 'How long shall be the vision concerning the daily sacrifice, and the transgression of desolation, to give both the sanctuary and the host to be trodden under foot?',
};

const LOOKUP_CONTEXT_WORDS = [
  { text: 'the daily', strongsNumbers: ['H8548'], italic: false },
  { text: 'sanctuary', strongsNumbers: ['H6944'], italic: false },
  { text: 'the host', strongsNumbers: ['H6635'], italic: false },
];

const LOOKUP_STRONGS_ENTRIES: readonly StrongsEntry[] = [
  {
    number: 'H8548',
    language: 'hebrew',
    lemma: 'תָּמִיד',
    transliteration: Option.some('tamiyd'),
    pronunciation: Option.some('taw-meed'),
    definition: 'continuance, continually, perpetual',
    kjvDefinition: Option.some('alway(-s), continual, daily'),
  },
  {
    number: 'H6944',
    language: 'hebrew',
    lemma: 'קֹדֶשׁ',
    transliteration: Option.some('qodesh'),
    pronunciation: Option.some('ko-desh'),
    definition: 'a sacred place or thing, sanctuary',
    kjvDefinition: Option.some('consecrated, hallowed, holy, sanctuary'),
  },
  {
    number: 'H6635',
    language: 'hebrew',
    lemma: 'צָבָא',
    transliteration: Option.some('tsaba'),
    pronunciation: Option.some('tsaw-baw'),
    definition: 'a mass of persons, an army, a host',
    kjvDefinition: Option.none<string>(),
  },
];

const CROSS_REFS = [
  {
    book: 43,
    chapter: 11,
    verse: 1,
    references: [
      {
        book: 1,
        chapter: 1,
        verse: Option.some(1),
        verseEnd: Option.none(),
        source: 'openbible',
        previewText: Option.some('In the beginning God made the sanctuary pattern.'),
      } satisfies CrossReference,
    ],
  },
];

const COMMENTARY = [
  {
    refcode: '5BC 110.1',
    bookCode: '5BC',
    bookTitle: 'Bible Commentary Volume 5',
    bookAuthor: 'Ellen Gould White',
    content: 'The sanctuary above is the great original.',
    puborder: 1,
  },
];

const EGW_AUTHOR = EGW_SCOPE_AUTHORS[0];

const book = (input: {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly author: string;
  readonly paragraphs: number;
}) => ({
  book_id: input.id,
  book_code: input.code,
  book_title: input.title,
  book_author: input.author,
  paragraph_count: input.paragraphs,
  created_at: '2026-01-01T00:00:00.000Z',
});

const BOOKS = [
  book({ id: 1, code: 'GC', title: 'The Great Controversy', author: EGW_AUTHOR, paragraphs: 1 }),
  book({
    id: 2,
    code: 'DAR',
    title: 'Daniel and the Revelation',
    author: 'Uriah Smith',
    paragraphs: 1,
  }),
  book({
    id: 3,
    code: 'ABSENT',
    title: 'A Book You Do Not Have',
    author: EGW_AUTHOR,
    paragraphs: 0,
  }),
];

const paragraph = (input: {
  readonly code: string;
  readonly refcode: string;
  readonly text: string;
}): EGWSchemas.Paragraph & { readonly bookCode: string } => ({
  para_id: Option.some(input.refcode),
  refcode_short: Option.some(input.refcode),
  refcode_long: input.refcode,
  nodes: [{ _tag: 'Text', text: input.text }],
  puborder: 1,
  element_type: 'para',
  element_subtype: Option.getOrNull(Option.none<string>()),
  bookCode: input.code,
});

const PARAGRAPHS = [
  paragraph({ code: 'GC', refcode: 'GC 1.1', text: 'the sanctuary in heaven' }),
  paragraph({ code: 'DAR', refcode: 'DAR 1.1', text: 'the sanctuary of Daniel' }),
];

export type WikiPageFixtureIdentities = Readonly<Record<WikiSectionKind, readonly string[]>>;

export const wikiSectionIdentities = (sections: WikiSectionLineup): WikiPageFixtureIdentities => ({
  'key-verses': sections[0].items.map((passage) => passage.label),
  'egw-statements': sections[1].items.map((hit) => hit.refcode),
  commentary: sections[2].items.map((entry) => entry.refcode),
  'pioneer-witnesses': sections[3].items.map((hit) => hit.refcode),
  'cross-references': sections[4].items.map((reference) => reference.to.label),
  'related-topics': sections[5].items.map((topic) => topic.title),
});

export const WIKI_PAGE_FIXTURE_IDENTITIES = {
  'key-verses': ['John 11:1', 'John 11:5', 'John 11:9'],
  'egw-statements': ['GC 1.1'],
  commentary: ['5BC 110.1', '5BC 110.1', '5BC 110.1'],
  'pioneer-witnesses': ['DAR 1.1'],
  'cross-references': ['Genesis 1:1'],
  'related-topics': [WIKI_PAGE_FIXTURE.related.title],
} satisfies WikiPageFixtureIdentities;

export const wikiPageFixtureThesis = (): string =>
  Schema.encodeSync(BlocksJson)([
    ParagraphBlock.make({
      content: [
        TextInline.make({ text: `${WIKI_PAGE_FIXTURE.thesis} ` }),
        CitationInline.make({
          text: 'the sanctuary shall be cleansed',
          refcode: 'ABSENT 12.3',
        }),
      ],
    }),
  ]);

export const wikiPageFixtureEmptyBlocks = (): string => Schema.encodeSync(BlocksJson)([]);

export interface WikiPageFixtureRow {
  readonly sql: string;
  readonly params: readonly (string | number)[];
}

export const wikiPageFixtureRows = (): readonly WikiPageFixtureRow[] => {
  const topic =
    'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?,?,?,?,?)';
  const empty = wikiPageFixtureEmptyBlocks();
  return [
    {
      sql: topic,
      params: [WIKI_PAGE_FIXTURE.slug, WIKI_PAGE_FIXTURE.title, wikiPageFixtureThesis(), empty, 0],
    },
    {
      sql: topic,
      params: [WIKI_PAGE_FIXTURE.related.slug, WIKI_PAGE_FIXTURE.related.title, empty, empty, 1],
    },
    {
      sql: 'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?,?,?,?)',
      params: [
        normalizeAlias(WIKI_PAGE_FIXTURE.phrase),
        WIKI_PAGE_FIXTURE.phrase,
        WIKI_PAGE_FIXTURE.slug,
        1,
      ],
    },
    {
      sql: 'INSERT INTO topic_edges (from_slug, to_slug, kind, position) VALUES (?,?,?,?)',
      params: [WIKI_PAGE_FIXTURE.slug, WIKI_PAGE_FIXTURE.related.slug, 'authored', 0],
    },
    {
      sql: 'INSERT INTO topic_catalog_keys (slug, catalog_id, matched_by) VALUES (?,?,?)',
      params: [WIKI_PAGE_FIXTURE.slug, CATALOG_ID, 'override'],
    },
  ];
};

export const WIKI_ARTIFACT_DDL = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
  CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
  CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
  CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
  INSERT INTO meta (key, value) VALUES ('schema_major', '1');
`;

export const WIKI_PAGE_FIXTURE_WRITINGS: Layer.Layer<WritingsService> = WritingsService.Live.pipe(
  Layer.provide(EGWParagraphDatabase.Test({ books: BOOKS, paragraphs: PARAGRAPHS })),
);

export const WIKI_PAGE_FIXTURE_SOURCES: Layer.Layer<WikiSectionSources> =
  WikiSectionSources.Live.pipe(
    Layer.provide(TopicService.Test([CATALOG])),
    Layer.provide(
      BibleDatabase.layerTest({
        verses: [...VERSES, LOOKUP_CONTEXT_VERSE],
        crossRefs: CROSS_REFS,
        verseWords: [{ ...LOOKUP_CONTEXT, words: LOOKUP_CONTEXT_WORDS }],
        strongsEntries: LOOKUP_STRONGS_ENTRIES,
      }),
    ),
    Layer.provide(EGWCommentaryService.Test({ entries: COMMENTARY })),
    Layer.provide(WIKI_PAGE_FIXTURE_WRITINGS),
  );

export const WIKI_PAGE_FIXTURE_PAGE: Effect.Effect<WikiPage> = Effect.gen(function* () {
  const sourcing = yield* WikiSectionSources;
  if (sourcing._tag === 'not-wired') {
    return yield* Effect.die('the fixture must be composed over wired sources');
  }
  const core = AuthoredCore.make({
    thesis: [
      ParagraphBlock.make({
        content: [
          TextInline.make({ text: `${WIKI_PAGE_FIXTURE.thesis} ` }),
          CitationInline.make({
            text: 'the sanctuary shall be cleansed',
            refcode: 'ABSENT 12.3',
          }),
        ],
      }),
    ],
    body: [],
    aliases: [
      TopicAlias.make({
        alias: normalizeAlias(WIKI_PAGE_FIXTURE.phrase),
        display: WIKI_PAGE_FIXTURE.phrase,
        canonical: true,
      }),
    ],
    edges: [
      TopicEdge.make({
        slug: topicSlug(WIKI_PAGE_FIXTURE.related.slug),
        kind: 'authored',
      }),
    ],
  });
  const sections = yield* composeSections(sourcing.sources, {
    slug: topicSlug(WIKI_PAGE_FIXTURE.slug),
    title: WIKI_PAGE_FIXTURE.title,
    core: Option.some(core),
    catalogId: Option.some(CATALOG.id),
    titleOf: (slug) => {
      if (String(slug) !== WIKI_PAGE_FIXTURE.related.slug) return Effect.succeedNone;
      return Effect.succeedSome(WIKI_PAGE_FIXTURE.related.title);
    },
    backlinksTo: () => Effect.succeed([]),
  });
  return WikiPage.make({
    slug: topicSlug(WIKI_PAGE_FIXTURE.slug),
    title: WIKI_PAGE_FIXTURE.title,
    status: 'flagship',
    core: Option.some(core),
    sections,
    unavailable: Option.none(),
    sectionsUnavailable: Option.none(),
  });
}).pipe(Effect.provide(WIKI_PAGE_FIXTURE_SOURCES));

export const WIKI_PAGE_FIXTURE_CATALOG: Layer.Layer<TopicService> = TopicService.Test([CATALOG]);

export const WIKI_LOOKUP_FIXTURE_DICTIONARY: PhraseDictionary = PhraseDictionary.make({
  entries: [
    PhraseDictionaryEntry.make({
      alias: normalizeAlias(WIKI_PAGE_FIXTURE.phrase),
      display: WIKI_PAGE_FIXTURE.title,
      slug: topicSlug(WIKI_PAGE_FIXTURE.slug),
      canonical: true,
    }),
  ],
  unavailable: Option.none(),
});

export const WIKI_LOOKUP_FIXTURE_LAYER: Layer.Layer<LookupService> = LookupService.Live.pipe(
  Layer.provide(
    Layer.succeed(
      WikiService,
      WikiService.of({
        list: () => Effect.succeed([]),
        topic: () => Effect.die('the lookup fixture serves no pages'),
        dictionary: Effect.succeed(WIKI_LOOKUP_FIXTURE_DICTIONARY),
        availability: Effect.succeedNone,
      }),
    ),
  ),
  Layer.provide(WIKI_PAGE_FIXTURE_SOURCES),
);
