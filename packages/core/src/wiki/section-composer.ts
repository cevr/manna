import { Cause, Context, Effect, Layer, Option, Predicate, Result, Schema } from 'effect';
import * as SqlError from 'effect/sql/SqlError';

import { getBibleBook, getBibleBookByName } from '../bible/canon.js';
import {
  Reference as BibleReference,
  chapterNumber,
  verseNumber,
  type VerseReference,
} from '../bible/model.js';
import {
  BibleDatabase,
  type BibleDatabaseService,
  type BibleVerse,
} from '../bible-db/bible-database.js';
import { EGWCommentaryService, type EGWCommentaryServiceApi } from '../egw-commentary/service.js';
import type { TopicId } from '../topics/model.js';
import { TopicService, type TopicServiceApi } from '../topics/service.js';
import { EGW_SCOPE_AUTHORS, type CorpusScope } from '../writings/corpus-scope.js';
import { WritingsService, type WritingsServiceApi } from '../writings/service.js';
import { nodesToText } from '../egw/ast.js';
import {
  type AuthoredCore,
  type Block,
  type Inline,
  type TopicEdge,
  type TopicSlug,
  WikiCommentaryEntry,
  WikiCommentarySection,
  WikiCrossReference,
  WikiCrossReferencesSection,
  WikiEgwStatementsSection,
  WikiKeyVersesSection,
  WikiMissingBook,
  WikiPassageRef,
  WikiPioneerWitnessesSection,
  WikiRelatedTopic,
  WikiRelatedTopicsSection,
  WikiSearchHandoff,
  type WikiSectionLineup,
  WikiVerseRef,
  WikiWritingsHit,
} from './model.js';

interface SectionCaps {
  readonly keyVerses: Option.Option<number>;
  readonly egwStatements: Option.Option<number>;
  readonly commentary: Option.Option<number>;
  readonly pioneerWitnesses: Option.Option<number>;
  readonly crossReferences: Option.Option<number>;
  readonly relatedTopics: Option.Option<number>;
}

export const SECTION_CAPS = {
  keyVerses: Option.some(8),
  egwStatements: Option.some(5),
  commentary: Option.some(5),
  pioneerWitnesses: Option.some(5),
  crossReferences: Option.some(10),
  relatedTopics: Option.none(),
} satisfies SectionCaps;

const capped = <A>(all: readonly A[], cap: Option.Option<number>): CappedItems<A> =>
  Option.match(cap, {
    onNone: (): CappedItems<A> => ({ items: all, total: all.length }),
    onSome: (limit) => ({ items: all.slice(0, limit), total: all.length }),
  });

interface SectionScopes {
  readonly egwStatements: CorpusScope;
  readonly pioneerWitnesses: CorpusScope;
}

export const SECTION_SCOPES = {
  egwStatements: 'egw',
  pioneerWitnesses: 'pioneer',
} satisfies SectionScopes;

const PASSAGE_TEXT_CHAPTER_LIMIT = 12;

interface CappedItems<A> {
  readonly items: readonly A[];
  readonly total: number;
}

export interface SectionSources {
  readonly catalog: TopicServiceApi;
  readonly bible: BibleDatabaseService;
  readonly writings: WritingsServiceApi;
  readonly commentary: EGWCommentaryServiceApi;
}

export type SectionSourcing =
  | { readonly _tag: 'wired'; readonly sources: SectionSources }
  | { readonly _tag: 'not-wired' };

export class WikiSectionSources extends Context.Service<WikiSectionSources, SectionSourcing>()(
  '@manna/core/wiki/WikiSectionSources',
) {
  static Live: Layer.Layer<
    WikiSectionSources,
    never,
    TopicService | BibleDatabase | WritingsService | EGWCommentaryService
  > = Layer.effect(
    WikiSectionSources,
    Effect.gen(function* () {
      return WikiSectionSources.of({
        _tag: 'wired',
        sources: {
          catalog: yield* TopicService,
          bible: yield* BibleDatabase,
          writings: yield* WritingsService,
          commentary: yield* EGWCommentaryService,
        },
      });
    }),
  );

  static NotWired: Layer.Layer<WikiSectionSources> = Layer.succeed(
    WikiSectionSources,
    WikiSectionSources.of({ _tag: 'not-wired' }),
  );

  static NotWiredOnCorpusAbsence = <E, R>(
    self: Layer.Layer<WikiSectionSources, E, R>,
  ): Layer.Layer<WikiSectionSources, E, R> =>
    self.pipe(
      Layer.catchCause((cause) =>
        Layer.unwrap(
          Effect.gen(function* () {
            if (!isCorpusUnavailable(cause)) return yield* Effect.failCause(cause);
            yield* Effect.logWarning('wiki.sectionSources.degraded-to-not-wired').pipe(
              Effect.annotateLogs({ cause: Cause.pretty(cause) }),
            );
            return WikiSectionSources.NotWired;
          }),
        ),
      ),
    );
}

