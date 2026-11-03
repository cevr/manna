/** Milestone 7 core acceptance (§10).
 *
 *  The milestone's acceptance list, claim by claim:
 *
 *  1. each resolver group populates independently;
 *  2. an empty group is present-and-empty, not absent;
 *  3. `context` inside a verse produces the Strong's group and omitting
 *     `context` does not;
 *  4. a lone topic hit is flagged for peek-card treatment.
 *
 *  The fixture is "the daily" against Daniel 8 — the phrase §7's own CLI example
 *  names, and the phrase the §4.5 regression pair in `phrase-fixture.ts` is
 *  built around — wired against the same four `WikiSectionSources` a topic page
 *  composes from, so the groups are resolved through the services a host really
 *  provides rather than through five stubs that could agree with each other and
 *  with nothing else.
 */

import { Effect, Exit, Layer, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { Reference, type VerseReference } from '../bible/model.js';
import { BibleDatabase, type StrongsEntry, type VerseWord } from '../bible-db/bible-database.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type * as EGWSchemas from '../egw/schemas.js';
import { TopicDetail, TopicId } from '../topics/model.js';
import { TopicService, TopicUnavailableError } from '../topics/service.js';
import { EGW_SCOPE_AUTHORS } from '../writings/corpus-scope.js';
import { WritingsService } from '../writings/service.js';
import { LOOKUP_HIT_LIMIT, LookupInput, LookupResult } from './lookup-model.js';
import { LookupService } from './lookup-service.js';
import { PhraseDictionary, PhraseDictionaryEntry, topicSlug } from './model.js';
import { normalizeAlias } from './normalize.js';
import { WikiSectionSources } from './section-composer.js';
import { WikiService, WikiUnavailableError } from './service.js';

const DANIEL = 27;
const DAN_8_11 = Reference.verse(DANIEL, 8, 11);

const EGW_AUTHOR = EGW_SCOPE_AUTHORS[0];

const book = (input: { readonly id: number; readonly code: string; readonly title: string }) => ({
  book_id: input.id,
  book_code: input.code,
  book_title: input.title,
  book_author: EGW_AUTHOR,
  paragraph_count: 1,
  created_at: '2026-01-01T00:00:00.000Z',
});

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

/** Ten paragraphs carrying the phrase, two past `LOOKUP_HIT_LIMIT`, so the cap
 *  is a real truncation rather than a number that happens to exceed the data. */
const WRITINGS_MATCHES = LOOKUP_HIT_LIMIT + 2;

const PARAGRAPHS = [
  ...Array.from({ length: WRITINGS_MATCHES }, (_, index) =>
    paragraph({
      code: 'GC',
      refcode: `GC ${String(index + 1)}.1`,
      text: `The daily mediation of Christ, statement ${String(index + 1)}.`,
    }),
  ),
  paragraph({ code: 'PP', refcode: 'PP 1.1', text: 'The creation of the world.' }),
];

/** Daniel 8:11 and enough neighbours to push the verse group past its cap. */
const VERSES = [
  {
    book: DANIEL,
    chapter: 8,
    verse: 11,
    versionCode: 'KJV',
    text: 'Yea, he magnified himself even to the prince of the host, and by him the daily was taken away.',
  },
  ...Array.from({ length: WRITINGS_MATCHES }, (_, index) => ({
    book: DANIEL,
    chapter: 9,
    verse: index + 1,
    versionCode: 'KJV',
    text: `And the daily continued, saying ${String(index + 1)}.`,
  })),
  {
    book: DANIEL,
    chapter: 7,
    verse: 1,
    versionCode: 'KJV',
    text: 'In the first year of Belshazzar.',
  },
];

/** Daniel 8:11's words, as `verse_words` stores them.
 *
 *  "the daily" carries H8548 (*tamid*), which is the word the Strong's group is
 *  supposed to find under a context; "prince" carries a second number so a
 *  selection covering only one word cannot accidentally report both. */
const WORDS: readonly VerseWord[] = [
  { text: 'the prince', strongsNumbers: ['H8269'], italic: false },
  { text: 'the daily', strongsNumbers: ['H8548'], italic: false },
  { text: 'was taken away', strongsNumbers: [], italic: false },
  { text: 'he', strongsNumbers: ['H1931'], italic: false },
];

const STRONGS_ENTRIES: readonly StrongsEntry[] = [
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
    number: 'H8269',
    language: 'hebrew',
    lemma: 'שַׂר',
    transliteration: Option.some('sar'),
    pronunciation: Option.some('sar'),
    definition: 'a head person of any rank or class',
    kjvDefinition: Option.none<string>(),
  },
];

