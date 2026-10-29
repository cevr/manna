/**
 * The back-matter indexes of the SDA Hymnal (1985), as data: one file per
 * printed index under `data/indexes/`, each read off the owner's photos of
 * the book's pages 776-824 by two blind readers and a judge, and held by
 * the checks in `scripts/indexes.ts`.
 *
 * Every file has the same header: its index, the heading as printed, the
 * printed legend that explains its entries (`note`), and the printed pages
 * it covers, each with the count of its entries that name the page. Every
 * entry names its page. The facts are numbers, topic names, tune and metre
 * names, people's names and Scripture references; no first line or other
 * hymn text is stored: a hymn's number is the fact.
 *
 * A hymn number is 1-695, a Scripture reading's 696-920 (the checks hold
 * the ranges; the schemas take any positive number so a misread one is
 * reported, not dropped). A stanza letter is printed after a number: `a` is
 * stanza 1, `b` stanza 2, and so on; `r` is the refrain.
 *
 * This module imports only `effect`, so the app can read it.
 */

import { Schema } from 'effect';

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Positive = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

/** The names of the printed indexes, each the name of its file (`<index>.json`). */
export const IndexName = Schema.Literals([
  'topical',
  'worship-aids',
  'scriptural',
  'scriptural-by-hymn',
  'sentences',
  'canons',
  'young',
  'authors',
  'composers',
  'tunes',
  'metrical',
]);
export type IndexName = typeof IndexName.Type;

/** A printed page of an index and the count of its entries that name it. */
const PageCount = Schema.Struct({ page: Positive, entries: Count });

const header = <const I extends IndexName>(index: I) => ({
  version: Schema.Literal(1),
  book: Schema.Literal('sdah-1985'),
  index: Schema.Literal(index),
  /** The index's heading as printed. */
  title: Schema.String,
  /** The printed legend under the heading, where it explains the entries. */
  note: Schema.optionalKey(Schema.String),
  /** The printed pages it covers, in order. */
  pages: Schema.NonEmptyArray(PageCount),
});

/** A hymn or reading number and the page that prints it. */
const Ref = Schema.Struct({ number: Positive, page: Positive });

/** A printed stanza letter: `a` stanza 1, `b` stanza 2 …, `r` the refrain. */
const Stanza = Schema.String.check(Schema.isPattern(/^[a-z]$/));

const Verses = Schema.Struct({ from: Positive, to: Positive });
const Place = Schema.Struct({ chapter: Positive, verse: Positive });

/**
 * A Scripture passage: a book (1-66, in canonical order) and a chapter with
 * its verse pieces (`98:4, 6` is two pieces; none is the whole chapter), or
 * a passage that crosses chapters, from a place to a place. The stored JSON
 * carries no tag: decoding adds `_tag` (`Chapter` or `Span`) from the shape,
 * and encoding leaves it out.
 */
const Passage = Schema.Union([
  Schema.Struct({
    _tag: Schema.tagDefaultOmit('Chapter'),
    book: Positive,
    chapter: Positive,
    verses: Schema.Array(Verses),
  }),
  Schema.Struct({ _tag: Schema.tagDefaultOmit('Span'), book: Positive, from: Place, to: Place }),
]);
export type Passage = typeof Passage.Type;

/** TOPICAL INDEX OF HYMNS AND READINGS: topics in printed order, a subtopic naming its heading. */
const Topical = Schema.Struct({
  ...header('topical'),
  topics: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      /** The heading a subtopic is printed under (`JESUS CHRIST` for `Birth`). */
      parent: Schema.optionalKey(Schema.String),
      /** Each cross-reference as printed (`See LOVE IN THE HOME; MARRIAGE` is two). */
      see: Schema.Array(Schema.String),
      /** The roman entries. */
      hymns: Schema.Array(Ref),
      /** The italic entries: Scripture readings. */
      readings: Schema.Array(Ref),
    }),
  ),
});
export type Topical = typeof Topical.Type;

/** SCRIPTURAL INDEX OF WORSHIP AIDS: each printed reference with a reading, in printed order. */
const WorshipAids = Schema.Struct({
  ...header('worship-aids'),
  entries: Schema.Array(Schema.Struct({ passage: Passage, reading: Positive, page: Positive })),
});
export type WorshipAids = typeof WorshipAids.Type;

/** SCRIPTURAL ALLUSIONS IN HYMNS, indexed by Scripture reference: one entry per hymn a reference lists. */
const Scriptural = Schema.Struct({
  ...header('scriptural'),
  entries: Schema.Array(
    Schema.Struct({
      passage: Passage,
      hymn: Positive,
      stanza: Schema.optionalKey(Stanza),
      page: Positive,
    }),
  ),
});
export type Scriptural = typeof Scriptural.Type;

