import { Schema } from 'effect';

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Positive = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

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

const PageCount = Schema.Struct({ page: Positive, entries: Count });

const header = <const I extends IndexName>(index: I) => ({
  version: Schema.Literal(1),
  book: Schema.Literal('sdah-1985'),
  index: Schema.Literal(index),
  title: Schema.String,
  note: Schema.optionalKey(Schema.String),
  pages: Schema.NonEmptyArray(PageCount),
});

const Ref = Schema.Struct({ number: Positive, page: Positive });

const Stanza = Schema.String.check(Schema.isPattern(/^[a-z]$/));

const Verses = Schema.Struct({ from: Positive, to: Positive });
const Place = Schema.Struct({ chapter: Positive, verse: Positive });

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

const Topical = Schema.Struct({
  ...header('topical'),
  topics: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      parent: Schema.optionalKey(Schema.String),
      see: Schema.Array(Schema.String),
      hymns: Schema.Array(Ref),
      readings: Schema.Array(Ref),
    }),
  ),
});
export type Topical = typeof Topical.Type;

const WorshipAids = Schema.Struct({
  ...header('worship-aids'),
  entries: Schema.Array(Schema.Struct({ passage: Passage, reading: Positive, page: Positive })),
});
export type WorshipAids = typeof WorshipAids.Type;

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
  see: Schema.optionalKey(
    Schema.NonEmptyArray(Schema.Struct({ hymn: Positive, see: Positive, page: Positive })),
  ),
});
export type ScripturalByHymn = typeof ScripturalByHymn.Type;

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

const Canons = Schema.Struct({
  ...header('canons'),
  groups: Schema.Array(Schema.Struct({ name: Schema.String, hymns: Schema.Array(Ref) })),
});
export type Canons = typeof Canons.Type;

const Young = Schema.Struct({
  ...header('young'),
  hymns: Schema.Array(Schema.Struct({ number: Positive, starred: Schema.Boolean, page: Positive })),
});
export type Young = typeof Young.Type;

const People = Schema.Array(
  Schema.Struct({
    name: Schema.String,
    source: Schema.optionalKey(Schema.Literal(true)),
    see: Schema.optionalKey(Schema.String),
    hymns: Schema.Array(Ref),
  }),
);

const Authors = Schema.Struct({ ...header('authors'), people: People });
export type Authors = typeof Authors.Type;

const Composers = Schema.Struct({ ...header('composers'), people: People });
export type Composers = typeof Composers.Type;

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
