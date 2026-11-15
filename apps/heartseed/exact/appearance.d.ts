/* oxlint-disable effect/noNullish -- the declaration says what src/appearance.ts takes: a missing kept text, and a system scheme the platform names as null or undefined. */

/** The reader's appearances, System first, as the Settings sheet offers them. */
export declare const APPEARANCES: readonly ['system', 'light', 'dark'];
/** One of the reader's appearances. */
export type Choice = (typeof APPEARANCES)[number];
/** Light or dark, as a screen is drawn. */
export type Scheme = 'light' | 'dark';
/** The appearance a kept text names: itself when exactly one of `APPEARANCES`, else System; see `src/appearance.ts`. */
export declare const appearanceOf: (stored: string | undefined) => Choice;
/** The scheme shown under `choice` when the system names `system`; see `src/appearance.ts`. */
export declare const schemeOf: (choice: Choice, system: string | null | undefined) => Scheme;
