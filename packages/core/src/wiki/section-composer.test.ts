/** Milestone 3's core contract: the §6.1 lineup, its caps, its ordering, and
 *  the §6.3 partial-corpus degradation — asserted against the one composer both
 *  flagship and catalog pages traverse. */

import { BunFileSystem } from '@effect/platform-bun';
import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Database } from 'bun:sqlite';
import {
  Cause,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Logger,
  Option,
  References,
  Schema,
  type Scope,
} from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { BIBLE_BOOKS } from '../bible/canon.js';
import { BibleDatabase } from '../bible-db/bible-database.js';
import type { CrossReference } from '../bible-db/bible-database.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import type * as EGWSchemas from '../egw/schemas.js';
import { TopicDetail, TopicId, TopicReference, TopicSection } from '../topics/model.js';
import { TopicService } from '../topics/service.js';
import { EGW_SCOPE_AUTHORS } from '../writings/corpus-scope.js';
import { WritingsService } from '../writings/service.js';
import {
  BlocksJson,
  CitationInline,
  ParagraphBlock,
  TextInline,
  topicSlug,
  WikiCommentaryEntry,
  type WikiSection,
  type WikiWritingsHit,
} from './model.js';
import { SECTION_CAPS, SECTION_SCOPES, WikiSectionSources } from './section-composer.js';
import { layerBunOrAbsent } from './artifact-fixture.js';
import { WikiService } from './service.js';

/** An `Option` as a zero-or-one array, so a `for` loop or a `flatMap` drops the
 *  empty case without a nullish check. */
const present = <A>(value: Option.Option<A>): readonly A[] =>
  Option.match(value, { onNone: (): readonly A[] => [], onSome: (found) => [found] });

const verseNumbers = (count: number): readonly number[] =>
  Array.from({ length: count }, (_, index) => index + 1);

/** One Nave's-shaped catalog topic with `count` distinct verses in John 11, in
 *  catalog position order. Enough of them to exceed every cap under test. */
const catalogTopic = (id: string, count: number): TopicDetail =>
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)(id),
    name: 'Sanctuary',
    alternativeNames: [],
    sections: [
      TopicSection.make({
        label: 'General references',
        references: verseNumbers(count).map((verse) =>
          TopicReference.make({
            raw: `John 11:${String(verse)}`,
            osis: [`John.11.${String(verse)}`],
          }),
        ),
      }),
    ],
  });

/** A catalog topic whose references are given verbatim, so a test can pin the
 *  exact OSIS tokens the catalog really stores — ranges included. */
const catalogTopicWith = (
  id: string,
  references: readonly { readonly raw: string; readonly osis: readonly string[] }[],
): TopicDetail =>
  TopicDetail.make({
    id: Schema.decodeSync(TopicId)(id),
    name: 'Sanctuary',
    alternativeNames: [],
    sections: [
      TopicSection.make({
        label: 'General references',
        references: references.map((reference) =>
          TopicReference.make({ raw: reference.raw, osis: reference.osis }),
        ),
      }),
    ],
  });

const book = (input: {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly author: string;
}) => ({
  book_id: input.id,
  book_code: input.code,
  book_title: input.title,
  book_author: input.author,
  paragraph_count: 1,
  created_at: '2026-01-01T00:00:00.000Z',
});

/** A book the catalog knows about but this library has not downloaded: zero
 *  paragraphs is exactly the state §6.3 calls a partial corpus. */
const uninstalledBook = (input: {
  readonly id: number;
  readonly code: string;
  readonly title: string;
  readonly author: string;
}) => ({ ...book(input), paragraph_count: 0 });

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

const EGW_AUTHOR = EGW_SCOPE_AUTHORS[0];
const PIONEER_AUTHOR = 'Uriah Smith';

const BOOKS = [
  book({ id: 1, code: 'GC', title: 'The Great Controversy', author: EGW_AUTHOR }),
  book({ id: 2, code: 'PP', title: 'Patriarchs and Prophets', author: EGW_AUTHOR }),
  book({ id: 3, code: 'DAR', title: 'Daniel and the Revelation', author: PIONEER_AUTHOR }),
  book({ id: 4, code: 'TSAM', title: 'Thoughts on Matthew', author: PIONEER_AUTHOR }),
  uninstalledBook({ id: 5, code: 'ABSENT', title: 'A Book You Do Not Have', author: EGW_AUTHOR }),
];

/** The number of matching paragraphs each FTS scope holds — two past the cap of
 *  5, so a missing cap shows up as extra items and, separately, a `total` that
 *  merely counts the returned rows shows up as 5 where 7 is the truth. */
const MATCHING_PARAGRAPHS_PER_SCOPE = 7;

/** The fixture text carries **the whole canonical phrase**, article included.
 *
 *  Production FTS5 combines the terms of a query with an implicit AND, so a
 *  paragraph reading `sanctuary egw 1` does not answer the phrase
 *  `"The Sanctuary"` — it is missing `the`. While the in-memory double ORed its
 *  terms, that distinction was invisible here and a flagship page whose title is
 *  `The Sanctuary` appeared to match rows that the live corpus would never have
 *  returned. Spelling the article into the text is what makes these fixtures
 *  answer the query the composer actually issues. */
