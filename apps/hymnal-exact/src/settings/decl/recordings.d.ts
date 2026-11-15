/**
 * One sound's credit: its part, the work, who made it and its licence, with
 * the licence's address if it has one. This file is
 * `@manna/hymnal/recordings` as Exact's type check reads it (the app's
 * `tsconfig.json` maps it here): that check stages a package's
 * declarations, never its source. It names only the credits About reads,
 * in its own terms. The repo's typecheck reads the source itself, so a
 * field About reads that the source renames or retypes fails it.
 */
export interface CreditLine {
  readonly part: string;
  readonly work: string;
  readonly author: string;
  readonly licence: string;
  readonly licenceUrl?: string;
}

/** The credits each recording carries: a lead sentence and a credit per sound. */
export declare const RECORDING_CREDITS: {
  readonly lead: string;
  readonly lines: ReadonlyArray<CreditLine>;
};
