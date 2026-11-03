import { Codec, Field, Place } from '@manna/url-state';
import { Array as Arr, Option, Schema } from 'effect';

import {
  BookSubtype,
  BookType,
  CorpusScope,
  CorpusSection,
  DEFAULT_LIMIT,
  NO_SELECTION,
  type SearchRequest,
  type Signed,
  SignedFromStrings,
} from '../server/api.js';

type Selection<A> = ReturnType<typeof Signed<Schema.Codec<A>>>['Type'];

export type Sign = 'include' | 'exclude' | 'off';

export const signOf = <A>(selection: Selection<A>, value: A): Sign => {
  if (selection.include.includes(value)) return 'include';
  if (selection.exclude.includes(value)) return 'exclude';
  return 'off';
};

const NEXT = {
  off: 'include',
  include: 'exclude',
  exclude: 'off',
} satisfies Record<Sign, Sign>;

export const cycle = <A>(selection: Selection<A>, value: A): Selection<A> => {
  const next = NEXT[signOf(selection, value)];
  const without = {
    include: selection.include.filter((entry) => entry !== value),
    exclude: selection.exclude.filter((entry) => entry !== value),
  };
  if (next === 'off') return without;
  if (next === 'include') return { ...without, include: [...without.include, value] };
  return { ...without, exclude: [...without.exclude, value] };
};

const Limit = Codec.Finite.pipe(
  Codec.truncate,
  (whole) => whole.check(Schema.isGreaterThan(0)),
  Codec.clamp({ max: 100 }),
);

const Pane = Field.struct(
  {
    q: Field.key(Codec.Text, { default: '', history: 'push' }),
    scope: Field.key(Codec.literals(CorpusScope.literals), { default: 'all' }),
    section: Field.keys(SignedFromStrings(CorpusSection)),
    type: Field.keys(SignedFromStrings(BookType)),
    subtype: Field.keys(SignedFromStrings(BookSubtype)),
    excludeApparatus: Field.key(Codec.Flag, { default: false }),
    limit: Field.key(Limit, { default: DEFAULT_LIMIT }),
  },
  { keys: { excludeApparatus: 'noref' } },
);

export type SearchParams = typeof Pane.Type;

export const EMPTY_PARAMS: SearchParams = {
  q: '',
  scope: 'all',
  section: NO_SELECTION,
  type: NO_SELECTION,
  subtype: NO_SELECTION,
  excludeApparatus: false,
  limit: DEFAULT_LIMIT,
};

export const paneKey = (name: string, pane: number): string =>
  Option.match(
    Option.liftPredicate(pane, (index) => index > 0),
    { onNone: () => name, onSome: (index) => `${name}${String(index + 1)}` },
  );

export const MAX_PANES = 4;

export const Workspace = Place.make({
  path: '/',
  query: Field.indexed(Pane, { max: MAX_PANES, key: paneKey, marker: 'q' }),
});

export const parseWorkspace = (search: string): readonly SearchParams[] =>
  Option.match(Place.decode(Workspace, `/?${search.replace(/^\?/, '')}`), {
    onNone: () => [EMPTY_PARAMS],
    onSome: (workspace) => workspace.query,
  });

export const toWorkspaceString = (panes: readonly SearchParams[]): string =>
  Arr.match(Arr.take(panes, MAX_PANES), {
    onEmpty: () => '/',
    onNonEmpty: (query) => Place.href(Workspace, { path: {}, query, hash: {} }),
  });

export const toRequest = (
  { q, scope, section, type, subtype, excludeApparatus, limit }: SearchParams,
  context: number,
): SearchRequest => ({
  q: q.trim(),
  scope,
  section,
  type,
  subtype,
  excludeApparatus,
  limit,
  context,
});

const anySign = (selection: Selection<unknown>): boolean =>
  selection.include.length > 0 || selection.exclude.length > 0;

export const hasFilters = (params: SearchParams): boolean =>
  params.scope !== 'all' ||
  anySign(params.section) ||
  anySign(params.type) ||
  anySign(params.subtype) ||
  params.excludeApparatus;

export const toggle = <K extends 'section' | 'type' | 'subtype'>(
  params: SearchParams,
  key: K,
  value: SearchParams[K]['include'][number],
): SearchParams => ({
  ...params,
  [key]: cycle<string>(params[key], value),
});