const isCorpusUnavailable = (cause: Cause.Cause<unknown>): boolean => {
  if (Cause.hasInterrupts(cause)) return false;
  return cause.reasons.every((reason) => {
    if (reason._tag === 'Fail') return SqlError.isSqlError(reason.error);
    if (reason._tag === 'Die')
      return Option.exists(decodeSqliteThrow(reason.defect), isSqliteDefect);
    return false;
  });
};

const SqliteThrow = Schema.Struct({ code: Schema.String });

const decodeSqliteThrow = Schema.decodeUnknownOption(SqliteThrow);

const isSqliteDefect = (defect: SqliteThrow): boolean => defect.code.startsWith('SQLITE_');

type SqliteThrow = typeof SqliteThrow.Type;

export interface ComposeInput {
  readonly slug: TopicSlug;
  readonly title: string;
  readonly core: Option.Option<AuthoredCore>;
  readonly catalogId: Option.Option<TopicId>;
  readonly titleOf: (slug: TopicSlug) => Effect.Effect<Option.Option<string>>;
  readonly backlinksTo: (slug: TopicSlug) => Effect.Effect<readonly TopicEdge[]>;
}

const OSIS_VERSE = /^(\w+)\.(\d+)\.(\d+)$/;

const parseOsisVerse = (token: string): Option.Option<WikiVerseRef> => {
  const matched = Option.fromNullishOr(OSIS_VERSE.exec(token));
  if (Option.isNone(matched)) return Option.none();
  const [, abbreviation, chapter, verse] = matched.value;
  if (
    Predicate.isUndefined(abbreviation) ||
    Predicate.isUndefined(chapter) ||
    Predicate.isUndefined(verse)
  ) {
    return Option.none();
  }
  return getBibleBookByName(abbreviation).pipe(
    Option.map((book) =>
      WikiVerseRef.make({
        book: book.number,
        chapter: chapterNumber(Number(chapter)),
        verse: verseNumber(Number(verse)),
        label: `${book.name} ${chapter}:${verse}`,
        text: Option.none(),
      }),
    ),
  );
};

const rangeLabel = (start: WikiVerseRef, end: WikiVerseRef): string => {
  if (start.book !== end.book) return `${start.label}-${end.label}`;
  if (start.chapter !== end.chapter) {
    return `${start.label}-${String(end.chapter)}:${String(end.verse)}`;
  }
  return `${start.label}-${String(end.verse)}`;
};

type OsisRejection = 'unresolvable-book' | 'malformed-range' | 'reversed-range';

const parseOsisPassage = (token: string): Result.Result<WikiPassageRef, OsisRejection> => {
  const halves = token.split('-');
  const [startToken, endToken, ...rest] = halves;
  if (Predicate.isUndefined(startToken) || rest.length > 0) {
    return Result.fail('malformed-range');
  }
  const start = parseOsisVerse(startToken);
  if (Option.isNone(start)) return Result.fail('unresolvable-book');
  if (Predicate.isUndefined(endToken)) {
    return Result.succeed(
      WikiPassageRef.make({
        start: start.value,
        end: Option.none(),
        label: start.value.label,
        text: Option.none(),
      }),
    );
  }
  const end = parseOsisVerse(endToken);
  if (Option.isNone(end)) return Result.fail('unresolvable-book');
  if (!isBefore(start.value, end.value)) return Result.fail('reversed-range');
  return Result.succeed(
    WikiPassageRef.make({
      start: start.value,
      end: Option.some(end.value),
      label: rangeLabel(start.value, end.value),
      text: Option.none(),
    }),
  );
};

