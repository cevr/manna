/** A book of the canon as the chooser reads it from `@manna/core/bible`, which Exact's type check reads here (the app's `tsconfig.json` maps it), since that check stages a package's declarations, never its source; the repo's typecheck reads the source, and `src/declared.test.ts` holds this file to it. */
export interface Book {
  readonly number: number;
  readonly name: string;
  readonly chapters: number;
  readonly testament: 'old' | 'new';
}

/** The 66 books in canon order. */
export declare const BIBLE_BOOKS: readonly Book[];

/** A place of the canon as find reads a query (`src/find/find.ts`): a verse, a range of verses, a chapter, a range of chapters, a book, or no place (words to search). */
export type ParsedBibleQuery =
  | {
      readonly _tag: 'single';
      readonly ref: { readonly book: number; readonly chapter: number; readonly verse: number };
    }
  | { readonly _tag: 'chapter'; readonly ref: { readonly book: number; readonly chapter: number } }
  | {
      readonly _tag: 'verseRange';
      readonly ref: {
        readonly start: { readonly book: number; readonly chapter: number; readonly verse: number };
        readonly end: { readonly book: number; readonly chapter: number; readonly verse: number };
      };
    }
  | {
      readonly _tag: 'chapterRange';
      readonly start: { readonly book: number; readonly chapter: number };
      readonly end: { readonly book: number; readonly chapter: number };
    }
  | { readonly _tag: 'fullBook'; readonly ref: { readonly book: number } }
  | { readonly _tag: 'search'; readonly query: string };

/** The place `query` names, read as core reads a reference ("john 3:16", "ps 23", "ruth"); `search` when it names none. */
export declare const parseBibleQuery: (query: string) => ParsedBibleQuery;
