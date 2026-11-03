import { Effect, Option, Order, Context, Layer, Schema } from 'effect';

import { getBibleBook } from '../bible/canon.js';
import { VerseReference, type BookNumber } from '../bible/model.js';
import type { BibleDatabaseService, StrongsEntry, VerseWord } from '../bible-db/bible-database.js';
import { nodesToText } from '../egw/ast.js';
import { StrongsLexiconEntry } from '../study/model.js';
import type { TopicServiceApi } from '../topics/service.js';
import type { WritingsServiceApi } from '../writings/service.js';
import {
  LOOKUP_HIT_LIMIT,
  LOOKUP_TOPIC_LIMIT,
  LookupCatalogMatch,
  LookupResult,
  LookupStrongsHit,
  LookupTopicMatch,
  LookupVerseHit,
  LookupWritingsHit,
  type LookupInput,
} from './lookup-model.js';
import {
  TopicSlug,
  type PhraseDictionary,
  type PhraseDictionaryEntry,
  type TopicStatus,
} from './model.js';
import { normalizeAlias, normalizedWords } from './normalize.js';
import {
  WikiSectionSources,
  type SectionSources,
  type SectionSourcing,
} from './section-composer.js';
import { WikiService, type WikiServiceApi } from './service.js';

interface LookupServiceApi {
  readonly resolve: (input: LookupInput) => Effect.Effect<LookupResult>;
}

interface Selection {
  readonly text: string;
  readonly words: readonly string[];
}

const selectionOf = (text: string): Selection => {
  const normalized = normalizeAlias(text);
  return { text: normalized, words: words(normalized) };
};

const emptyResult = (text: string): LookupResult =>
  LookupResult.make({
    text,
    topics: [],
    strongs: [],
    verses: [],
    writings: [],
    catalog: [],
    lonePeek: false,
  });

const words = normalizedWords;

const containsRun = (haystack: readonly string[], needle: readonly string[]): boolean => {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
};

const LOOKUP_FUZZY_PREFIX_MINIMUM = 3;

const prefixesAlias = (selection: readonly string[], alias: readonly string[]): boolean => {
  if (selection.length === 0 || selection.length > alias.length) return false;
  for (let index = 0; index < selection.length - 1; index += 1) {
    if (selection[index] !== alias[index]) return false;
  }
  const last = selection[selection.length - 1] ?? '';
  const against = alias[selection.length - 1] ?? '';
  return against.startsWith(last);
};

const matchesFuzzily = (selection: readonly string[], alias: readonly string[]): boolean => {
  if (selection.length === 0) return false;
  if (containsRun(selection, alias)) return true;
  if (selection.join(' ').length < LOOKUP_FUZZY_PREFIX_MINIMUM) return false;
  return prefixesAlias(selection, alias);
};

const topicMatchOrder: Order.Order<LookupTopicMatch> = Order.combineAll([
  Order.mapInput(Order.Boolean, (match: LookupTopicMatch) => match.kind !== 'exact'),
  Order.mapInput(Order.Number, (match: LookupTopicMatch) => match.alias.length),
  Order.mapInput(Order.String, (match: LookupTopicMatch) => match.alias),
]);

const topicMatch = (
  entry: PhraseDictionaryEntry,
  selection: Selection,
): Option.Option<LookupTopicMatch> => {
  const alias = normalizeAlias(entry.alias);
  if (alias === selection.text) {
    return Option.some(
      LookupTopicMatch.make({
        slug: entry.slug,
        display: entry.display,
        alias: entry.alias,
        kind: 'exact',
        canonical: entry.canonical,
      }),
    );
  }
  if (matchesFuzzily(selection.words, words(alias))) {
    return Option.some(
      LookupTopicMatch.make({
        slug: entry.slug,
        display: entry.display,
        alias: entry.alias,
        kind: 'fuzzy',
        canonical: entry.canonical,
      }),
    );
  }
  return Option.none();
};

