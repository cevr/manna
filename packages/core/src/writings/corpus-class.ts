import { Option, Schema, SchemaGetter } from 'effect';

export const CorpusSection = Schema.Literals([
  'egw-writings',
  'pioneer-library',
  'reference',
  'bible',
]);
export type CorpusSection = typeof CorpusSection.Type;

export const BookType = Schema.Literals([
  'book',
  'periodical',
  'manuscript',
  'dictionary',
  'bible',
  'topicalindex',
  'scriptindex',
]);
export type BookType = typeof BookType.Type;

export const BookSubtype = Schema.Literals(['devotional', 'commentary', 'LtMs', 'ModernEnglish']);
export type BookSubtype = typeof BookSubtype.Type;

export const EXCLUDED_SUBTYPES: ReadonlySet<BookSubtype> = new Set<BookSubtype>(['ModernEnglish']);

export const SELECTABLE_SUBTYPES: readonly BookSubtype[] = BookSubtype.literals.filter(
  (subtype) => !EXCLUDED_SUBTYPES.has(subtype),
);

export const isCorpusSection = Schema.is(CorpusSection);
export const isBookType = Schema.is(BookType);
export const isBookSubtype = Schema.is(BookSubtype);

export const SECTION_BY_ROOT_FOLDER = {
  'EGW Writings': 'egw-writings',
  'Adventist Pioneer Library': 'pioneer-library',
  Reference: 'reference',
  Bible: 'bible',
} satisfies Record<string, CorpusSection>;

interface FolderNode {
  readonly folder_id: number;
  readonly name: string;
  readonly children?: readonly FolderNode[];
}

const isRootFolder = (name: string): name is keyof typeof SECTION_BY_ROOT_FOLDER =>
  Object.hasOwn(SECTION_BY_ROOT_FOLDER, name);

export const sectionsByFolder = (
  roots: readonly FolderNode[],
): ReadonlyMap<number, CorpusSection> => {
  const sections = new Map<number, CorpusSection>();
  const visit = (node: FolderNode, section: CorpusSection): void => {
    sections.set(node.folder_id, section);
    for (const child of node.children ?? []) visit(child, section);
  };
  for (const root of roots) {
    if (isRootFolder(root.name)) visit(root, SECTION_BY_ROOT_FOLDER[root.name]);
  }
  return sections;
};

export const APPARATUS_TYPES: ReadonlySet<BookType> = new Set<BookType>([
  'dictionary',
  'topicalindex',
  'scriptindex',
  'bible',
]);

export const APPARATUS_AUTHORS: ReadonlySet<string> = new Set(['Ellen G. White Estate']);

export const isApparatus = (book: {
  readonly type: Option.Option<BookType>;
  readonly author: string;
}): boolean =>
  APPARATUS_AUTHORS.has(book.author) ||
  Option.exists(book.type, (type) => APPARATUS_TYPES.has(type));

export const Signed = <A extends Schema.Top>(value: A) =>
  Schema.Struct({
    include: Schema.Array(value),
    exclude: Schema.Array(value),
  });

export const NO_SELECTION = {
  include: [],
  exclude: [],
} satisfies { readonly include: readonly never[]; readonly exclude: readonly never[] };

export const EXCLUDE_PREFIX = '-';

export const SignedFromStrings = <const L extends readonly string[]>(
  literals: Schema.Literals<L>,
) => {
  const is = Schema.is(literals);
  type Value = L[number];

  return Schema.Array(Schema.String).pipe(
    Schema.decodeTo(Signed(literals), {
      decode: SchemaGetter.transform((values: readonly string[]) => {
        const include: Value[] = [];
        const exclude: Value[] = [];
        for (const raw of values) {
          if (raw.startsWith(EXCLUDE_PREFIX)) {
            const bare = raw.slice(EXCLUDE_PREFIX.length);
            if (is(bare)) exclude.push(bare);
          } else if (is(raw)) {
            include.push(raw);
          }
        }
        return { include, exclude };
      }),
      encode: SchemaGetter.transform(
        (selection: {
          readonly include: readonly Value[];
          readonly exclude: readonly Value[];
        }): readonly string[] => [
          ...selection.include,
          ...selection.exclude.map((value) => `${EXCLUDE_PREFIX}${value}`),
        ],
      ),
    }),
  );
};

export const CorpusFilterSchema = Schema.Struct({
  section: Signed(CorpusSection),
  type: Signed(BookType),
  subtype: Signed(BookSubtype),
  excludeApparatus: Schema.Boolean,
});

export type CorpusFilter = typeof CorpusFilterSchema.Type;

export const NO_FILTER: CorpusFilter = {
  section: NO_SELECTION,
  type: NO_SELECTION,
  subtype: NO_SELECTION,
  excludeApparatus: false,
};

const empty = (selection: {
  readonly include: readonly unknown[];
  readonly exclude: readonly unknown[];
}): boolean => selection.include.length === 0 && selection.exclude.length === 0;

export const isUnfiltered = (filter: CorpusFilter): boolean =>
  empty(filter.section) && empty(filter.type) && empty(filter.subtype) && !filter.excludeApparatus;
