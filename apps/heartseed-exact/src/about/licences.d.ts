/**
 * The shape of `licences.ts`, the licences' texts and the app's version
 * `tools/licences.ts` writes from the current Heartseed's before every `bun
 * run exact` and every test that imports `app.ts`. The module is ignored;
 * this declaration is what a fresh checkout's type check and the gate's
 * import graph read in its place.
 *
 * @writer ../../tools/licences.ts
 */
declare const licences: readonly string[];

/** The current Heartseed's version, its `package.json`'s. */
export declare const version: string;

export default licences;
