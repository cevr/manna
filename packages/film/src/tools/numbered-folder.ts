import { Effect, FileSystem, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

const isAlreadyExists = (error: PlatformError) => error.reason._tag === 'AlreadyExists';

const numbersIn = (names: ReadonlyArray<string>) =>
  names.filter((n) => /^\d+$/.test(n)).map(Number);

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
