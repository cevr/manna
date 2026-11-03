declare module 'virtual:heartseed-passage' {
  /** Today's passage, derived from the KJV when the app is bundled (`vite/passage.ts`). */
  const passage: import('./passage').Passage;
  export default passage;
}
