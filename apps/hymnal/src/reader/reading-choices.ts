/**
 * The reading section's words and the serif's families, as pure data so the
 * Exact port reads the same lists: each font and line spacing the player
 * sheet offers with its label, in the sheet's order (`ReadingSheet.tsx`),
 * the text size as a share of the page's first size, and the serif each
 * platform draws the page in (`pageText.ts`).
 */

import { DEFAULT_SIZE, type Font, pointsAt, SIZES, type Spacing } from './reading';

export const fontChoices: ReadonlyArray<{ readonly value: Font; readonly label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'serif', label: 'Serif' },
];

export const spacingChoices: ReadonlyArray<{ readonly value: Spacing; readonly label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'roomy', label: 'Roomy' },
];

/** The size as a share of the page's first size: 100% as it has always been. */
export const shareOf = (size: number) =>
  `${Math.round((pointsAt(size) / (SIZES[DEFAULT_SIZE] ?? 17)) * 100)}%`;

/** A serif each platform has: Georgia on iOS, the system's serif on Android, the browser's on the web. */
export const serifFamilies = {
  ios: 'Georgia',
  android: 'serif',
  default: 'ui-serif, Georgia, serif',
} as const;