const isBefore = (start: WikiVerseRef, end: WikiVerseRef): boolean => {
  if (start.book !== end.book) return start.book < end.book;
  if (start.chapter !== end.chapter) return start.chapter < end.chapter;
  return start.verse < end.verse;
};

const keyVerses = (
  sources: SectionSources,
  slug: TopicSlug,
  catalogId: Option.Option<TopicId>,
): Effect.Effect<readonly WikiPassageRef[]> => {
  if (Option.isNone(catalogId)) return Effect.succeed([]);
  return sources.catalog.topic(catalogId.value).pipe(
    Effect.flatMap((detail) => {
      const seen = new Set<string>();
      const passages: WikiPassageRef[] = [];
      const rejected: { readonly token: string; readonly reason: OsisRejection }[] = [];
      for (const section of detail.sections) {
        for (const reference of section.references) {
          for (const token of reference.osis) {
            const parsed = parseOsisPassage(token);
            if (Result.isFailure(parsed)) {
              rejected.push({ token, reason: parsed.failure });
              continue;
            }
            const key = passageKey(parsed.success);
            if (seen.has(key)) continue;
            seen.add(key);
            passages.push(parsed.success);
          }
        }
      }
      return Effect.forEach(rejected, (entry) =>
        Effect.logWarning('wiki.keyVerses.rejected-osis-token').pipe(
          Effect.annotateLogs({ slug, token: entry.token, reason: entry.reason }),
        ),
      ).pipe(Effect.as(passages));
    }),
    Effect.orElseSucceed((): readonly WikiPassageRef[] => []),
  );
};

const verseKey = (verse: WikiVerseRef): string =>
  `${String(verse.book)}.${String(verse.chapter)}.${String(verse.verse)}`;

const passageKey = (passage: WikiPassageRef): string =>
  `${verseKey(passage.start)}-${Option.match(passage.end, {
    onNone: () => '',
    onSome: verseKey,
  })}`;

const withVerseText = (
  sources: SectionSources,
  passages: readonly WikiPassageRef[],
): Effect.Effect<readonly WikiPassageRef[]> =>
  Effect.forEach(passages, (passage) =>
    passageText(sources, passage).pipe(
      Effect.map((text) => WikiPassageRef.make({ ...passage, text })),
      Effect.orElseSucceed(() => passage),
    ),
  );

const passageText = (
  sources: SectionSources,
  passage: WikiPassageRef,
): Effect.Effect<Option.Option<string>> => {
  const end = passage.end;
  if (Option.isNone(end)) {
    return sources.bible
      .getVerse(passage.start.book, passage.start.chapter, passage.start.verse)
      .pipe(
        Effect.map(Option.map((row) => row.text)),
        Effect.orElseSucceed(() => Option.none<string>()),
      );
  }
  const span = chapterSpan(passage.start, end.value);
  if (span.length === 0) return Effect.succeedNone;
  return Effect.forEach(span, (address) =>
    sources.bible.getChapter(address.book, address.chapter).pipe(
      Effect.map((verses) =>
        verses.filter((verse) => withinSpan(passage.start, end.value, address, verse.verse)),
      ),
      Effect.orElseSucceed((): readonly BibleVerse[] => []),
    ),
  ).pipe(
    Effect.map((chapters) => {
      const spanned = chapters.flat();
      if (spanned.length === 0) return Option.none<string>();
      return Option.some(spanned.map((verse) => verse.text).join(' '));
    }),
  );
};

interface ChapterAddress {
  readonly book: number;
  readonly chapter: number;
}

const firstChapterOf = (book: number, start: WikiVerseRef): number => {
  if (book === start.book) return start.chapter;
  return 1;
};

const lastChapterOf = (book: number, end: WikiVerseRef, chapters: number): number => {
  if (book === end.book) return end.chapter;
  return chapters;
};

const chapterSpan = (start: WikiVerseRef, end: WikiVerseRef): readonly ChapterAddress[] => {
  const addresses: ChapterAddress[] = [];
  for (let book = start.book; book <= end.book; book++) {
    const found = getBibleBook(book);
    if (Option.isNone(found)) return [];
    const first = firstChapterOf(book, start);
    const last = lastChapterOf(book, end, found.value.chapters);
    for (let chapter = first; chapter <= last; chapter++) {
      if (addresses.length >= PASSAGE_TEXT_CHAPTER_LIMIT) return [];
      addresses.push({ book, chapter });
    }
  }
  return addresses;
};

