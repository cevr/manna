/**
 * A stanza by its number, or a refrain; its lines as printed.
 *
 * This file is `@manna/hymnal-app/hymns/text` as Exact's type check reads
 * it (the app's `tsconfig.json` maps it here): that check stages a
 * package's declarations, never its TypeScript source. It names only the
 * fields this app reads, in its own terms. The repo's typecheck reads the
 * source itself, so a field read here that the source renames or retypes
 * fails it.
 */
export type Section =
  | { kind: 'stanza'; n: number; lines: Array<string> }
  | { kind: 'refrain'; lines: Array<string> };

/** A hymn's words in the order they are sung, and the topic it is printed under. */
export interface HymnText {
  number: number;
  title: string;
  topic: string;
  sections: Array<Section>;
}
