declare module 'virtual:heartseed-passage' {
  /** Today's passage, derived from the KJV when the app is bundled (`vite/passage.ts`). */
  const passage: import('./passage').Passage;
  export default passage;
}

declare module 'virtual:heartseed-kjv' {
  /** The canon's 1,189 chapters in canon order, each its verses' shown text joined by a newline, derived when the app is bundled (`vite/kjv.ts`); read through `src/kjv.ts` alone. */
  const chapters: ReadonlyArray<string>;
  export default chapters;
}

declare module 'virtual:heartseed-lexicon' {
  /** The natural voice's KJV pronunciation list (word key → phonemes) and Kokoro's vocab (symbol → id), carried from `data/` when the app is bundled (`vite/lexicon.ts`); read through `src/natural/lexicon.ts` alone. */
  const lexicon: {
    readonly words: { readonly [word: string]: string };
    readonly vocab: { readonly [symbol: string]: number };
  };
  export default lexicon;
}

declare module 'virtual:heartseed-licence' {
  /** The Apache License 2.0 the natural voice's vendored code carries, `native/natural/kokoro/LICENSE` byte for byte, read when the app is bundled (`vite/licence.ts`); shown by `src/about/screen.tsx` alone. */
  const licence: string;
  export default licence;
}