/** SCRIPTURAL ALLUSIONS IN HYMNS, indexed by hymn number: one entry per reference a hymn lists. */
const ScripturalByHymn = Schema.Struct({
  ...header('scriptural-by-hymn'),
  entries: Schema.Array(
    Schema.Struct({
      hymn: Positive,
      stanza: Schema.optionalKey(Stanza),
      passage: Passage,
      page: Positive,
    }),
  ),
  /** A hymn that prints `See N` in the reference place: it alludes to what hymn N does. */
  see: Schema.optionalKey(
    Schema.Array(Schema.Struct({ hymn: Positive, see: Positive, page: Positive })),
  ),
});
export type ScripturalByHymn = typeof ScripturalByHymn.Type;

/** HYMNS SUITABLE FOR SENTENCES AND RESPONSES: groups (`Call to Worship` …) of hymns and their stanzas. */
const Sentences = Schema.Struct({
  ...header('sentences'),
  groups: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      hymns: Schema.Array(
        Schema.Struct({ number: Positive, stanzas: Schema.Array(Stanza), page: Positive }),
      ),
    }),
  ),
});
export type Sentences = typeof Sentences.Type;

/** CANONS (OR ROUNDS), and the hymns that may be sung as canons: each group as printed. */
const Canons = Schema.Struct({
  ...header('canons'),
  groups: Schema.Array(Schema.Struct({ name: Schema.String, hymns: Schema.Array(Ref) })),
});
export type Canons = typeof Canons.Type;

/** HYMNS SUITABLE FOR YOUNG WORSHIPERS: each hymn, starred where the page marks it with an asterisk. */
const Young = Schema.Struct({
  ...header('young'),
  hymns: Schema.Array(Schema.Struct({ number: Positive, starred: Schema.Boolean, page: Positive })),
});
export type Young = typeof Young.Type;

const People = Schema.Array(
  Schema.Struct({
    name: Schema.String,
    /** The name is printed in italics: a source (a book or a tradition), not a person. */
    source: Schema.optionalKey(Schema.Literal(true)),
    /** The name a cross-reference points to (`Green, Fred Pratt (see Pratt Green, Fred)`), as printed. */
    see: Schema.optionalKey(Schema.String),
    hymns: Schema.Array(Ref),
  }),
);

/** AUTHORS, TRANSLATORS, AND SOURCES OF TEXTS. */
const Authors = Schema.Struct({ ...header('authors'), people: People });
export type Authors = typeof Authors.Type;

/** COMPOSERS, ARRANGERS, AND SOURCES OF TUNES. */
const Composers = Schema.Struct({ ...header('composers'), people: People });
export type Composers = typeof Composers.Type;

/** ALPHABETICAL INDEX OF TUNES: an indented name (`alias`) is another name of the tune at that number. */
const Tunes = Schema.Struct({
  ...header('tunes'),
  tunes: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      alias: Schema.optionalKey(Schema.Literal(true)),
      hymns: Schema.Array(Ref),
    }),
  ),
});
export type Tunes = typeof Tunes.Type;

/** METRICAL INDEX OF TUNES: each metre heading (`C. M.`, its gloss `(Common Meter - 8.6.8.6.)`) and its tunes. */
const Metrical = Schema.Struct({
  ...header('metrical'),
  metres: Schema.Array(
    Schema.Struct({
      metre: Schema.String,
      gloss: Schema.optionalKey(Schema.String),
      tunes: Schema.Array(Schema.Struct({ name: Schema.String, hymns: Schema.Array(Ref) })),
    }),
  ),
});
export type Metrical = typeof Metrical.Type;

/**
 * A value the book prints that a check refuses, accepted on a judge's
 * ruling: the check's index, page, place (`at`) and printed value, the
 * judge's record, and why the book means it so. A ruling changes no reading.
 */
export const Rulings = Schema.Struct({
  version: Schema.Literal(1),
  book: Schema.Literal('sdah-1985'),
  rulings: Schema.Array(
    Schema.Struct({
      index: IndexName,
      page: Positive,
      at: Schema.String,
      check: Schema.String,
      value: Schema.String,
      judge: Schema.String,
      why: Schema.String,
    }),
  ),
});
export type Rulings = typeof Rulings.Type;

/** Each index's schema, by name. */
export const IndexFile = {
  topical: Topical,
  'worship-aids': WorshipAids,
  scriptural: Scriptural,
  'scriptural-by-hymn': ScripturalByHymn,
  sentences: Sentences,
  canons: Canons,
  young: Young,
  authors: Authors,
  composers: Composers,
  tunes: Tunes,
  metrical: Metrical,
} as const;

/** The decoded files, by name; an index whose file is absent is absent. */
export interface Indexes {
  readonly topical?: Topical;
  readonly 'worship-aids'?: WorshipAids;
  readonly scriptural?: Scriptural;
  readonly 'scriptural-by-hymn'?: ScripturalByHymn;
  readonly sentences?: Sentences;
  readonly canons?: Canons;
  readonly young?: Young;
  readonly authors?: Authors;
  readonly composers?: Composers;
  readonly tunes?: Tunes;
  readonly metrical?: Metrical;
}