const catalogTopic = (id: string, name: string): TopicDetail =>
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)(id),
    name,
    alternativeNames: [],
    sections: [],
  });

/** Two catalog topics: one the phrase reaches and one it does not, so the
 *  catalog group is proved to be filtered rather than merely non-empty. */
const CATALOG = [
  catalogTopic('the-daily', 'The Daily'),
  catalogTopic('the-creation', 'The Creation'),
];

const entry = (display: string, slug: string): PhraseDictionaryEntry =>
  PhraseDictionaryEntry.make({
    alias: normalizeAlias(display),
    display,
    slug: topicSlug(slug),
    canonical: true,
  });

/** The dictionary the topic group resolves against.
 *
 *  `the daily sacrifice` is here so the prefix half of the fuzzy rule has
 *  something to match, and `sanctuary` so a selection that names neither
 *  produces an empty topic group. */
const DICTIONARY = PhraseDictionary.make({
  entries: [
    entry('the daily', 'the-daily'),
    entry('the daily sacrifice', 'the-daily-sacrifice'),
    entry('sanctuary', 'sanctuary'),
    entry('666', 'mark-of-the-beast'),
  ],
  unavailable: Option.none(),
});

/** A `WikiService` that serves only the dictionary.
 *
 *  The topic group's whole input is `WikiService.dictionary`, and the artifact
 *  machinery that produces a real one is `service.test.ts`'s subject rather
 *  than this file's. Stubbing the one read keeps the fixture about lookup
 *  resolution instead of about SQLite. */
const wikiLayer = (dictionary: PhraseDictionary): Layer.Layer<WikiService> =>
  Layer.succeed(
    WikiService,
    WikiService.of({
      list: () => Effect.succeed([]),
      topic: () => Effect.die('unused'),
      dictionary: Effect.succeed(dictionary),
      availability: Effect.succeedNone,
    }),
  );

const sourcesLayer = WikiSectionSources.Live.pipe(
  Layer.provide(TopicService.Test(CATALOG)),
  Layer.provide(
    BibleDatabase.layerTest({
      verses: VERSES,
      strongsEntries: STRONGS_ENTRIES,
      verseWords: [{ book: DANIEL, chapter: 8, verse: 11, words: WORDS }],
    }),
  ),
  Layer.provide(EGWCommentaryService.Test({ entries: [] })),
  Layer.provide(
    WritingsService.Live.pipe(
      Layer.provide(
        EGWParagraphDatabase.Test({
          books: [
            book({ id: 1, code: 'GC', title: 'The Great Controversy' }),
            book({ id: 2, code: 'PP', title: 'Patriarchs and Prophets' }),
          ],
          paragraphs: PARAGRAPHS,
        }),
      ),
    ),
  ),
);

/** The same four sources with nothing in any of them.
 *
 *  A second layer rather than a query the fixtures happen not to match, because
 *  `EGWParagraphDatabase.Test`'s `searchParagraphs` is deliberately query-blind
 *  — it filters by scope and publication and returns every paragraph otherwise
 *  (`book-database.ts:1454`, `testSearchMatches:170`). Against that double,
 *  "the writings group is empty because the phrase is absent" is not a claim a
 *  fixture phrase can make; an empty library is what actually makes it true.
 *  The Bible and catalog doubles *do* filter, so their emptiness here is the
 *  real thing. */
