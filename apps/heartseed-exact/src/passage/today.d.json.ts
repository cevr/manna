/**
 * The shape of `today.json`, the passage `tools/passage.ts` writes from the
 * KJV before every `bun run exact` and every test that imports `app.ts`. The
 * file is ignored, so no verse text is committed; this declaration is what a
 * fresh checkout's type check and the gate's import graph read in its place.
 */
declare const passage: { readonly reference: string; readonly text: string };

export default passage;