const topicMatches = (
  dictionary: PhraseDictionary,
  selection: Selection,
): readonly LookupTopicMatch[] => {
  const all = dictionary.entries.flatMap((entry) =>
    Option.match(topicMatch(entry, selection), {
      onNone: (): readonly LookupTopicMatch[] => [],
      onSome: (match) => [match],
    }),
  );
  const best = new Map<string, LookupTopicMatch>();
  for (const match of [...all].sort(topicMatchOrder)) {
    if (!best.has(match.slug)) best.set(match.slug, match);
  }
  return [...best.values()].slice(0, LOOKUP_TOPIC_LIMIT);
};

const coveredWord = (word: VerseWord, selection: Selection): boolean => {
  if (word.strongsNumbers.length === 0) return false;
  const normalized = words(normalizeAlias(word.text));
  if (normalized.length === 0) return false;
  return containsRun(selection.words, normalized);
};

const lexiconEntry = (entry: StrongsEntry): Option.Option<StrongsLexiconEntry> =>
  Schema.decodeOption(StrongsLexiconEntry)({
    number: entry.number,
    language: entry.language,
    lemma: entry.lemma,
    transliteration: entry.transliteration,
    pronunciation: entry.pronunciation,
    definition: entry.definition,
    kjvDefinition: entry.kjvDefinition,
  });

const strongsHits = (
  bible: BibleDatabaseService,
  context: Option.Option<VerseReference>,
  selection: Selection,
): Effect.Effect<readonly LookupStrongsHit[]> =>
  Option.match(context, {
    onNone: () => Effect.succeed<readonly LookupStrongsHit[]>([]),
    onSome: (reference) =>
      bible.getVerseWords(reference.book, reference.chapter, reference.verse).pipe(
        Effect.flatMap((words) =>
          Effect.forEach(
            words.filter((word) => coveredWord(word, selection)),
            (word) =>
              Effect.forEach(word.strongsNumbers, (number) =>
                bible.getStrongsEntry(number).pipe(
                  Effect.map((entry) =>
                    LookupStrongsHit.make({
                      word: word.text,
                      entry: Option.flatMap(entry, lexiconEntry),
                    }),
                  ),
                ),
              ),
            { concurrency: 8 },
          ),
        ),
        Effect.map((hits) => hits.flat().slice(0, LOOKUP_HIT_LIMIT)),
        Effect.orElseSucceed((): readonly LookupStrongsHit[] => []),
      ),
  });

const bookName = (book: BookNumber): string =>
  Option.match(getBibleBook(book), {
    onNone: () => String(book),
    onSome: (found) => found.name,
  });

const ftsPhrase = (phrase: string): string => `"${phrase.replaceAll('"', '""')}"`;

const readSlug = Schema.decodeOption(TopicSlug);

const catalogStatus = (authored: ReadonlySet<string>, slug: TopicSlug): TopicStatus => {
  if (authored.has(String(slug))) return 'flagship';
  return 'catalog';
};

const verseHits = (
  bible: BibleDatabaseService,
  query: string,
): Effect.Effect<readonly LookupVerseHit[]> =>
  bible.searchVerseWindow(query, { limit: LOOKUP_HIT_LIMIT }).pipe(
    Effect.flatMap((window) =>
      Effect.forEach(window.results, (row) =>
        Schema.decodeEffect(VerseReference)({
          _tag: 'verse',
          book: row.book,
          chapter: row.chapter,
          verse: row.verse,
        }).pipe(
          Effect.map((reference) =>
            LookupVerseHit.make({
              reference,
              label: `${bookName(reference.book)} ${String(reference.chapter)}:${String(
                reference.verse,
              )}`,
              text: row.text,
            }),
          ),
        ),
      ),
    ),
    Effect.orElseSucceed((): readonly LookupVerseHit[] => []),
  );

const writingsHits = (
  writings: WritingsServiceApi,
  query: string,
): Effect.Effect<readonly LookupWritingsHit[]> =>
  writings.search(query, { limit: LOOKUP_HIT_LIMIT, scope: 'all' }).pipe(
    Effect.map((hits) =>
      hits.map((hit) =>
        LookupWritingsHit.make({
          refcode: Option.getOrElse(hit.paragraph.refcode, () => hit.publication.code),
          bookCode: hit.publication.code,
          bookTitle: hit.publication.title,
          author: hit.publication.author,
          snippet: nodesToText(hit.paragraph.nodes),
        }),
      ),
    ),
    Effect.orElseSucceed((): readonly LookupWritingsHit[] => []),
  );

