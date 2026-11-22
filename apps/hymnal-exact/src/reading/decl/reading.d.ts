/**
 * `@manna/hymnal-app/reader/reading` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here; the workspace's typecheck reads the
 * source), cut to what the port reads: the steps in points, the first
 * step, the fonts and spacings (the source's Effect schemas, named by their
 * literals), and the page's text a choice gives. `src/reading/reading.test.ts`
 * holds it to the source.
 */

export declare const SIZES: readonly [14, 15, 17, 19, 21, 24, 28, 32];
export declare const DEFAULT_SIZE: number;
export declare const Font: { readonly literals: readonly ['system', 'serif'] };
export declare const Spacing: { readonly literals: readonly ['compact', 'normal', 'roomy'] };
export type Font = (typeof Font.literals)[number];
export type Spacing = (typeof Spacing.literals)[number];

/** A size in points and its line in points. */
type Set = { readonly fontSize: number; readonly lineHeight: number };

/** A choice of the three, as the page is set by it. */
type Choice = { readonly size: number; readonly font: Font; readonly spacing: Spacing };

export declare const defaultReading: Choice;

/** The words, the chords over them, the face, and the hanging indent in points on screen. */
export declare const readingStyle: (
  reading: Choice,
  fontScale: number,
) => { readonly words: Set; readonly chords: Set; readonly font: Font; readonly indent: number };
