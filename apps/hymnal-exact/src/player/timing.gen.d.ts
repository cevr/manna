/**
 * The shape of `timing.gen.ts`, which `tools/timing.ts` writes before every
 * `bun run exact`: each hymn's number and its line timing in the encoding
 * the current app's `timelineOf` decodes, each line's words left out. The
 * module is ignored; this declaration is what a fresh checkout's type check
 * and the gate's import graph read in its place.
 * @writer ../../tools/timing.ts
 */
declare const timing: ReadonlyArray<readonly [number, string]>;

export default timing;
