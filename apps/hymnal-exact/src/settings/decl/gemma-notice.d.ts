/**
 * `@manna/hymnal-app/gemma-notice` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): About's Gemma notice in its parts,
 * the two links' words and addresses, and the Terms button's label. The
 * repo's typecheck reads the source itself; `src/settings/about.test.ts`
 * holds this to it.
 */
export declare const GEMMA_NOTICE: {
  readonly lead: string;
  readonly terms: string;
  readonly termsUrl: string;
  readonly between: string;
  readonly policy: string;
  readonly policyUrl: string;
  readonly end: string;
  readonly termsButton: string;
};
