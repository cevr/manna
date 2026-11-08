/**
 * `bun run promise:census`: holds the promise check (`./promise.ts`) to every
 * way the email list's promise was lost before (`docs/lessons.md`
 * `email-cadence-limits`, `email-promise-found-by-phrase`,
 * `email-promise-read-in-sources`, `email-promise-net-whole-words`,
 * `email-promise-tags-split-words`, `email-promise-unread-attributes`,
 * `email-promise-held-anywhere`, and the rewrite's round 2 findings, from
 * `email-promise-invisible-characters` on), and to every source of words it
 * refuses (`email-promise-fails-closed`). Each case injects one into a copy of the
 * app's sources, builds the copy as the gate builds the app, runs the check
 * there, and passes only when the check fails and says each line of the case
 * (a `*` in a line stands for a build's content hash, a `…` for any words).
 * A case whose words the sources no longer hold fails too, so no case goes
 * stale unseen. The gate runs it after the check.
 *
 *   bun run promise:census    # prints `promise-census <case> red` per case; exits 1 when one is not
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Array as Arr, Console, Data, Effect, FileSystem, Option, Path, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { CASES, type Case } from './promise-cases.ts';

/** What a copy of the app needs to build and to run the check. */
const COPIED = [
  'src',
  'public',
  'kit',
  'scripts',
  'package.json',
  'tsconfig.json',
  'turbo.json',
  'vite.config.ts',
];

/** The repo's formatter, from a copy of the app (two levels down, as the app is). */
const OXFMT = '../../node_modules/.bin/oxfmt';

/** Cases run at once, each building its own copy. */
const CONCURRENCY = 6;

/** A case's line as the check prints it, a `*` standing for a build's content hash. */
const saying = (line: string) =>
  new RegExp(
    `^promise ${line
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '[\\w-]+')
      .replaceAll('…', '.*')}$`,
  );

class CaseFailed extends Data.TaggedError('CaseFailed')<{ readonly reason: string }> {}

class CensusMissed extends Data.TaggedError('CensusMissed')<{ readonly missed: number }> {
  override get message() {
    return `${this.missed} case(s) of the promise's census did not turn the check red`;
  }
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/** A command's output, stdout then stderr, and its exit code. */
const exec = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(command, args, { cwd, forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    return { output: `${stdout}${stderr}`, code: Number(code) };
  }).pipe(Effect.scoped);

/** A printed entry's instruction: the `HELD` list it goes in (its key as the source writes it), or `HELD` itself for a key it does not name. */
const ENTRY =
  /^promise to hold (?:it|them), paste into HELD(?: under (.+))? in apps\/firsttheblade\/scripts\/promise\.ts:$/;

/** Where a printed entry goes in the check's source: after its list's key, or after `HELD`'s opening. */
const anchorOf = (key: Option.Option<string>) =>
  Option.match(key, {
    onNone: () => 'const HELD = new Map<string, ReadonlyArray<string>>(\n  Object.entries({\n',
    onSome: (list) => `\n    ${list}: [\n`,
  });

/**
 * Pastes each entry the check printed into the copy's `scripts/promise.ts`
 * exactly as printed, then holds the copy to what the entry promises: the
 * check passes, and the pasted file is formatted as the repo formats it.
 */
const holdAsPrinted = (copy: string, output: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lines = output.split('\n');
    const entries = lines.flatMap((line, at) =>
      Option.toArray(
        Option.map(Option.fromNullishOr(ENTRY.exec(line)), (instruction) => ({
          key: Option.fromNullishOr(instruction[1]),
          paste: Arr.takeWhile(lines.slice(at + 1), (next) => /^ {4,}\S/.test(next))
            .map((pasted) => `${pasted}\n`)
            .join(''),
        })),
      ),
    );
    if (entries.length === 0) {
      return yield* new CaseFailed({ reason: `the check printed no entry to paste:\n${output}` });
    }
    const file = path.join(copy, 'scripts', 'promise.ts');
    const source = yield* fs.readFileString(file);
    const misplaced = entries
      .map(({ key }) => anchorOf(key))
      .filter((anchor) => source.split(anchor).length - 1 !== 1);
    if (misplaced.length > 0) {
      return yield* new CaseFailed({
        reason: `an entry's place is not in scripts/promise.ts once:\n${misplaced.join('\n')}`,
      });
    }
    yield* fs.writeFileString(
      file,
      entries.reduce(
        (held, { key, paste }) => held.replace(anchorOf(key), (anchor) => `${anchor}${paste}`),
        source,
      ),
    );
    const again = yield* exec('bun', ['scripts/promise.ts'], copy);
    if (again.code !== 0) {
      return yield* new CaseFailed({
        reason: `with the printed entries pasted, the check exited ${again.code}:\n${again.output}`,
      });
    }
    const formatted = yield* exec(path.join(copy, OXFMT), ['--check', file], copy);
    if (formatted.code !== 0) {
      return yield* new CaseFailed({
        reason: `the pasted entries are not formatted as the repo formats them:\n${formatted.output}`,
      });
    }
  });