const emptySourcesLayer = WikiSectionSources.Live.pipe(
  Layer.provide(TopicService.Test([])),
  Layer.provide(BibleDatabase.layerTest({})),
  Layer.provide(EGWCommentaryService.Test({ entries: [] })),
  Layer.provide(WritingsService.Live.pipe(Layer.provide(EGWParagraphDatabase.Test({})))),
);

const lookupLayer = (dictionary: PhraseDictionary = DICTIONARY) =>
  LookupService.Live.pipe(Layer.provide(wikiLayer(dictionary)), Layer.provide(sourcesLayer));

const emptyLookupLayer = (dictionary: PhraseDictionary) =>
  LookupService.Live.pipe(Layer.provide(wikiLayer(dictionary)), Layer.provide(emptySourcesLayer));

const resolveEmpty = (text: string, dictionary: PhraseDictionary): Effect.Effect<LookupResult> =>
  Effect.flatMap(LookupService, (service) =>
    service.resolve(LookupInput.make({ text, context: Option.none() })),
  ).pipe(Effect.provide(emptyLookupLayer(dictionary)));

const resolve = (
  input: { readonly text: string; readonly context?: VerseReference },
  dictionary: PhraseDictionary = DICTIONARY,
): Effect.Effect<LookupResult> =>
  Effect.flatMap(LookupService, (service) =>
    service.resolve(
      LookupInput.make({
        text: input.text,
        context: Option.fromNullishOr(input.context),
      }),
    ),
  ).pipe(Effect.provide(lookupLayer(dictionary)));

describe('LookupService.resolve — the five groups (§7)', () => {
  it.effect('populates every group independently for a phrase all five know', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'the daily', context: DAN_8_11 });

      expect(result.topics.map((match) => String(match.slug))).toEqual([
        'the-daily',
        'the-daily-sacrifice',
      ]);
      expect(result.topics[0]?.kind).toBe('exact');
      expect(result.topics[1]?.kind).toBe('fuzzy');

      expect(result.strongs).toHaveLength(1);
      expect(result.strongs[0]?.word).toBe('the daily');
      expect(
        Option.map(result.strongs[0]?.entry ?? Option.none(), (found) => String(found.number)),
      ).toEqual(Option.some('H8548'));

      expect(result.verses).toHaveLength(LOOKUP_HIT_LIMIT);
      expect(result.verses.every((hit) => hit.text.toLowerCase().includes('the daily'))).toBe(true);
      expect(result.verses[0]?.label).toBe('Daniel 8:11');

      expect(result.writings).toHaveLength(LOOKUP_HIT_LIMIT);
      expect(result.writings.every((hit) => hit.bookCode === 'GC')).toBe(true);

      expect(result.catalog.map((match) => String(match.name))).toEqual(['The Daily']);
    }),
  );

  it.effect('carries every group as present-and-empty when nothing matches', () =>
    Effect.gen(function* () {
      const result = yield* resolveEmpty('zzzz nothing here', DICTIONARY);

      expect(result.topics).toEqual([]);
      expect(result.strongs).toEqual([]);
      expect(result.verses).toEqual([]);
      expect(result.writings).toEqual([]);
      expect(result.catalog).toEqual([]);

      const wire = yield* Schema.encodeEffect(LookupResult)(result);
      expect(Object.keys(wire)).toEqual([
        'text',
        'topics',
        'strongs',
        'verses',
        'writings',
        'catalog',
        'lonePeek',
      ]);
      expect(wire.topics).toEqual([]);
      expect(wire.strongs).toEqual([]);
    }),
  );
});

