import { Array as Arr, Console, Effect, FileSystem, Option, Path, Stream } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

interface Sized {
  readonly name: string;
  readonly bytes: number;
}

export const partsOf = (files: ReadonlyArray<Sized>, count: number) => {
  const parts: Array<{ bytes: number; readonly names: Array<string> }> = Array.from(
    { length: Math.max(1, Math.floor(count)) },
    () => ({ bytes: 0, names: [] }),
  );
  const bySize = files.toSorted((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  for (const file of bySize) {
    const least = Math.min(...parts.map((part) => part.bytes));
    Option.map(
      Arr.findFirst(parts, (part) => part.bytes === least),
      (lightest) => {
        lightest.bytes += file.bytes;
        lightest.names.push(file.name);
      },
    );
  }
  return parts.filter((part) => part.names.length > 0).map((part) => part.names.toSorted());
};

export const shareOf = (cores: number) => {
  const parts = Math.min(4, Math.max(1, Math.floor(cores / 3)));
  return { parts, threads: Math.max(1, Math.floor(cores / parts)) };
};

interface PartRun {
  readonly output: string;
  readonly code: number;
}

const runPart = (root: string, bin: string, args: ReadonlyArray<string>) =>
  Effect.fn('guard.runPart')(function* (files: ReadonlyArray<string>) {
    const spawner = yield* ChildProcessSpawner;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make(bin, [...args, ...files], { cwd: root, forceKillAfter: '5 seconds' }),
        );
        const [out, err, code] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(handle.stdout)),
            Stream.mkString(Stream.decodeText(handle.stderr)),
            handle.exitCode,
          ],
          { concurrency: 3 },
        );
        return { output: `${out}${err}`, code: Number(code) } satisfies PartRun;
      }),
    );
  });

export const sizesOf = Effect.fn('guard.sizesOf')(function* (
  root: string,
  files: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* Effect.forEach(
    files,
    (name): Effect.Effect<Sized, PlatformError> =>
      Effect.map(fs.stat(path.join(root, name)), (info) => ({ name, bytes: Number(info.size) })),
    { concurrency: 16 },
  );
});

export const runEachPart = Effect.fn('guard.runEachPart')(function* (
  root: string,
  bin: string,
  args: ReadonlyArray<string>,
  parts: ReadonlyArray<ReadonlyArray<string>>,
) {
  const path = yield* Path.Path;
  return yield* Effect.forEach(parts, runPart(root, path.join(root, bin), args), {
    concurrency: Math.max(1, parts.length),
  });
});

export const runParts = Effect.fn('guard.runParts')(function* (
  root: string,
  bin: string,
  args: ReadonlyArray<string>,
  parts: ReadonlyArray<ReadonlyArray<string>>,
) {
  const runs = yield* runEachPart(root, bin, args, parts);
  yield* Effect.forEach(
    runs.filter((run) => run.output !== ''),
    (run) => Console.log(run.output.trimEnd()),
    { discard: true },
  );
  return Math.max(0, ...runs.map((run) => run.code));
});
