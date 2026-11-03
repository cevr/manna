/** The meaning table's module (`meaning.js`, made by `packages/hymnal/scripts/meaning/build.ts`; its format: `table.ts` there). */
/** The notice the Gemma Terms (section 3.1) ask the modified file to carry: modified from EmbeddingGemma, under those Terms. */
export declare const notice: string;
export declare const meaning: () => {
  readonly source: string;
  readonly dims: number;
  readonly words: string;
  readonly weights: string;
  readonly table: string;
  readonly hymns: string;
  readonly vectors: string;
  readonly lengths: string;
};
