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
