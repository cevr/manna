import { Glob, JSONC } from 'bun';
import { Effect, FileSystem, Path, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

class GitFailed extends Schema.TaggedError<GitFailed>()('GitFailed', {
  command: Schema.String,
  code: Schema.Finite,
}) {
  override get message() {
    return `git ${this.command} exited ${this.code}`;
  }
}

const git = (root: string, args: ReadonlyArray<string>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('git', args, {
          cwd: root,
          stderr: 'ignore',
          forceKillAfter: '5 seconds',
        }),
      );
      const [out, code] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 2 },
      );
      if (code !== 0)
        return yield* GitFailed.make({
          command: args.find((arg) => !arg.startsWith('-') && !arg.includes('=')) ?? 'git',
          code,
        });
      return out;
    }),
  );

export const repoRoot = (cwd: string) =>
  Effect.map(git(cwd, ['rev-parse', '--show-toplevel']), (out) => out.trim());

const namesOf = (listing: string) => listing.split('\0').filter((name) => name !== '');

const RootPackage = Schema.Struct({ workspaces: Schema.optional(Schema.Array(Schema.String)) });

const workspacesOf = Effect.fn('guard.workspacesOf')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(root, 'package.json');
  if (!(yield* fs.exists(file))) return [];
  const text = yield* fs.readFileString(file);
  const { workspaces = [] } = yield* Schema.decodeEffect(Schema.fromJsonString(RootPackage))(text);
  return workspaces.map((glob) => new Glob(`${glob.replace(/\/+$/, '')}/**`));
});

export const gateFiles = Effect.fn('guard.gateFiles')(function* (root: string) {
  const [tracked, fresh, deleted, workspaces] = yield* Effect.all(
    [
      git(root, ['ls-files', '-z', '--cached']),
      git(root, ['ls-files', '-z', '--others', '--exclude-standard']),
      git(root, ['ls-files', '-z', '--deleted']),
      workspacesOf(root),
    ],
    { concurrency: 4 },
  );
  const gone = new Set(namesOf(deleted));
  const inWorkspace = (file: string) => workspaces.some((glob) => glob.match(file));
  return [...new Set([...namesOf(tracked), ...namesOf(fresh).filter(inWorkspace)])]
    .filter((file) => !gone.has(file))
    .toSorted();
});

const LintConfig = Schema.Struct({ ignorePatterns: Schema.optional(Schema.Array(Schema.String)) });

class LintConfigUnreadable extends Schema.TaggedError<LintConfigUnreadable>()(
  'LintConfigUnreadable',
  { file: Schema.String, detail: Schema.String },
) {
  override get message() {
    return `${this.file}: ${this.detail}`;
  }
}

export const lintIgnored = Effect.fn('guard.lintIgnored')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(root, '.oxlintrc.json');
  const text = yield* fs.readFileString(file);
  const parsed = yield* Effect.try({
    try: (): unknown => JSONC.parse(text),
    catch: () => LintConfigUnreadable.make({ file, detail: 'not JSONC' }),
  });
  const config = yield* Schema.decodeUnknownEffect(LintConfig)(parsed).pipe(
    Effect.mapError(() => LintConfigUnreadable.make({ file, detail: 'ignorePatterns unread' })),
  );
  const globs = (config.ignorePatterns ?? []).map((pattern) => new Glob(pattern));
  return (name: string) => globs.some((glob) => glob.match(name));
});
