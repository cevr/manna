/**
 * The app's data module for the Bun tests. A test imports it here, so the
 * type check of `src/` reads `app.d.ts` beside it and never `app.ts`, whose
 * types Exact generates (`app.contract.d.ts`, ignored); Exact's own type
 * check holds `app.ts` to the Contract.
 */
export { answer } from '../../app.ts';
