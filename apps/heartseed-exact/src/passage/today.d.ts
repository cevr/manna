/**
 * The shape of `today.ts`, the passage `tools/passage.ts` writes from the
 * KJV before every `bun run exact` and every test that imports `app.ts`. The
 * module is ignored, so no verse text is committed; this declaration is what
 * a fresh checkout's type check and the gate's import graph read in its place.
 *
 * @writer ../../tools/passage.ts
 */
declare const passage: { readonly reference: string; readonly text: string };

export default passage;
