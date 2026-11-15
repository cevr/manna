/** A book of the canon as the chooser reads it from `@manna/core/bible`, which Exact's type check reads here (the app's `tsconfig.json` maps it), since that check stages a package's declarations, never its source; the repo's typecheck reads the source, and `src/declared.test.ts` holds this file to it. */
export interface Book {
  readonly number: number;
  readonly name: string;
  readonly chapters: number;
  readonly testament: 'old' | 'new';
}

/** The 66 books in canon order. */
export declare const BIBLE_BOOKS: readonly Book[];
