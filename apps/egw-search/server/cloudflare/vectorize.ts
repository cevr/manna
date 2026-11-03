import { Array as Arr, Effect, Option, Record as Rec } from 'effect';

import {
  type NeighborScope,
  type VectorNeighborsApi,
  VectorNeighborsUnavailable,
} from '@manna/core/search';
import {
  EXCLUDED_SUBTYPES,
  isBookSubtype,
  isBookType,
  isCorpusSection,
} from '@manna/core/writings';

export const UNCLASSIFIED = 'none';

export const vectorMetadata = (book: {
  readonly code: string;
  readonly section: Option.Option<string>;
  readonly type: Option.Option<string>;
  readonly subtype: Option.Option<string>;
}) => {
  const known = (value: Option.Option<string>, is: (value: string) => boolean) =>
    Option.getOrElse(Option.filter(value, is), () => UNCLASSIFIED);
  return {
    book: book.code,
    section: known(book.section, isCorpusSection),
    type: known(book.type, isBookType),
    subtype: known(book.subtype, isBookSubtype),
  };
};

export const MAX_TOP_K = 50;

const NOTHING = '(none of these)';

type Clause = { readonly $eq: string } | { readonly $in: string[] } | { readonly $nin: string[] };

export type MetadataFilter = Record<string, Clause>;

const axis = (include: readonly string[], exclude: ReadonlySet<string>): Option.Option<Clause> => {
  const admitted = include.filter((value) => !exclude.has(value));
  if (include.length > 0 && admitted.length === 0) return Option.some({ $eq: NOTHING });
  if (include.length > 0) return Option.some({ $in: admitted });
  if (exclude.size > 0) return Option.some({ $nin: [...exclude] });
  return Option.none();
};

const union = (left: readonly string[], right: Iterable<string>): ReadonlySet<string> =>
  new Set([...left, ...right]);

export const vectorizeFilter = (scope: NeighborScope): MetadataFilter => {
  if (Option.isSome(scope.bookCode)) {
    return Rec.singleton('book', { $eq: scope.bookCode.value });
  }
  const filter = scope.filter;
  const clauses: ReadonlyArray<readonly [string, Option.Option<Clause>]> = [
    ['section', axis(filter.section.include, new Set(filter.section.exclude))],
    ['type', axis(filter.type.include, new Set(filter.type.exclude))],
    ['subtype', axis(filter.subtype.include, union(filter.subtype.exclude, EXCLUDED_SUBTYPES))],
  ];
  return Object.fromEntries(
    Arr.flatMap(clauses, ([name, clause]) =>
      Option.match(clause, { onNone: () => [], onSome: (value) => [[name, value] as const] }),
    ),
  );
};

export interface VectorizeQuery {
  readonly query: (
    vector: number[],
    options: {
      topK: number;
      filter: MetadataFilter;
      returnValues: true;
      returnMetadata: 'none';
    },
  ) => Promise<{ readonly matches: ReadonlyArray<{ readonly id: string }> }>;
}

export const vectorizeNeighbors = (
  index: VectorizeQuery,
  fingerprint: string,
): VectorNeighborsApi => ({
  state: { _tag: 'ready', fingerprint },
  nearest: (vector, scope) =>
    Effect.tryPromise({
      try: () =>
        index.query(Array.from(vector), {
          topK: Math.min(scope.topK, MAX_TOP_K),
          filter: vectorizeFilter(scope),
          returnValues: true,
          returnMetadata: 'none',
        }),
      catch: (cause) =>
        VectorNeighborsUnavailable.make({ engine: 'vectorize', reason: String(cause) }),
    }).pipe(
      Effect.map((answer) => ({
        ids: answer.matches.map((match) => match.id),
        scanned: answer.matches.length,
        engine: 'vectorize',
      })),
    ),
});
