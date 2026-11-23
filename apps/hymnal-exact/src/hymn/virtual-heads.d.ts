declare module 'virtual:hymnal-heads' {
  /** Each hymn's head line by its number, built at prepare (`src/hymn/heads.ts`, `heads.gen.json`). */
  const heads: Readonly<Record<string, string>>;
  export default heads;
}
