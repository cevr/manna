/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noNullish -- a host tool's reference files on disk, taken in order: plain TypeScript as the harness's other host tools; a take that never held still answers no picture, and a check that finds nothing wrong no reason. */

/**
 * A reference retaken without losing the one there: the new picture is
 * taken beside it (`<cell>.taking.png`), and only once it is still and its
 * checks pass is it renamed over the reference. A refused take is removed
 * and leaves the old reference's bytes as they were.
 */

import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

type Taken =
  | { readonly _tag: 'Kept'; readonly shot: Uint8Array }
  | { readonly _tag: 'Refused'; readonly reason: string };

/**
 * Takes `file` through `take` (which writes the picture at the path it is
 * given, and answers its bytes, or none when the screen never held still)
 * and keeps it when `check` finds nothing wrong with it.
 */
export const keepTaken = async (
  file: string,
  take: (taking: string) => Promise<Uint8Array | undefined>,
  check: (shot: Uint8Array) => string | undefined,
): Promise<Taken> => {
  const taking = file.replace(/\.png$/, '.taking.png');
  mkdirSync(dirname(file), { recursive: true });
  const refused = (reason: string): Taken => {
    rmSync(taking, { force: true });
    return { _tag: 'Refused', reason };
  };
  const shot = await take(taking);
  if (shot === undefined) return refused('moving: no two takes 500 ms apart were the same bytes');
  const reason = check(shot);
  if (reason !== undefined) return refused(reason);
  renameSync(taking, file);
  return { _tag: 'Kept', shot };
};