const withinSpan = (
  start: WikiVerseRef,
  end: WikiVerseRef,
  address: ChapterAddress,
  verse: number,
): boolean => {
  if (address.book === start.book && address.chapter === start.chapter && verse < start.verse) {
    return false;
  }
  if (address.book === end.book && address.chapter === end.chapter && verse > end.verse) {
    return false;
  }
  return true;
};

const canonicalPhrase = (input: ComposeInput): string =>
  input.core.pipe(
    Option.flatMap((core) => Option.fromNullishOr(core.aliases.find((alias) => alias.canonical))),
    Option.map((alias) => alias.display),
    Option.getOrElse(() => input.title),
  );

const ftsPhrase = (phrase: string): string => `"${phrase.replaceAll('"', '""')}"`;

const writingsHits = (
  sources: SectionSources,
  phrase: string,
  scope: CorpusScope,
  cap: Option.Option<number>,
): Effect.Effect<CappedItems<WikiWritingsHit>> => {
  const query = ftsPhrase(phrase);
  const hits = sources.writings
    .search(
      query,
      Option.match(cap, {
        onNone: () => ({ scope }),
        onSome: (limit) => ({ limit, scope }),
      }),
    )
    .pipe(
      Effect.map((found) =>
        found.map((hit) =>
          WikiWritingsHit.make({
            refcode: Option.getOrElse(hit.paragraph.refcode, () => hit.publication.code),
            bookCode: hit.publication.code,
            bookTitle: hit.publication.title,
            author: hit.publication.author,
            snippet: Option.some(nodesToText(hit.paragraph.nodes)),
            absence: Option.none(),
          }),
        ),
      ),
      Effect.orElseSucceed((): readonly WikiWritingsHit[] => []),
    );
  const matches = sources.writings.searchCount(query, { scope }).pipe(
    Effect.asSome,
    Effect.orElseSucceed(() => Option.none<number>()),
  );
  return Effect.all([hits, matches], { concurrency: 'unbounded' }).pipe(
    Effect.map(([all, total]) => {
      const items = Option.match(cap, {
        onNone: () => all,
        onSome: (limit) => all.slice(0, limit),
      });
      return { items, total: Option.getOrElse(total, () => items.length) };
    }),
  );
};

const citedMissingBooks = (
  sources: SectionSources,
  core: Option.Option<AuthoredCore>,
): Effect.Effect<readonly WikiMissingBook[]> =>
  Effect.forEach(Option.match(core, { onNone: noCitations, onSome: citationsIn }), (refcode) =>
    resolveCitation(sources, refcode),
  ).pipe(Effect.map((resolved) => dedupeByRefcode(resolved.flatMap(present))));

const dedupeByRefcode = (books: readonly WikiMissingBook[]): readonly WikiMissingBook[] => {
  const seen = new Set<string>();
  const unique: WikiMissingBook[] = [];
  for (const book of books) {
    if (seen.has(book.refcode)) continue;
    seen.add(book.refcode);
    unique.push(book);
  }
  return unique;
};

const present = <A>(value: Option.Option<A>): readonly A[] =>
  Option.match(value, { onNone: (): readonly A[] => [], onSome: (found) => [found] });

const noCitations = (): readonly string[] => [];

const citationsIn = (core: AuthoredCore): readonly string[] =>
  [...core.thesis, ...core.body].flatMap(blockInlines).flatMap(citedRefcode);

const blockInlines = (block: Block): readonly Inline[] => {
  if (block._tag === 'list') return block.items.flat();
  return block.content;
};

const citedRefcode = (inline: Inline): readonly string[] => {
  if (inline._tag === 'citation') return [inline.refcode];
  return [];
};

const refcodeBookCode = (refcode: string): Option.Option<string> =>
  Option.fromNullishOr(refcode.trim().split(/\s+/)[0]).pipe(
    Option.filter((code) => code.length > 0),
  );

