import { Console, Effect, FileSystem, Path, Runtime, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { declarations, isSource, listedFiles, uncovered } from './coverage.js';
import { tscScript } from './tsc.js';

class ListFailed extends Schema.TaggedError<ListFailed>()('ListFailed', {
  code: Schema.Finite,
  output: Schema.String,
}) {
  override get message() {
    return `typecheck-coverage: tsc --listFilesOnly exited ${this.code}: ${this.output.trim()}`;
  }
  override readonly [Runtime.errorReported] = false;
}

class Uncovered extends Schema.TaggedError<Uncovered>()('Uncovered', {
  files: Schema.Array(Schema.String),
}) {
  override get message() {
    return [
      `typecheck-coverage: ${this.files.length} TypeScript file(s) are outside the tsconfig's program, so no typecheck reads them:`,
      ...this.files.map((file) => `  ${file}`),
    ].join('\n');
  }
  override readonly [Runtime.errorReported] = false;
}

class Unchecked extends Schema.TaggedError<Unchecked>()('Unchecked', {
  files: Schema.Array(Schema.String),
}) {
  override get message() {
    return [
      `typecheck-coverage: ${this.files.length} declaration file(s) are in the program, but skipLibCheck hides their errors:`,
      ...this.files.map((file) => `  ${file}`),
    ].join('\n');
  }
  override readonly [Runtime.errorReported] = false;
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

const programOf = (tsconfig: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const tsc = yield* tscScript;
    const child = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [tsc, '--listFilesOnly', '-p', tsconfig], {
        forceKillAfter: '5 seconds',
      }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    if (Number(code) !== 0) {
      return yield* ListFailed.make({ code: Number(code), output: `${stdout}${stderr}` });
    }
    return listedFiles(stdout);
  }).pipe(Effect.scoped);

export const check = (packageRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.realPath(packageRoot);
    const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
    const [listing, program] = yield* Effect.all(
      [fs.readDirectory(root, { recursive: true }), programOf(path.join(root, 'tsconfig.json'))],
      { concurrency: 2 },
    );
    const files = yield* Effect.forEach(
      listing.map((file) => file.split(path.sep).join('/')).filter(isSource),
      (listed) =>
        Effect.map(fs.realPath(path.join(root, listed)), (real) => ({
          listed,
          disk: relative(real),
        })),
      { concurrency: 64 },
    );
    const known = yield* Effect.forEach(
      program,
      (spelled) => Effect.map(fs.realPath(spelled), (real) => ({ spelled, disk: relative(real) })),
      { concurrency: 64 },
    );
    const missing = uncovered(
      files,
      known.map(({ disk }) => disk),
    );
    if (missing.length > 0) return yield* Uncovered.make({ files: missing });
    const declared = declarations(known);
    if (declared.length > 0) return yield* Unchecked.make({ files: declared });
    yield* Console.log(
      `typecheck-coverage: under ${root}, outside node_modules, every TypeScript source is in its tsconfig's program and no program file is a declaration file, each by its real path`,
    );
  });