describe("LookupService.resolve — the Strong's group and its context (§7)", () => {
  it.effect('produces the group when the context locates the selection in a verse', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'the daily', context: DAN_8_11 });
      expect(result.strongs.map((hit) => hit.word)).toEqual(['the daily']);
    }),
  );

  it.effect('produces an empty group when the context is omitted', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'the daily' });
      expect(result.strongs).toEqual([]);
      expect(result.topics.length).toBeGreaterThan(0);
      expect(result.verses.length).toBeGreaterThan(0);
    }),
  );

  it.effect('reports no word the selection does not cover', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'the daily', context: DAN_8_11 });
      expect(result.strongs.map((hit) => hit.word)).not.toContain('the prince');
    }),
  );

  it.effect('reports every covered word when the selection spans several', () =>
    Effect.gen(function* () {
      const result = yield* resolve({
        text: 'the prince of the host, and by him the daily',
        context: DAN_8_11,
      });
      expect(result.strongs.map((hit) => hit.word)).toEqual(['the prince', 'the daily']);
    }),
  );

  it.effect('covers a verse word only on whole-word boundaries (§4.3)', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'the prince', context: DAN_8_11 });
      expect(result.strongs.map((hit) => hit.word)).toEqual(['the prince']);
    }),
  );

  it.effect('covers a multi-word verse word only when the selection holds all of it', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'the', context: DAN_8_11 });
      expect(result.strongs).toEqual([]);
    }),
  );
});

describe('LookupService.resolve — the lone topic hit (§7, §5)', () => {
  /** A dictionary of one phrase that no other source holds, so the topic group
   *  is the only group with anything in it. */
  const loneDictionary = PhraseDictionary.make({
    entries: [entry('zzzz nothing here', 'lone-topic')],
    unavailable: Option.none(),
  });

  it.effect('flags a single topic match with no other results for the peek card', () =>
    Effect.gen(function* () {
      const result = yield* resolveEmpty('zzzz nothing here', loneDictionary);

      expect(result.topics.map((match) => String(match.slug))).toEqual(['lone-topic']);
      expect(result.verses).toEqual([]);
      expect(result.writings).toEqual([]);
      expect(result.catalog).toEqual([]);
      expect(result.lonePeek).toBe(true);
    }),
  );

  it.effect('does not flag a single topic match that arrives beside other groups', () =>
    Effect.gen(function* () {
      const result = yield* resolve(
        { text: 'the daily' },
        PhraseDictionary.make({
          entries: [entry('the daily', 'the-daily')],
          unavailable: Option.none(),
        }),
      );

      expect(result.topics).toHaveLength(1);
      expect(result.verses.length).toBeGreaterThan(0);
      expect(result.lonePeek).toBe(false);
    }),
  );

  it.effect('does not flag two topic matches', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'the daily' });
      expect(result.topics.length).toBeGreaterThan(1);
      expect(result.lonePeek).toBe(false);
    }),
  );
});