const resolveCitation = (
  sources: SectionSources,
  refcode: string,
): Effect.Effect<Option.Option<WikiMissingBook>> => {
  const code = refcodeBookCode(refcode);
  if (Option.isNone(code)) return Effect.succeedNone;
  return sources.writings.publicationByCode(code.value).pipe(
    Effect.map((publication) => {
      const installed = Option.getOrElse(publication.paragraphCount, () => 0) > 0;
      if (installed) return Option.none<WikiMissingBook>();
      return Option.some(
        WikiMissingBook.make({
          refcode,
          bookCode: publication.code,
          bookTitle: publication.title,
          author: publication.author,
          absence: 'not-installed',
        }),
      );
    }),
    Effect.orElseSucceed(() => Option.none<WikiMissingBook>()),
  );
};

const missingBooksInScope = (
  books: readonly WikiMissingBook[],
  scope: CorpusScope,
): readonly WikiMissingBook[] => books.filter((book) => scopeAdmits(scope, book.author));

const scopeAdmits = (scope: CorpusScope, author: string): boolean => {
  if (scope === 'all') return true;
  const isEgw = EGW_SCOPE_AUTHORS.includes(author);
  if (scope === 'egw') return isEgw;
  return !isEgw;
};

const refcodeOr = (refcode: string, fallback: string): string =>
  Option.getOrElse(
    Option.filter(Option.some(refcode), (value) => value.length > 0),
    () => fallback,
  );

const commentaryEntries = (
  sources: SectionSources,
  passages: readonly WikiPassageRef[],
  cap: Option.Option<number>,
): Effect.Effect<CappedItems<WikiCommentaryEntry>> =>
  Effect.forEach(passages, (passage) =>
    sources.commentary.getCommentary(verseReference(passage.start)).pipe(
      Effect.map((result) =>
        result.entries.map((entry) =>
          WikiCommentaryEntry.make({
            verse: passage.start,
            refcode: refcodeOr(entry.refcode, entry.bookCode),
            bookCode: entry.bookCode,
            bookTitle: entry.bookTitle,
            content: entry.content,
          }),
        ),
      ),
      Effect.orElseSucceed((): readonly WikiCommentaryEntry[] => []),
    ),
  ).pipe(Effect.map((perVerse) => capped(perVerse.flat(), cap)));

const verseReference = (verse: WikiVerseRef): VerseReference =>
  BibleReference.verse(verse.book, verse.chapter, verse.verse);

const crossReferences = (
  sources: SectionSources,
  passages: readonly WikiPassageRef[],
  cap: Option.Option<number>,
): Effect.Effect<CappedItems<WikiCrossReference>> =>
  Effect.forEach(passages, (passage) =>
    sources.bible.getCrossRefs(passage.start.book, passage.start.chapter, passage.start.verse).pipe(
      Effect.map((rows) =>
        rows.flatMap((row) =>
          crossReferenceTarget(row.book, row.chapter, row.verse).pipe(
            Option.map((to) =>
              WikiCrossReference.make({
                from: passage.start,
                to,
                source: row.source,
                preview: row.previewText,
              }),
            ),
            Option.match({
              onNone: (): readonly WikiCrossReference[] => [],
              onSome: (reference) => [reference],
            }),
          ),
        ),
      ),
      Effect.orElseSucceed((): readonly WikiCrossReference[] => []),
    ),
  ).pipe(
    Effect.map((perVerse) => {
      const seen = new Set<string>();
      const all: WikiCrossReference[] = [];
      for (const reference of perVerse.flat()) {
        const key = verseKey(reference.to);
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(reference);
      }
      return capped(all, cap);
    }),
  );

const crossReferenceTarget = (
  book: number,
  chapter: number,
  verse: Option.Option<number>,
): Option.Option<WikiVerseRef> => {
  const target = Option.getOrElse(verse, () => 1);
  return getBibleBook(book).pipe(
    Option.map((found) =>
      WikiVerseRef.make({
        book: found.number,
        chapter: chapterNumber(chapter),
        verse: verseNumber(target),
        label: `${found.name} ${String(chapter)}:${String(target)}`,
        text: Option.none(),
      }),
    ),
  );
};

