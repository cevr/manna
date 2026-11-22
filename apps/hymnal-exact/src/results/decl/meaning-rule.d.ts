/**
 * The table's fields as the shipped files hold them, each a string but its
 * size: the input of `@manna/hymnal-app/hymns/meaning-rule` as Exact's type
 * check reads it (the app's `tsconfig.json` maps it here), meaning search's
 * rule over a table the caller hands it;
 * `apps/hymnal/test/exact-find-declarations.ts` holds it to the source.
 */
export type MeaningFile = Readonly<
  Record<'words' | 'weights' | 'table' | 'hymns' | 'vectors' | 'lengths', string> & { dims: number }
>;

/** The table, decoded for search: its words and hymn numbers in lists, its rows in base64, its weights, vectors and lengths in typed arrays. */
export type Table = Readonly<
  { dims: number; rows: string } & Record<'words', ReadonlyArray<string>> &
    Record<'numbers', ReadonlyArray<number>> &
    Record<'weights' | 'lengths', Float32Array> &
    Record<'vectors', Int8Array>
>;

/** The table `file` holds, decoded. */
export declare const tableOf: (file: MeaningFile) => Table;

/** How many hymns about a query search shows. */
export declare const ABOUT: number;

/** The hymns search shows about `query`: none for a number or under three letters, else the nearest `ABOUT`. */
export declare const aboutQueryIn: (table: () => Table, query: string) => ReadonlyArray<number>;
