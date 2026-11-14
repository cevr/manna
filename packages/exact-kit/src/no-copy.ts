import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

/** Lines a port's file may share with one source file before it counts as a copy of it. */
export const SHARED_LINE_LIMIT = 6;

/** Folders under an app that hold no file of its own: installs, builds, Exact's scratch. */
const SKIPPED = new Set(['node_modules', '.exact', 'dist', 'target', '.turbo']);

/** Files whose text is compared. */
const TEXT = /\.(?:ts|tsx|mts|mjs|js|json|contract)$/;

/** One file of a port that shares more than the limit with a source file of a current app. */
export interface Copy {
  readonly file: string;
  readonly source: string;
  readonly shared: number;
}

/** The port holds copies of a current app's code: it should import that code instead. */
export class CopiesFound extends Schema.TaggedError<CopiesFound>()('CopiesFound', {
  copies: Schema.Array(
    Schema.Struct({ file: Schema.String, source: Schema.String, shared: Schema.Int }),
  ),
}) {
  override get message() {
    const lines = this.copies.map(
      (copy) => `${copy.file} shares ${copy.shared} lines with ${copy.source}`,
    );
    return `copied code; import it through the package's exports instead:\n${lines.join('\n')}`;
  }
}

/** A line that says something of its own: trimmed, with a word in it, not an import, not short punctuation. */
const meaningful = (line: string) =>
  line.length >= 16 &&
  /[A-Za-z]{3}/.test(line) &&
  !/^(?:import|export \{|\} from|\/\/|\*|\/\*)/.test(line);

/** The distinct meaningful lines of a text. */
export const linesOf = (text: string): ReadonlySet<string> =>
  new Set(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(meaningful),
  );

/** How many of `file`'s lines `source` holds too. */
export const sharedLines = (file: ReadonlySet<string>, source: ReadonlySet<string>) =>
  [...file].filter((line) => source.has(line)).length;

/** Every text file under `dir`, skipping installs, builds and Exact's scratch. */
const filesUnder = (
  dir: string,
): Effect.Effect<ReadonlyArray<string>, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir);
    const nested = yield* Effect.forEach(
      entries.filter((entry) => !SKIPPED.has(entry)),
      (entry) =>
        Effect.gen(function* () {
          const at = path.join(dir, entry);
          const info = yield* fs.stat(at);
          if (info.type === 'Directory') return yield* filesUnder(at);
          if (info.type === 'File' && TEXT.test(entry)) return [at];
          return [];
        }),
      { concurrency: 8 },
    );
    return nested.flat();
  });

/** The source files of a current app under `dir`: its `.ts` and `.tsx` files, tests left out. */
export const sourcesUnder = (dir: string) =>
  Effect.map(filesUnder(dir), (files) =>
    files.filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)),
  );

/**
 * Fails with `CopiesFound` when a file under `appDir` shares more than `SHARED_LINE_LIMIT` meaningful
 * lines with one of `sources`, the named source files of a current app: a port imports that code
 * through package exports, never copies it.
 */
export const noCopies = Effect.fn('ExactKit.noCopies')(function* (
  appDir: string,
  sources: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const read = (file: string) => Effect.map(fs.readFileString(file), linesOf);
  const known = yield* Effect.forEach(
    sources,
    (source) => Effect.map(read(source), (lines) => ({ source, lines })),
    { concurrency: 8 },
  );
  const files = yield* filesUnder(appDir);
  const copies = (yield* Effect.forEach(
    files,
    (file) =>
      Effect.map(read(file), (lines) =>
        known
          .map(({ source, lines: theirs }) => ({
            file,
            source,
            shared: sharedLines(lines, theirs),
          }))
          .filter((copy) => copy.shared > SHARED_LINE_LIMIT),
      ),
    { concurrency: 8 },
  )).flat();
  if (copies.length > 0) return yield* CopiesFound.make({ copies });
});

/**
 * `noCopies` of `appDir` against every source file under `sourceDir`, as a promise: an app's own
 * Bun test calls it so that the test imports nothing but this, since Exact's type check stages the
 * declarations of every package a file in the app's folder imports, and `effect`'s name a second
 * rolldown in this repo.
 */
export const assertNoCopies = (appDir: string, sourceDir: string) =>
  Effect.runPromise(
    Effect.flatMap(sourcesUnder(sourceDir), (sources) => noCopies(appDir, sources)).pipe(
      Effect.provide(BunServices.layer),
    ),
  );
