/**
 * The Feel's sound files, rendered in memory: each of the current hymnal's
 * voice's sounds (`RECIPES`), through its own `voiced`, as the bytes the
 * port ships at its table's path (`soundPath`). `tools/sounds.ts` writes
 * them; the tests hold them here, so no test reads a generated file.
 */

import { RECIPES, voiced } from '@manna/hymnal-app/feel/voice';

import { soundPath } from './cues.ts';

/** One file: the app-relative path its `sound` line declares, and its bytes. */
export interface SoundFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** Every sound the voice holds, as the file the port ships. */
export const soundFiles = (): ReadonlyArray<SoundFile> =>
  RECIPES.map(([name, recipe]) => ({ path: soundPath(name), bytes: voiced(name, recipe).wav }));
