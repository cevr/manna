/**
 * The shape of `nearest.gen.ts`, which `src/abouthymn/make.ts` writes before
 * every `bun run exact`: each hymn's number and the hymns most like it, the
 * nearest first, as the current app's `moreLike(number, MORE_LIKE)` answers.
 * The module is ignored; this declaration is what a fresh checkout's type
 * check and the gate's import graph read in its place.
 * @writer ./make.ts
 */
declare const nearest: ReadonlyArray<readonly [number, ReadonlyArray<number>]>;

export default nearest;
