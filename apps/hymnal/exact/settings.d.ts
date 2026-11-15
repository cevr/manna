/**
 * `src/settings.ts` as Exact's type check reads it, cut to what the port
 * reads: the appearance setting's three values, in the order Settings
 * offers them. The source's `Appearance` is an Effect schema of them; the
 * port's tests decode with it under Bun. `test/exact-declarations.ts`
 * holds it to the source.
 */
export declare const Appearance: { readonly literals: readonly ['system', 'light', 'dark'] };

/** How the app is shown: as the system is set, or always light, or always dark. */
export type Appearance = (typeof Appearance.literals)[number];
