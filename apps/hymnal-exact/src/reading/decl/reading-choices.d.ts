/**
 * `@manna/hymnal-app/reader/reading-choices` as Exact's type check reads it
 * (the app's `tsconfig.json` maps it here; the workspace's typecheck reads
 * the source): the reading section's fonts and spacings with their labels,
 * the size's share and the serif's families. `src/reading/reading.test.ts`
 * holds it to the source.
 */

import type { Font, Spacing } from '@manna/hymnal-app/reader/reading';

export declare const fontChoices: ReadonlyArray<{ readonly value: Font; readonly label: string }>;

export declare const spacingChoices: ReadonlyArray<{
  readonly value: Spacing;
  readonly label: string;
}>;

/** The size as a share of the page's first size. */
export declare const shareOf: (size: number) => string;

/** The serif each platform draws: iOS's, Android's, and the web's stack. */
export declare const serifFamilies: {
  readonly ios: string;
  readonly android: string;
  readonly default: string;
};