const catalogMatches = (
  catalog: TopicServiceApi,
  selection: string,
  authored: ReadonlySet<string>,
): Effect.Effect<readonly LookupCatalogMatch[]> =>
  catalog.list({ query: selection }).pipe(
    Effect.map((topics) =>
      topics.slice(0, LOOKUP_TOPIC_LIMIT).flatMap((topic) =>
        Option.match(readSlug(topic.id), {
          onNone: (): readonly LookupCatalogMatch[] => [],
          onSome: (slug) => [
            LookupCatalogMatch.make({
              slug,
              name: topic.name,
              status: catalogStatus(authored, slug),
            }),
          ],
        }),
      ),
    ),
    Effect.orElseSucceed((): readonly LookupCatalogMatch[] => []),
  );

const isLonePeek = (result: {
  readonly topics: readonly LookupTopicMatch[];
  readonly strongs: readonly LookupStrongsHit[];
  readonly verses: readonly LookupVerseHit[];
  readonly writings: readonly LookupWritingsHit[];
  readonly catalog: readonly LookupCatalogMatch[];
}): boolean =>
  result.topics.length === 1 &&
  result.strongs.length === 0 &&
  result.verses.length === 0 &&
  result.writings.length === 0 &&
  result.catalog.length === 0;

interface LookupSources {
  readonly wiki: WikiServiceApi;
  readonly sections: SectionSourcing;
}

const makeResolve =
  (sources: LookupSources) =>
  (input: LookupInput): Effect.Effect<LookupResult> =>
    Effect.gen(function* () {
      const selection = selectionOf(input.text);
      const query = ftsPhrase(selection.text);

      if (selection.text.length === 0) return emptyResult(input.text);

      const dictionary = yield* sources.wiki.dictionary.pipe(
        Effect.asSome,
        Effect.orElseSucceed(() => Option.none<PhraseDictionary>()),
      );
      const topics = Option.match(dictionary, {
        onNone: (): readonly LookupTopicMatch[] => [],
        onSome: (found) => topicMatches(found, selection),
      });
      const authored = new Set(
        Option.match(dictionary, {
          onNone: (): readonly string[] => [],
          onSome: (found) => found.entries.map((row) => String(row.slug)),
        }),
      );

      const [strongs, verses, writings, catalog] = yield* resolveCorpusGroups(
        sources.sections,
        input,
        selection,
        query,
        authored,
      );

      return LookupResult.make({
        text: input.text,
        topics,
        strongs,
        verses,
        writings,
        catalog,
        lonePeek: isLonePeek({ topics, strongs, verses, writings, catalog }),
      });
    });

const resolveCorpusGroups = (
  sourcing: SectionSourcing,
  input: LookupInput,
  selection: Selection,
  query: string,
  authored: ReadonlySet<string>,
): Effect.Effect<
  readonly [
    readonly LookupStrongsHit[],
    readonly LookupVerseHit[],
    readonly LookupWritingsHit[],
    readonly LookupCatalogMatch[],
  ]
> => {
  if (sourcing._tag === 'not-wired') return Effect.succeed([[], [], [], []]);
  const sources: SectionSources = sourcing.sources;
  return Effect.all(
    [
      strongsHits(sources.bible, input.context, selection),
      verseHits(sources.bible, query),
      writingsHits(sources.writings, query),
      catalogMatches(sources.catalog, selection.text, authored),
    ],
    { concurrency: 'unbounded' },
  );
};

export class LookupService extends Context.Service<LookupService, LookupServiceApi>()(
  '@manna/core/wiki/LookupService',
) {
  static Live: Layer.Layer<LookupService, never, WikiService | WikiSectionSources> = Layer.effect(
    LookupService,
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const sections = yield* WikiSectionSources;
      return LookupService.of({
        resolve: Effect.fn('LookupService.resolve')(makeResolve({ wiki, sections })),
      });
    }),
  );
}
