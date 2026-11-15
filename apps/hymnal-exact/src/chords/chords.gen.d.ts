/**
 * The shape of `chords.gen.ts`, which `src/hymns/make.ts` writes before
 * every `bun run exact`: each hymn's number and its chords' string, in the
 * encoding the current app's `decodeHymn` reads (`vite/chords.ts`, its
 * `virtual:hymnal-chords`). The module is ignored; this declaration is
 * what a fresh checkout's type check and the gate's import graph read in
 * its place.
 * @writer ../hymns/make.ts
 */
declare const chords: ReadonlyArray<readonly [number, string]>;

export default chords;
