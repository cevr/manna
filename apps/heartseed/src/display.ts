/**
 * A KJV verse as Heartseed shows it: the corpus's text with its paragraph
 * mark and its supplied-word and red-letter brackets taken out. A leading
 * `¶` and the whitespace after it go, and every `[`, `]`, `‹` and `›` goes,
 * keeping the words they enclose; nothing else changes. The bundle-time
 * derivation (`vite/passage.ts`) and the tests both read the corpus through
 * it, so the app shows the words the tests hold.
 */
export const displayText = (source: string): string =>
  source.replace(/^¶\s*/u, '').replace(/[[\]‹›]/gu, '');