const PARAGRAPHS = [
  ...verseNumbers(MATCHING_PARAGRAPHS_PER_SCOPE).map((n) =>
    paragraph({ code: 'GC', refcode: `GC ${String(n)}.1`, text: `the sanctuary egw ${String(n)}` }),
  ),
  ...verseNumbers(MATCHING_PARAGRAPHS_PER_SCOPE).map((n) =>
    paragraph({
      code: 'DAR',
      refcode: `DAR ${String(n)}.1`,
      text: `the sanctuary pioneer ${String(n)}`,
    }),
  ),
];

const CROSS_REFS = verseNumbers(8).map((verse) => ({
  book: 43,
  chapter: 11,
  verse,
  references: verseNumbers(3).map((target): CrossReference => ({
    book: 43,
    chapter: verse,
    verse: Option.some(target),
    verseEnd: Option.none(),
    source: 'openbible',
    previewText: Option.none(),
  })),
}));

const JOHN = BIBLE_BOOKS[42];

const VERSES = [
  ...verseNumbers(12).map((verse) => ({
    book: 43,
    chapter: 11,
    verse,
    versionCode: 'KJV',
    text: `John 11:${String(verse)} text`,
  })),
  ...verseNumbers(6).map((verse) => ({
    book: 39,
    chapter: 4,
    verse,
    versionCode: 'KJV',
    text: `Mal 4:${String(verse)} text`,
  })),
  ...verseNumbers(3).map((verse) => ({
    book: 40,
    chapter: 1,
    verse,
    versionCode: 'KJV',
    text: `Matt 1:${String(verse)} text`,
  })),
];

const COMMENTARY = verseNumbers(3).map((index) => ({
  refcode: `5BC 11${String(index)}.1`,
  bookCode: '5BC',
  bookTitle: 'Bible Commentary Volume 5',
  bookAuthor: 'Ellen Gould White',
  content: `Commentary ${String(index)}`,
  puborder: index,
}));

const sourcesLayer = (topics: readonly TopicDetail[], commentary: typeof COMMENTARY = COMMENTARY) =>
  WikiSectionSources.Live.pipe(
    Layer.provide(TopicService.Test(topics)),
    Layer.provide(BibleDatabase.layerTest({ verses: VERSES, crossRefs: CROSS_REFS })),
    Layer.provide(EGWCommentaryService.Test({ entries: commentary })),
    Layer.provide(
      WritingsService.Live.pipe(
        Layer.provide(EGWParagraphDatabase.Test({ books: BOOKS, paragraphs: PARAGRAPHS })),
      ),
    ),
  );

interface ArtifactTopic {
  readonly slug: string;
  readonly title: string;
  readonly thesis: string;
  readonly aliases?: readonly { readonly alias: string; readonly canonical: boolean }[];
  readonly edges?: readonly { readonly to: string; readonly kind: string }[];
  readonly catalogId?: string;
}

const encodeBlocks = Schema.encodeSync(BlocksJson);

const THESIS = encodeBlocks([
  ParagraphBlock.make({ content: [TextInline.make({ text: 'The thesis.' })] }),
]);

/** A thesis that cites a book this library does not hold — the only path that
 *  can produce a §6.3 entry, because FTS cannot reach an uninstalled book. */
const CITING_THESIS = encodeBlocks([
  ParagraphBlock.make({
    content: [
      TextInline.make({ text: 'As it is written, ' }),
      CitationInline.make({ text: 'the sanctuary shall be cleansed', refcode: 'ABSENT 12.3' }),
    ],
  }),
]);

const EMPTY = encodeBlocks([]);