describe('LookupService.resolve — the fuzzy rule', () => {
  it.effect('matches an alias the selection is a prefix of', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'the daily sacri' });
      expect(result.topics.map((match) => String(match.slug))).toEqual([
        'the-daily',
        'the-daily-sacrifice',
      ]);
      expect(result.topics.every((match) => match.kind === 'fuzzy')).toBe(true);
    }),
  );

  it.effect('matches an alias on a prefix that contains no other alias', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'sanctu' });
      expect(result.topics.map((match) => String(match.slug))).toEqual(['sanctuary']);
      expect(result.topics[0]?.kind).toBe('fuzzy');
    }),
  );

  it.effect('matches an alias contained in a longer selection', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'and by him the daily was taken away' });
      expect(result.topics.map((match) => String(match.slug))).toEqual(['the-daily']);
      expect(result.topics[0]?.kind).toBe('fuzzy');
    }),
  );

  it.effect('normalizes case, whitespace and soft punctuation before matching', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: '  The   Daily,  ' });
      expect(String(result.topics[0]?.slug)).toBe('the-daily');
      expect(result.topics[0]?.kind).toBe('exact');
    }),
  );

  it.effect('answers a selection that normalizes away with five empty groups', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: ' , ; ' });
      expect(result.topics).toEqual([]);
      expect(result.strongs).toEqual([]);
      expect(result.verses).toEqual([]);
      expect(result.writings).toEqual([]);
      expect(result.catalog).toEqual([]);
      expect(result.lonePeek).toBe(false);
    }),
  );

  it.effect('refuses a fuzzy prefix shorter than the threshold', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'th' });
      expect(result.topics).toEqual([]);
    }),
  );

  it.effect('holds §4.3 word boundaries on both halves of the rule', () =>
    Effect.gen(function* () {
      const year = yield* resolve({ text: '1666' });
      expect(year.topics).toEqual([]);

      const number = yield* resolve({ text: 'the number 666 of the beast' });
      expect(number.topics.map((match) => String(match.slug))).toEqual(['mark-of-the-beast']);

      const overshot = yield* resolve({ text: 'sanctuaryx' });
      expect(overshot.topics).toEqual([]);
    }),
  );

  it.effect('reports one row per topic, keeping its best alias', () =>
    Effect.gen(function* () {
      const twoAliases = PhraseDictionary.make({
        entries: [
          entry('the daily', 'the-daily'),
          entry('the daily sacrifice', 'the-daily'),
          PhraseDictionaryEntry.make({
            alias: normalizeAlias('the continual'),
            display: 'the continual',
            slug: topicSlug('the-daily'),
            canonical: false,
          }),
        ],
        unavailable: Option.none(),
      });
      const result = yield* resolve({ text: 'the daily' }, twoAliases);

      expect(result.topics).toHaveLength(1);
      expect(result.topics[0]?.kind).toBe('exact');
      expect(result.topics[0]?.alias).toBe('the daily');
    }),
  );
});

describe('LookupService.resolve — the catalog group and its status', () => {
  it.effect('names a catalog topic the artifact also authors as flagship', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'the daily' });
      expect(result.catalog.map((match) => [String(match.slug), match.status])).toEqual([
        ['the-daily', 'flagship'],
      ]);
    }),
  );

  it.effect('names a catalog-only topic as catalog', () =>
    Effect.gen(function* () {
      const result = yield* resolve(
        { text: 'the creation' },
        PhraseDictionary.make({ entries: [], unavailable: Option.none() }),
      );
      expect(result.catalog.map((match) => [String(match.slug), match.status])).toEqual([
        ['the-creation', 'catalog'],
      ]);
    }),
  );
});

describe('LookupService.resolve — words are the §4.3 scan the matcher uses', () => {
  /** The authored alias from `content/topics/three-angels-messages.md`, which
   *  the corpus reaches almost exclusively as "the third angel's message". */
  const angels = PhraseDictionary.make({
    entries: [entry('third angel', 'three-angels-messages')],
    unavailable: Option.none(),
  });

  it.effect('matches an alias whose selection continues past an apostrophe', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: "the third angel's message" }, angels);
      expect(result.topics.map((match) => String(match.slug))).toEqual(['three-angels-messages']);
      expect(result.topics[0]?.kind).toBe('fuzzy');
    }),
  );

  it.effect('matches an alias whose selection is broken by a hyphen', () =>
    Effect.gen(function* () {
      const result = yield* resolve({ text: 'the daily-sacrifice reading' });
      expect(result.topics.map((match) => String(match.slug))).toEqual([
        'the-daily',
        'the-daily-sacrifice',
      ]);
    }),
  );

  it.effect('still refuses a run that crosses no boundary at all', () =>
    Effect.gen(function* () {
      const glued = yield* resolve({ text: 'thirdangel message' }, angels);
      expect(glued.topics).toEqual([]);
    }),
  );

  it.effect('covers a verse word the selection carries in a possessive', () =>
    Effect.gen(function* () {
      const result = yield* resolve({
        text: "and by him the daily's continuance",
        context: DAN_8_11,
      });
      expect(result.strongs.map((hit) => hit.word)).toEqual(['the daily']);
    }),
  );
});

