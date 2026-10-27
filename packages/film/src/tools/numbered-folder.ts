// A numbered folder of one's own under a root (`1`, `2`, …): the next number
// past every one there, made by this call alone. A folder is made only where
// none is (`makeDirectory`, not recursive), so two runs that read the root at
// once never share one: the one that finds its number made takes the next.
// A root that cannot be read fails; a root not there yet is made.

import { Effect, FileSystem, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

const isAlreadyExists = (error: PlatformError) => error.reason._tag === 'AlreadyExists';

/** The numbers of the numbered folders `names` holds. */
const numbersIn = (names: ReadonlyArray<string>) =>
  names.filter((n) => /^\d+$/.test(n)).map(Number);

/**
 * The next numbered folder under `root`, made by this call alone: its number
 * and its path. A number another run made first is passed over for the next.
 */
export const reserveNumbered = Effect.fn('reserveNumbered')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(root, { recursive: true });
  const first = Math.max(0, ...numbersIn(yield* fs.readDirectory(root))) + 1;
  const claim = (n: number): Effect.Effect<{ n: number; dir: string }, PlatformError> => {
    const dir = path.join(root, String(n));
    return fs.makeDirectory(dir).pipe(
      Effect.as({ n, dir }),
      Effect.catchIf(isAlreadyExists, () => claim(n + 1)),
    );
  };
  return yield* claim(first);
});