const writeArtifact = (file: string, topics: readonly ArtifactTopic[]): string => {
  const database = new Database(file, { create: true });
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
  `);
  database.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema_major', '1');
  const insertTopic = database.prepare(
    'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
  );
  const insertAlias = database.prepare(
    'INSERT INTO topic_aliases (alias, display, slug, canonical) VALUES (?, ?, ?, ?)',
  );
  const insertEdge = database.prepare(
    'INSERT INTO topic_edges (from_slug, to_slug, kind, position) VALUES (?, ?, ?, ?)',
  );
  const insertKey = database.prepare(
    'INSERT INTO topic_catalog_keys (slug, catalog_id, matched_by) VALUES (?, ?, ?)',
  );
  for (const [index, topic] of topics.entries()) {
    insertTopic.run(topic.slug, topic.title, topic.thesis, EMPTY, index);
    for (const alias of topic.aliases ?? []) {
      insertAlias.run(alias.alias, alias.alias, topic.slug, Number(alias.canonical));
    }
    for (const [position, edge] of (topic.edges ?? []).entries()) {
      insertEdge.run(topic.slug, edge.to, edge.kind, position);
    }
    for (const catalogId of present(Option.fromUndefinedOr(topic.catalogId))) {
      insertKey.run(topic.slug, catalogId, 'override');
    }
  }
  database.close();
  return file;
};

const artifact = (
  topics: readonly ArtifactTopic[],
): Effect.Effect<string, never, FileSystem.FileSystem | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs
      .makeTempDirectoryScoped({ prefix: 'bible-wiki-composer-' })
      .pipe(Effect.orDie);
    return yield* Effect.sync(() => writeArtifact(`${directory}/topics.db`, topics));
  });

const live = (file: string, topics: readonly TopicDetail[]): Layer.Layer<WikiService> =>
  WikiService.Live.pipe(
    Layer.provide(SqliteBun.layer({ filename: file, readonly: true })),
    Layer.provide(TopicService.Test(topics)),
    Layer.provide(sourcesLayer(topics)),
    Layer.orDie,
  );

/** The artifact and the `WikiService` that reads it, as one layer.
 *
 *  Every test below wires a fresh SQLite artifact and then a service over it,
 *  so the wiring is a *layer* rather than a step inside the test body: the temp
 *  file is written while the layer is built, and the whole thing is provided
 *  once at the test's own boundary. */
const artifactLayer = (
  topics: readonly ArtifactTopic[],
  layerFor: (file: string) => Layer.Layer<WikiService>,
): Layer.Layer<WikiService, never, FileSystem.FileSystem> =>
  Layer.unwrap(Effect.map(artifact(topics), layerFor));

/** One captured log line, reduced to the two things an assertion cares about.
 *  The annotations are read off the fiber the same way every real logger reads
 *  them, so a test asserting on them is asserting on what an operator sees. */
interface CapturedLog {
  /** The rendered message. `Effect.logWarning` takes varargs, so the logger
   *  receives an array; joining it here keeps the assertion about the event
   *  name rather than about the arity of the call that produced it. */
  readonly message: string;
  /** The three annotations the rejected-token warning carries, decoded rather
   *  than indexed out of an untyped dictionary — an assertion reaching into a
   *  `Record<string, unknown>` cannot notice when the warning stops carrying
   *  one of them, which is the regression this file exists to catch. */
  readonly annotations: Option.Option<RejectionAnnotations>;
}

const RejectionAnnotations = Schema.Struct({
  slug: Schema.String,
  token: Schema.String,
  reason: Schema.String,
});
type RejectionAnnotations = typeof RejectionAnnotations.Type;

const decodeAnnotations = Schema.decodeUnknownOption(RejectionAnnotations);

/** A logged message, as `Effect.logWarning`'s varargs really deliver it.
 *
 *  `Logger.layer` types every logger's `Message` as `unknown`, so the shape is
 *  established here — at the boundary where the log record arrives — rather
 *  than assumed at each use. Joining the parts keeps the assertion about the
 *  event name rather than about the arity of the call that produced it. */
const LoggedMessage = Schema.Array(Schema.String);

const decodeLoggedMessage = Schema.decodeUnknownOption(LoggedMessage);

/** Runs an effect with the default loggers replaced by a recorder, and returns
 *  the warnings it emitted.
 *
 *  A diagnostic that only exists as a comment is not a diagnostic, so the
 *  rejected-token warning is asserted rather than assumed — and replacing the
 *  logger keeps the suite's output clean while doing it. */
const captureWarnings = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<readonly CapturedLog[], E, R> => {
  const captured: CapturedLog[] = [];
  const recorder = Logger.make<unknown, void>((options) => {
    if (options.logLevel !== 'Warn') return;
    captured.push({
      message: decodeLoggedMessage(options.message).pipe(
        Option.map((parts) => parts.join(' ')),
        Option.getOrElse(() => ''),
      ),
      annotations: decodeAnnotations(options.fiber.getRef(References.CurrentLogAnnotations)),
    });
  });
  return effect.pipe(Effect.provide(Logger.layer([recorder])), Effect.as(captured));
};

const kinds = (sections: readonly WikiSection[]): readonly string[] =>
  sections.map((section) => section._tag);

const counts = (sections: readonly WikiSection[]): readonly number[] =>
  sections.map((section) => section.items.length);

const writingsSection = (
  sections: readonly WikiSection[],
  tag: 'egw-statements' | 'pioneer-witnesses',
): readonly WikiWritingsHit[] => {
  const found = Option.fromUndefinedOr(sections.find((section) => section._tag === tag));
  if (Option.isNone(found)) return [];
  if (found.value._tag !== 'egw-statements' && found.value._tag !== 'pioneer-witnesses') return [];
  return found.value.items;
};

const LINEUP = [
  'key-verses',
  'egw-statements',
  'commentary',
  'pioneer-witnesses',
  'cross-references',
  'related-topics',
];

/** Type-level assertion, enforced by `tsc --noEmit` rather than at run time:
 *  `WikiSectionSources` is a **required** input of `WikiService.Live`.
 *
 *  This is the guard that makes a forgotten wiring impossible rather than
 *  merely detectable. While `WikiService` read the tag with
 *  `Effect.serviceOption`, `WikiSectionSources` was absent from this type — a
 *  host could build the service without it, and every topic page came back with
 *  a silently empty lineup. Relax the requirement back to optional and
 *  `WikiSectionSources` leaves the requirements union, `Requires` stops
 *  extending it, and the assignment below stops compiling.
 *
 *  Written as a type rather than as a `@ts-expect-error` on a real
 *  `Layer.provide` chain because the Effect language-service plugin reports a
 *  missing layer requirement as its own diagnostic (`TS38
 *  effect(missingLayerContext)`), which `@ts-expect-error` does not suppress —
 *  the negative test would fail for the right reason but in a way the gate
 *  could not distinguish from a genuine break. */
type Requires<L> = L extends Layer.Layer<infer _A, infer _E, infer R> ? R : never;
const sectionSourcesAreRequired: WikiSectionSources extends Requires<typeof WikiService.Live>
  ? true
  : never = true;
void sectionSourcesAreRequired;

describe('section composer', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('emits the §6.1 lineup in order with the specified caps', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      expect(kinds(page.sections)).toEqual(LINEUP);
      expect(counts(page.sections)).toEqual([
        Option.getOrThrow(SECTION_CAPS.keyVerses),
        Option.getOrThrow(SECTION_CAPS.egwStatements),
        Option.getOrThrow(SECTION_CAPS.commentary),
        Option.getOrThrow(SECTION_CAPS.pioneerWitnesses),
        Option.getOrThrow(SECTION_CAPS.crossReferences),
        3,
      ]);
      expect(counts(page.sections)).toEqual([8, 5, 5, 5, 10, 3]);
      expect(Option.isNone(SECTION_CAPS.relatedTopics)).toBe(true);
      expect(page.sections.map((section) => section.total)).toEqual([
        12,
        MATCHING_PARAGRAPHS_PER_SCOPE,
        24,
        MATCHING_PARAGRAPHS_PER_SCOPE,
        24,
        3,
      ]);
      expect(page.sections[1]?.total).toBeGreaterThan(page.sections[1]?.items.length ?? 0);
      expect(page.sections[3]?.total).toBeGreaterThan(page.sections[3]?.items.length ?? 0);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              catalogId: 'naves.sanctuary',
              aliases: [{ alias: 'sanctuary', canonical: true }],
              edges: [
                { to: 'day-of-atonement', kind: 'backlink' },
                { to: '2300-days', kind: 'authored' },
                { to: 'investigative-judgment', kind: 'authored' },
              ],
            },
          ],
          (file) => live(file, [catalogTopic('naves.sanctuary', 12)]),
        ),
      ),
    ));

  test('marks key verses default-open and every other section collapsed', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      expect(page.sections.map((section) => section.defaultOpen)).toEqual([
        true,
        false,
        false,
        false,
        false,
        false,
      ]);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              catalogId: 'naves.sanctuary',
            },
          ],
          (file) => live(file, [catalogTopic('naves.sanctuary', 3)]),
        ),
      ),
    ));

  test('renders an uninstalled-book citation as refcode + title + marker, no snippet', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      const egw = page.sections[1];
      if (egw._tag !== 'egw-statements') {
        return yield* Effect.fail('lineup position 2 is not the EGW statements section');
      }
      expect(egw.missingBooks.length).toBe(1);
      const entry = egw.missingBooks[0];
      expect(entry?.refcode).toBe('ABSENT 12.3');
      expect(entry?.bookTitle).toBe('A Book You Do Not Have');
      expect(entry?.absence).toBe('not-installed');
      expect(egw.items.every((hit) => Option.isSome(hit.snippet))).toBe(true);
      expect(egw.items.every((hit) => Option.isNone(hit.absence))).toBe(true);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: CITING_THESIS,
              aliases: [{ alias: 'sanctuary', canonical: true }],
            },
          ],
          (file) => live(file, []),
        ),
      ),
    ));

  test('scopes section 2 to EGW and section 4 to pioneers, disjointly', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      const egw = writingsSection(page.sections, 'egw-statements');
      const pioneer = writingsSection(page.sections, 'pioneer-witnesses');
      expect(egw.length).toBeGreaterThan(0);
      expect(pioneer.length).toBeGreaterThan(0);
      expect(egw.every((hit) => EGW_SCOPE_AUTHORS.includes(hit.author))).toBe(true);
      expect(pioneer.every((hit) => !EGW_SCOPE_AUTHORS.includes(hit.author))).toBe(true);
      expect(egw.some((hit) => hit.bookCode === 'DAR')).toBe(false);
      expect(pioneer.some((hit) => hit.bookCode === 'GC')).toBe(false);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              aliases: [{ alias: 'sanctuary', canonical: true }],
            },
          ],
          (file) => live(file, []),
        ),
      ),
    ));

  test('ends sections 2 and 4 in a scoped search handoff, not a long tail', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      const egw = page.sections[1];
      const pioneer = page.sections[3];
      if (egw?._tag !== 'egw-statements' || pioneer?._tag !== 'pioneer-witnesses') {
        return yield* Effect.fail('lineup positions 2 and 4 are not the FTS sections');
      }
      expect(egw.handoff).toEqual(
        Option.some({ query: 'heavenly sanctuary', scope: SECTION_SCOPES.egwStatements }),
      );
      expect(pioneer.handoff).toEqual(
        Option.some({ query: 'heavenly sanctuary', scope: SECTION_SCOPES.pioneerWitnesses }),
      );
      expect(SECTION_SCOPES.egwStatements).toBe('egw');
      expect(SECTION_SCOPES.pioneerWitnesses).toBe('pioneer');
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              aliases: [
                { alias: 'heavenly sanctuary', canonical: true },
                { alias: 'sanctuary', canonical: false },
              ],
            },
          ],
          (file) => live(file, []),
        ),
      ),
    ));

  test('sends catalog and flagship pages through the same composer', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const flagship = yield* wiki.topic(topicSlug('sanctuary'));
      const catalog = yield* wiki.topic(topicSlug('naves.sanctuary'));
      expect(flagship.status).toBe('flagship');
      expect(catalog.status).toBe('catalog');
      expect(Option.isNone(catalog.core)).toBe(true);
      expect(kinds(catalog.sections)).toEqual(LINEUP);
      expect(kinds(flagship.sections)).toEqual(kinds(catalog.sections));
      expect(counts(catalog.sections).slice(0, 5)).toEqual(counts(flagship.sections).slice(0, 5));
      expect(catalog.title).toBe('Sanctuary');
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              catalogId: 'naves.sanctuary',
            },
          ],
          (file) => live(file, [catalogTopic('naves.sanctuary', 12)]),
        ),
      ),
    ));

  test('orders related topics authored-first, then backlinks, in edge position', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      const related = page.sections[5];
      if (related?._tag !== 'related-topics') {
        return yield* Effect.fail('lineup position 6 is not the related-topics section');
      }
      expect(related.items.map((item) => String(item.slug))).toEqual([
        'aaa-authored',
        'mmm-authored',
        'zzz-backlink',
      ]);
      expect(related.items.map((item) => item.kind)).toEqual(['authored', 'authored', 'backlink']);
      expect(related.items.map((item) => item.title)).toEqual([
        'First Authored',
        'Second Authored',
        'A Backlink',
      ]);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              edges: [
                { to: 'zzz-backlink', kind: 'backlink' },
                { to: 'aaa-authored', kind: 'authored' },
                { to: 'mmm-authored', kind: 'authored' },
              ],
            },
            { slug: 'aaa-authored', title: 'First Authored', thesis: THESIS },
            { slug: 'mmm-authored', title: 'Second Authored', thesis: THESIS },
            { slug: 'zzz-backlink', title: 'A Backlink', thesis: THESIS },
          ],
          (file) => live(file, []),
        ),
      ),
    ));

  test('keeps the lineup whole when the corpus has nothing to say', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      expect(kinds(page.sections)).toEqual(LINEUP);
      expect(counts(page.sections)).toEqual([0, 0, 0, 0, 0, 0]);
    }).pipe(
      Effect.provide(
        artifactLayer([{ slug: 'sanctuary', title: 'The Sanctuary', thesis: THESIS }], (file) =>
          WikiService.Live.pipe(
            Layer.provide(SqliteBun.layer({ filename: file, readonly: true })),
            Layer.provide(TopicService.Test([])),
            Layer.provide(
              WikiSectionSources.Live.pipe(
                Layer.provide(TopicService.Test([])),
                Layer.provide(BibleDatabase.layerTest()),
                Layer.provide(EGWCommentaryService.Test()),
                Layer.provide(
                  WritingsService.Live.pipe(
                    Layer.provide(EGWParagraphDatabase.Test({ books: [], paragraphs: [] })),
                  ),
                ),
              ),
            ),
            Layer.orDie,
          ),
        ),
      ),
    ));

  /** The same wiring as {@link artifactLayer}, for the artifact that is not
   *  there: a temp directory is made while the layer builds, and the path
   *  inside it names a file nothing ever wrote. */
  const absentArtifactLayer = Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-absent-' })
        .pipe(Effect.orDie);
      return layerBunOrAbsent(`${directory}/absent.db`).pipe(
        Layer.provide(TopicService.Test([catalogTopic('naves.sanctuary', 12)])),
        Layer.provide(sourcesLayer([catalogTopic('naves.sanctuary', 12)])),
      );
    }),
  );

  /** A commentary row the corpus stores with no refcode.
   *
   *  ~563 corpus paragraphs have none, and five of them cite a verse — John
   *  1:1, John 1:14, Matthew 27:54, Romans 1:25 and Colossians 2:8 all reach a
   *  `*****` section divider in 5BC/7BC. `WikiCommentaryEntry.refcode` is
   *  `NonEmptyString`, and `.make` *throws* rather than failing, so the row
   *  arrived as a defect that `commentaryEntries`' own `orElseSucceed` does not
   *  rescue: one such row emptied the whole section. */
  const uncitableCommentary = [{ ...COMMENTARY[0]!, refcode: '' }, ...COMMENTARY.slice(1)];

  const uncitableLayer = Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-wiki-uncitable-' })
        .pipe(Effect.orDie);
      return layerBunOrAbsent(`${directory}/absent.db`).pipe(
        Layer.provide(TopicService.Test([catalogTopic('naves.sanctuary', 12)])),
        Layer.provide(sourcesLayer([catalogTopic('naves.sanctuary', 12)], uncitableCommentary)),
      );
    }),
  );

  test('keeps the commentary section when one row has no refcode', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('naves.sanctuary'));
      const commentary = page.sections[2];
      expect(commentary?.items.length).toBe(Option.getOrThrow(SECTION_CAPS.commentary));
      const refcodes = (commentary?.items ?? []).map((item) =>
        Option.match(Option.filter(Option.some(item), Schema.is(WikiCommentaryEntry)), {
          onNone: () => 'not-a-commentary-entry',
          onSome: (entry) => entry.refcode,
        }),
      );
      expect(refcodes).toContain('5BC');
      expect(refcodes.every((refcode) => refcode.length > 0)).toBe(true);
    }).pipe(Effect.provide(uncitableLayer)));

  test('composes a page with no artifact at all, from the catalog alone', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('naves.sanctuary'));
      expect(page.unavailable).toEqual(Option.some('artifact-not-installed'));
      expect(kinds(page.sections)).toEqual(LINEUP);
      expect(page.sections[0]?.items.length).toBe(Option.getOrThrow(SECTION_CAPS.keyVerses));
      expect(page.sections[4]?.items.length).toBe(Option.getOrThrow(SECTION_CAPS.crossReferences));
      expect((yield* wiki.dictionary).unavailable).toEqual(Option.some('artifact-not-installed'));
    }).pipe(Effect.provide(absentArtifactLayer)));

  test('serves the compiled phrase dictionary from the artifact', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const dictionary = yield* wiki.dictionary;
      expect(dictionary.entries.map((entry) => entry.alias)).toEqual([
        'heavenly sanctuary',
        'sanctuary',
      ]);
      expect(dictionary.entries.map((entry) => entry.canonical)).toEqual([true, false]);
      expect(dictionary.entries.every((entry) => String(entry.slug) === 'sanctuary')).toBe(true);
      expect(Option.isNone(dictionary.unavailable)).toBe(true);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              aliases: [
                { alias: 'heavenly sanctuary', canonical: true },
                { alias: 'sanctuary', canonical: false },
              ],
            },
          ],
          (file) => live(file, []),
        ),
      ),
    ));

  test('resolves key verses through the canon and attaches their KJV text', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      const keyVerses = page.sections[0];
      if (keyVerses?._tag !== 'key-verses') {
        return yield* Effect.fail('lineup position 1 is not the key-verses section');
      }
      expect(keyVerses.items[0]?.start.book).toBe(JOHN?.number);
      expect(keyVerses.items[0]?.label).toBe('John 11:1');
      expect(keyVerses.items[0]?.text).toEqual(Option.some('John 11:1 text'));
      expect(keyVerses.items[0]?.end).toEqual(Option.none());
      expect(keyVerses.items.map((passage) => Number(passage.start.verse))).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ]);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              catalogId: 'naves.sanctuary',
            },
          ],
          (file) => live(file, [catalogTopic('naves.sanctuary', 12)]),
        ),
      ),
    ));

  const rangesOnly = catalogTopicWith('naves.sanctuary', [
    { raw: 'Jn 11:1-3', osis: ['John.11.1-John.11.3'] },
    { raw: 'Jn 11:5-6', osis: ['John.11.5-John.11.6'] },
  ]);

  test('composes key verses for a topic whose references are all ranges', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      const keyVerses = page.sections[0];
      if (keyVerses._tag !== 'key-verses') {
        return yield* Effect.fail('lineup position 1 is not the key-verses section');
      }
      expect(keyVerses.items.length).toBe(2);
      expect(keyVerses.items.map((passage) => passage.label)).toEqual([
        'John 11:1-3',
        'John 11:5-6',
      ]);
      expect(keyVerses.items.map((passage) => Option.isSome(passage.end))).toEqual([true, true]);
      expect(keyVerses.items[0]?.text).toEqual(
        Option.some('John 11:1 text John 11:2 text John 11:3 text'),
      );
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              catalogId: 'naves.sanctuary',
            },
          ],
          (file) => live(file, [rangesOnly]),
        ),
      ),
    ));

  const mixed = catalogTopicWith('naves.sanctuary', [
    { raw: 'Jn 11:4', osis: ['John.11.4'] },
    { raw: 'Jn 11:1-2', osis: ['John.11.1-John.11.2'] },
    { raw: 'Jn 11:7', osis: ['John.11.7'] },
    { raw: 'Wis 3:1', osis: ['Wis.3.1'] },
    { raw: 'Jn 11:9-8', osis: ['John.11.9-John.11.8'] },
  ]);

  test('keeps catalog position across a mixed list of verses and ranges', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      const keyVerses = page.sections[0];
      if (keyVerses._tag !== 'key-verses') {
        return yield* Effect.fail('lineup position 1 is not the key-verses section');
      }
      expect(keyVerses.items.map((passage) => passage.label)).toEqual([
        'John 11:4',
        'John 11:1-2',
        'John 11:7',
      ]);
      expect(keyVerses.total).toBe(3);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              catalogId: 'naves.sanctuary',
            },
          ],
          (file) => live(file, [mixed]),
        ),
      ),
    ));

  const crossBook = catalogTopicWith('naves.sanctuary', [
    { raw: 'Mal 4:5-Mt 1:1', osis: ['Mal.4.5-Matt.1.1'] },
  ]);

  test('reads text across a book boundary rather than rendering the range textless', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      const keyVerses = page.sections[0];
      if (keyVerses._tag !== 'key-verses') {
        return yield* Effect.fail('lineup position 1 is not the key-verses section');
      }
      expect(keyVerses.items.map((passage) => passage.label)).toEqual(['Malachi 4:5-Matthew 1:1']);
      expect(keyVerses.items[0]?.text).toEqual(
        Option.some('Mal 4:5 text Mal 4:6 text Matt 1:1 text'),
      );
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              catalogId: 'naves.sanctuary',
            },
          ],
          (file) => live(file, [crossBook]),
        ),
      ),
    ));

  const rejected = catalogTopicWith('naves.sanctuary', [
    { raw: 'Jn 11:4', osis: ['John.11.4'] },
    { raw: 'Jn 11:9-8', osis: ['John.11.9-John.11.8'] },
    { raw: 'Jn 11:1-2-3', osis: ['John.11.1-John.11.2-John.11.3'] },
  ]);

  test('warns with the token and the slug when the catalog stores an unusable range', () =>
    Effect.gen(function* () {
      const warnings = yield* captureWarnings(
        Effect.gen(function* () {
          const wiki = yield* WikiService;
          const page = yield* wiki.topic(topicSlug('sanctuary'));
          const keyVerses = page.sections[0];
          if (keyVerses._tag !== 'key-verses') {
            return yield* Effect.fail('lineup position 1 is not the key-verses section');
          }
          expect(keyVerses.items.map((passage) => passage.label)).toEqual(['John 11:4']);
        }),
      );

      const rejections = warnings.filter(
        (entry) => entry.message === 'wiki.keyVerses.rejected-osis-token',
      );
      expect(rejections.map((entry) => Option.getOrThrow(entry.annotations))).toEqual([
        { slug: 'sanctuary', token: 'John.11.9-John.11.8', reason: 'reversed-range' },
        { slug: 'sanctuary', token: 'John.11.1-John.11.2-John.11.3', reason: 'malformed-range' },
      ]);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              catalogId: 'naves.sanctuary',
            },
          ],
          (file) => live(file, [rejected]),
        ),
      ),
    ));

  /** The real shape of an absent corpus on this stack: the SQLite client
   *  reports a missing file as a typed `SqlError` (since effect 4.0.1; before,
   *  `bun:sqlite`'s constructor throw arrived as a died `SQLITE_CANTOPEN`). */
  const unopenableCorpus = WikiSectionSources.NotWiredOnCorpusAbsence(
    WikiSectionSources.Live.pipe(
      Layer.provide(TopicService.Test([])),
      Layer.provide(BibleDatabase.layerTest({})),
      Layer.provide(EGWCommentaryService.Test({ entries: [] })),
      Layer.provide(
        WritingsService.Live.pipe(
          Layer.provide(
            EGWParagraphDatabase.layerCore.pipe(
              Layer.provide(
                SqliteBun.layer({
                  filename: '/nonexistent-directory-xyz/writings.db',
                  create: false,
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  /** Resolving `WikiSectionSources` over a given wiring, with the layer built
   *  *inside* this effect.
   *
   *  The boundary is here rather than on the test, because the facts under
   *  assertion — the degradation warning and the construction defect — are both
   *  produced while the layer builds. Hoisting the provide onto the test moves
   *  the build outside the log recorder and outside `Effect.exit`, and neither
   *  fact is observable any more. */
  const sourcingOver = <E>(layer: Layer.Layer<WikiSectionSources, E>) =>
    Effect.gen(function* () {
      return yield* WikiSectionSources;
    }).pipe(Effect.provide(layer));

  it.effect('degrades an unopenable corpus to NotWired and logs the cause', () =>
    Effect.gen(function* () {
      const warnings = yield* captureWarnings(
        Effect.gen(function* () {
          const sourcing = yield* sourcingOver(unopenableCorpus);
          expect(sourcing._tag).toBe('not-wired');
        }),
      );

      expect(
        warnings.filter((entry) => entry.message === 'wiki.sectionSources.degraded-to-not-wired')
          .length,
      ).toBe(1);
    }),
  );

  const boom = 'a service constructor threw';
  const dyingConstructor = WikiSectionSources.NotWiredOnCorpusAbsence(
    Layer.effect(WikiSectionSources, Effect.die(boom)),
  );

  it.effect('lets a construction defect through instead of calling it NotWired', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(sourcingOver(dyingConstructor));

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
        expect(Cause.pretty(exit.cause)).toContain('a service constructor threw');
      }
    }),
  );

  test('keeps all five ranked hits when an uninstalled citation is also present', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      const egw = page.sections[1];
      if (egw._tag !== 'egw-statements') {
        return yield* Effect.fail('lineup position 2 is not the EGW statements section');
      }
      expect(egw.items.length).toBe(Option.getOrThrow(SECTION_CAPS.egwStatements));
      expect(egw.items.length).toBe(5);
      expect(egw.items.every((hit) => Option.isSome(hit.snippet))).toBe(true);
      expect(egw.items.every((hit) => Option.isNone(hit.absence))).toBe(true);
      expect(egw.items.map((hit) => hit.refcode)).toEqual([
        'GC 1.1',
        'GC 2.1',
        'GC 3.1',
        'GC 4.1',
        'GC 5.1',
      ]);
      expect(egw.missingBooks.map((entry) => entry.refcode)).toEqual(['ABSENT 12.3']);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: CITING_THESIS,
              aliases: [{ alias: 'sanctuary', canonical: true }],
            },
          ],
          (file) => live(file, []),
        ),
      ),
    ));

  test('gives a catalog page the live backlinks pointing at it', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('naves.grace'));
      expect(page.status).toBe('catalog');
      const related = page.sections[5];
      if (related._tag !== 'related-topics') {
        return yield* Effect.fail('lineup position 6 is not the related-topics section');
      }
      expect(related.items.map((item) => String(item.slug))).toEqual(['sanctuary']);
      expect(related.items.map((item) => item.kind)).toEqual(['backlink']);
      expect(related.items.map((item) => item.title)).toEqual(['The Sanctuary']);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              edges: [{ to: 'naves.grace', kind: 'authored' }],
            },
          ],
          (file) => live(file, [catalogTopic('naves.grace', 0)]),
        ),
      ),
    ));

  test('appends a flagship page live backlinks after its authored edges', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      const related = page.sections[5];
      if (related._tag !== 'related-topics') {
        return yield* Effect.fail('lineup position 6 is not the related-topics section');
      }
      expect(related.items.map((item) => String(item.slug))).toEqual([
        '2300-days',
        'day-of-atonement',
      ]);
      expect(related.items.map((item) => item.kind)).toEqual(['authored', 'backlink']);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              edges: [{ to: '2300-days', kind: 'authored' }],
            },
            {
              slug: 'day-of-atonement',
              title: 'Day of Atonement',
              thesis: THESIS,
              edges: [{ to: 'sanctuary', kind: 'authored' }],
            },
            { slug: '2300-days', title: '2300 Days', thesis: THESIS },
          ],
          (file) => live(file, []),
        ),
      ),
    ));

  test('reports a host that wired no section sources, with six empty sections', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      expect(kinds(page.sections)).toEqual(LINEUP);
      expect(counts(page.sections)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(page.sections.map((section) => section.total)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(page.sectionsUnavailable).toEqual(Option.some('sources-not-wired'));
      expect(Option.isSome(page.core)).toBe(true);
    }).pipe(
      Effect.provide(
        artifactLayer(
          [
            {
              slug: 'sanctuary',
              title: 'The Sanctuary',
              thesis: THESIS,
              catalogId: 'naves.sanctuary',
            },
          ],
          (file) =>
            WikiService.Live.pipe(
              Layer.provide(SqliteBun.layer({ filename: file, readonly: true })),
              Layer.provide(TopicService.Test([catalogTopic('naves.sanctuary', 12)])),
              Layer.provide(WikiSectionSources.NotWired),
              Layer.orDie,
            ),
        ),
      ),
    ));

  test('marks a wired-but-empty corpus available, so the two absences stay apart', () =>
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const page = yield* wiki.topic(topicSlug('sanctuary'));
      expect(counts(page.sections)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(Option.isNone(page.sectionsUnavailable)).toBe(true);
    }).pipe(
      Effect.provide(
        artifactLayer([{ slug: 'sanctuary', title: 'The Sanctuary', thesis: THESIS }], (file) =>
          WikiService.Live.pipe(
            Layer.provide(SqliteBun.layer({ filename: file, readonly: true })),
            Layer.provide(TopicService.Test([])),
            Layer.provide(
              WikiSectionSources.Live.pipe(
                Layer.provide(TopicService.Test([])),
                Layer.provide(BibleDatabase.layerTest()),
                Layer.provide(EGWCommentaryService.Test()),
                Layer.provide(
                  WritingsService.Live.pipe(
                    Layer.provide(EGWParagraphDatabase.Test({ books: [], paragraphs: [] })),
                  ),
                ),
              ),
            ),
            Layer.orDie,
          ),
        ),
      ),
    ));
});