describe('LookupService.resolve — degradation (§3.5, §6.3)', () => {
  it.effect('answers with four empty groups when the host wired no section sources', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(LookupService, (service) =>
        service.resolve(LookupInput.make({ text: 'the daily', context: Option.some(DAN_8_11) })),
      );

      expect(result.topics.length).toBeGreaterThan(0);
      expect(result.strongs).toEqual([]);
      expect(result.verses).toEqual([]);
      expect(result.writings).toEqual([]);
      expect(result.catalog).toEqual([]);
    }).pipe(
      Effect.provide(
        LookupService.Live.pipe(
          Layer.provide(wikiLayer(DICTIONARY)),
          Layer.provide(WikiSectionSources.NotWired),
        ),
      ),
    ),
  );

  const failing = WikiSectionSources.Live.pipe(
    Layer.provide(
      Layer.succeed(
        TopicService,
        TopicService.of({
          list: () =>
            Effect.fail(
              TopicUnavailableError.make({
                operation: 'list',
                cause: 'the catalog file is unreadable',
              }),
            ),
          topic: () => Effect.die('unused'),
        }),
      ),
    ),
    Layer.provide(BibleDatabase.layerTest({ verses: VERSES })),
    Layer.provide(EGWCommentaryService.Test({ entries: [] })),
    Layer.provide(WritingsService.Live.pipe(Layer.provide(EGWParagraphDatabase.Test({})))),
  );

  it.effect('answers with an empty group when one corpus reports a typed failure', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(LookupService, (service) =>
        service.resolve(LookupInput.make({ text: 'the daily', context: Option.none() })),
      );

      expect(result.catalog).toEqual([]);
      expect(result.topics.length).toBeGreaterThan(0);
      expect(result.verses.length).toBeGreaterThan(0);
    }).pipe(
      Effect.provide(
        LookupService.Live.pipe(Layer.provide(wikiLayer(DICTIONARY)), Layer.provide(failing)),
      ),
    ),
  );

  const dying = WikiSectionSources.Live.pipe(
    Layer.provide(
      Layer.succeed(
        TopicService,
        TopicService.of({
          list: () => Effect.die(new Error('catalog invariant broken')),
          topic: () => Effect.die('unused'),
        }),
      ),
    ),
    Layer.provide(BibleDatabase.layerTest({ verses: VERSES })),
    Layer.provide(EGWCommentaryService.Test({ entries: [] })),
    Layer.provide(WritingsService.Live.pipe(Layer.provide(EGWParagraphDatabase.Test({})))),
  );

  it.effect('does not swallow a defect', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        Effect.flatMap(LookupService, (service) =>
          service.resolve(LookupInput.make({ text: 'the daily', context: Option.none() })),
        ),
      );

      expect(Exit.isFailure(exit)).toBe(true);
    }).pipe(
      Effect.provide(
        LookupService.Live.pipe(Layer.provide(wikiLayer(DICTIONARY)), Layer.provide(dying)),
      ),
    ),
  );

  const broken = Layer.succeed(
    WikiService,
    WikiService.of({
      list: () => Effect.succeed([]),
      topic: () => Effect.die('unused'),
      dictionary: Effect.fail(
        WikiUnavailableError.make({
          operation: 'dictionary',
          category: 'corrupt',
          message: 'artifact is corrupt',
        }),
      ),
      availability: Effect.succeedNone,
    }),
  );

  it.effect('answers with an empty topic group when the artifact will not read', () =>
    Effect.gen(function* () {
      const result = yield* Effect.flatMap(LookupService, (service) =>
        service.resolve(LookupInput.make({ text: 'the daily', context: Option.none() })),
      );

      expect(result.topics).toEqual([]);
      expect(result.verses.length).toBeGreaterThan(0);
      expect(result.writings.length).toBeGreaterThan(0);
    }).pipe(
      Effect.provide(LookupService.Live.pipe(Layer.provide(broken), Layer.provide(sourcesLayer))),
    ),
  );
});