/** One case, in its own copy of the app under the repo's `tmp/` (two levels down, as the app is, so its tsconfig's `extends` holds). */
const runCase = (app: string, scratch: string, found: Case) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const copy = yield* fs.makeTempDirectoryScoped({
      directory: scratch,
      prefix: 'ftb-promise-census-',
    });
    yield* Effect.forEach(COPIED, (entry) =>
      fs.copy(path.join(app, entry), path.join(copy, entry)),
    );
    const inject = Effect.gen(function* () {
      const file = path.join(copy, found.file);
      if (found.find === '') {
        if (yield* fs.exists(file)) {
          return yield* new CaseFailed({ reason: `stale: ${found.file} is there already` });
        }
        return yield* fs.writeFileString(file, found.put);
      }
      const source = yield* fs.readFileString(file);
      const times = source.split(found.find).length - 1;
      if (times !== 1) {
        return yield* new CaseFailed({
          reason: `stale: ${found.file} holds its words ${times} times, not once`,
        });
      }
      yield* fs.writeFileString(
        file,
        source.replace(found.find, () => found.put),
      );
    });
    if (found.after !== true) yield* inject;
    const build = yield* exec('bun', ['run', 'build'], copy);
    if (build.code !== 0) {
      return yield* new CaseFailed({ reason: `the build failed:\n${build.output}` });
    }
    if (found.after === true) yield* inject;
    const check = yield* exec('bun', ['scripts/promise.ts'], copy);
    const lines = check.output.split('\n');
    const unsaid = found.said.filter((line) => !lines.some((said) => saying(line).test(said)));
    if (check.code === 0 || unsaid.length > 0) {
      return yield* new CaseFailed({
        reason: `the check exited ${check.code} and did not say:\n${unsaid.join('\n')}\nit said:\n${check.output}`,
      });
    }
    if (found.held === true) yield* holdAsPrinted(copy, check.output);
  }).pipe(Effect.scoped);

const census = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const app = path.dirname(import.meta.dir);
  const scratch = path.join(app, '..', '..', 'tmp');
  yield* fs.makeDirectory(scratch, { recursive: true });
  const results = yield* Effect.forEach(
    CASES,
    (found) =>
      runCase(app, scratch, found).pipe(
        Effect.as(`promise-census ${found.name}: red`),
        Effect.catchTag('CaseFailed', (failed) =>
          Effect.succeed(`promise-census ${found.name}: NOT RED, ${failed.reason}`),
        ),
      ),
    { concurrency: CONCURRENCY },
  );
  yield* Effect.forEach(results, (line) => Console.log(line));
  const missed = results.filter((line) => !line.endsWith(': red')).length;
  if (missed > 0) return yield* new CensusMissed({ missed });
});

census.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