const relatedTopics = (input: ComposeInput): Effect.Effect<readonly WikiRelatedTopic[]> =>
  Effect.gen(function* () {
    const edges = Option.match(input.core, {
      onNone: (): readonly TopicEdge[] => [],
      onSome: (core) => core.edges,
    });
    const live = yield* input.backlinksTo(input.slug);
    const seen = new Set<string>([String(input.slug)]);
    const ordered: TopicEdge[] = [];
    for (const edge of [
      ...edges.filter((edge) => edge.kind === 'authored'),
      ...edges.filter((edge) => edge.kind === 'backlink'),
      ...live,
    ]) {
      const key = String(edge.slug);
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(edge);
    }
    return yield* Effect.forEach(ordered, (edge) =>
      input.titleOf(edge.slug).pipe(
        Effect.map((title) =>
          WikiRelatedTopic.make({
            slug: edge.slug,
            title: Option.getOrElse(title, () => String(edge.slug)),
            kind: edge.kind,
          }),
        ),
      ),
    );
  });

export const composeSections = Effect.fn('Wiki.composeSections')(function* (
  sources: SectionSources,
  input: ComposeInput,
) {
  const phrase = canonicalPhrase(input);
  const allKeyVerses = yield* keyVerses(sources, input.slug, input.catalogId);
  const keyPassages = capped(allKeyVerses, SECTION_CAPS.keyVerses);
  const withText = yield* withVerseText(sources, keyPassages.items);
  const missing = yield* citedMissingBooks(sources, input.core);

  const [egwHits, pioneerHits, commentary, crossRefs, related] = yield* Effect.all(
    [
      writingsHits(sources, phrase, SECTION_SCOPES.egwStatements, SECTION_CAPS.egwStatements),
      writingsHits(sources, phrase, SECTION_SCOPES.pioneerWitnesses, SECTION_CAPS.pioneerWitnesses),
      commentaryEntries(sources, withText, SECTION_CAPS.commentary),
      crossReferences(sources, withText, SECTION_CAPS.crossReferences),
      relatedTopics(input),
    ],
    { concurrency: 'unbounded' },
  );

  const relatedTopicsSection = capped(related, SECTION_CAPS.relatedTopics);

  const lineup: WikiSectionLineup = [
    WikiKeyVersesSection.make({
      items: withText,
      total: keyPassages.total,
      defaultOpen: true,
    }),
    WikiEgwStatementsSection.make({
      items: egwHits.items,
      total: egwHits.total,
      defaultOpen: false,
      handoff: Option.some(
        WikiSearchHandoff.make({ query: phrase, scope: SECTION_SCOPES.egwStatements }),
      ),
      missingBooks: missingBooksInScope(missing, SECTION_SCOPES.egwStatements),
    }),
    WikiCommentarySection.make({
      items: commentary.items,
      total: commentary.total,
      defaultOpen: false,
    }),
    WikiPioneerWitnessesSection.make({
      items: pioneerHits.items,
      total: pioneerHits.total,
      defaultOpen: false,
      handoff: Option.some(
        WikiSearchHandoff.make({ query: phrase, scope: SECTION_SCOPES.pioneerWitnesses }),
      ),
      missingBooks: missingBooksInScope(missing, SECTION_SCOPES.pioneerWitnesses),
    }),
    WikiCrossReferencesSection.make({
      items: crossRefs.items,
      total: crossRefs.total,
      defaultOpen: false,
    }),
    WikiRelatedTopicsSection.make({
      items: relatedTopicsSection.items,
      total: relatedTopicsSection.total,
      defaultOpen: false,
    }),
  ];
  return lineup;
});

export const emptySectionLineup = (): WikiSectionLineup => [
  WikiKeyVersesSection.make({ items: [], total: 0, defaultOpen: true }),
  WikiEgwStatementsSection.make({
    items: [],
    total: 0,
    defaultOpen: false,
    handoff: Option.none(),
    missingBooks: [],
  }),
  WikiCommentarySection.make({ items: [], total: 0, defaultOpen: false }),
  WikiPioneerWitnessesSection.make({
    items: [],
    total: 0,
    defaultOpen: false,
    handoff: Option.none(),
    missingBooks: [],
  }),
  WikiCrossReferencesSection.make({ items: [], total: 0, defaultOpen: false }),
  WikiRelatedTopicsSection.make({ items: [], total: 0, defaultOpen: false }),
];
