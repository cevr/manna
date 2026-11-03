/**
 * The contained host: the only way the drive reaches the host's files and
 * tools. `contain(place)` runs an effect over a FileSystem and a
 * ChildProcessSpawner built over the platform ones from the drive's roots:
 * the place's app, state and features folders, and each root a step admits
 * (its output folder, a given `.app`).
 *
 * Every path an operation reads, writes, builds into, signs, installs from
 * or deletes is resolved at the moment of use by following each link on it,
 * and must lie under the canonical form of every root that lexically holds
 * it; otherwise the call fails with `Escaped`, carried in a `PlatformError`
 * so each step's error channel stays the host's. A tool's absolute
 * arguments and its cwd are checked the same way when it spawns; the tree a
 * tool acts on whole (derived data, the app it signs or installs, the native
 * folder a prebuild writes) must hold no link that leads out of its root.
 */
import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Option,
  Path,
  Redacted,
  Sink,
  Stream,
} from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { type ChildProcess, ChildProcessSpawner, type CommandLine } from 'effect/process';

import type { App } from './app.ts';
import { Escaped } from './errors.ts';

/** The folders a drive starts from: its app, state and features, and the app's native layout. */
interface Where {
  readonly app: string;
  readonly state: string;
  readonly features: string;
  readonly config: App;
}

/** The platform services the contained ones are built over, kept so a nested `contain` replaces, not stacks. */
const Platform = Context.Reference<
  Option.Option<{
    readonly fs: FileSystem.FileSystem;
    readonly spawner: ChildProcessSpawner.ChildProcessSpawner['Service'];
  }>
>('@manna/sim/host/Platform', { defaultValue: () => Option.none() });

/** The roots the running step reaches, which it widens with `admit`. */
export class Reach extends Context.Service<
  Reach,
  { readonly admit: (root: string) => Effect.Effect<void> }
>()('@manna/sim/host/Reach') {}

/** Make `root` (an output folder, a given `.app`) a root of the running step. */
export const admit = (root: string) =>
  Effect.gen(function* () {
    const reach = yield* Reach;
    yield* reach.admit(root);
  });

/** Arguments the argv names as programs to run, not paths a tool acts on. */
const Executables = Context.Reference<ReadonlySet<string>>('@manna/sim/host/Executables', {
  defaultValue: () => new Set(),
});

/** Spawn the tools `effect` runs with each of `programs` marked as a program in their argv. */
export const executing =
  (programs: ReadonlyArray<string>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, Executables, new Set(programs));

/** An argv word as the tool reads it. */
const wordText = (word: CommandLine.Word) => {
  if (Redacted.isRedacted(word)) return Redacted.value(word);
  return word;
};

/** Under the folder itself, or anywhere beneath it. */
const under = (file: string, dir: string) => file === dir || file.startsWith(`${dir}/`);

/** CocoaPods' header links, which point into the pods and the app's node_modules. */
const PREBUILD_SKIPS = ['Pods/Headers'];

const LINK_HOPS = 40;

/** Every FileSystem member: each one is written out, so a member added upstream fails to compile here. */
type Members = Omit<FileSystem.FileSystem, '~effect/FileSystem'>;

const make = (
  base: FileSystem.FileSystem,
  spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  path: Path.Path,
  where: Where,
  roots: Array<string>,
) => {
  const refuse = (
    operation: string,
    file: string,
    resolved: string,
    outside: ReadonlyArray<string>,
  ) =>
    PlatformError.badArgument({
      module: 'ContainedHost',
      method: operation,
      cause: Escaped.make({ operation, path: file, resolved, outside: [...outside] }),
    });

  /** `file` from the working folder, its `..` kept for the walk to take after each link. */
  const absolute = (file: string) => {
    if (path.isAbsolute(file)) return file;
    return `${path.resolve('.')}/${file}`;
  };

  /** The link at `next`, unless it is the path's last name and the call acts on the link itself. */
  const linkAt = (next: string, last: boolean, follow: boolean) => {
    if (last && !follow) return Effect.succeedNone;
    return Effect.option(base.readLink(next));
  };

  /**
   * Where the kernel takes `file`: its components walked in order, a link's
   * raw target put in place of the link among the components still to walk
   * (from the root when it is absolute), and each `..` taken on where the
   * walk stands, so a `..` after a link leaves the link's target, never the
   * link. The last link is followed only when `follow`. A missing component
   * is walked as the folder a recursive create would make. A walk past the
   * hop limit is a loop, refused.
   */
  const resolve = (file: string, follow: boolean) =>
    Effect.gen(function* () {
      const pending = absolute(file).split('/');
      let at = '/';
      let hops = 0;
      while (pending.length > 0) {
        const part = pending.shift() ?? '';
        if (part === '' || part === '.') continue;
        if (part === '..') {
          at = path.dirname(at);
          continue;
        }
        const next = path.join(at, part);
        const last = pending.every((rest) => rest === '' || rest === '.');
        const link = yield* linkAt(next, last, follow);
        if (Option.isNone(link)) {
          at = next;
          continue;
        }
        hops += 1;
        if (hops > LINK_HOPS) return yield* refuse('resolve', file, next, roots);
        if (path.isAbsolute(link.value)) at = '/';
        pending.unshift(...link.value.split('/'));
      }
      return at;
    });

  /** Each root that lexically holds `file`, with its canonical form now. */
  const holders = (file: string) =>
    Effect.gen(function* () {
      const lexical = path.resolve(absolute(file));
      const held: Array<{ readonly root: string; readonly canonical: string }> = [];
      for (const root of roots) {
        const canonical = yield* resolve(root, true);
        if (under(lexical, path.resolve(root)) || under(lexical, canonical))
          held.push({ root, canonical });
      }
      return held;
    });

  /** `file` resolved now, refused unless it lies under every root that holds it. */
  const checked = (operation: string, file: string, follow: boolean) =>
    Effect.gen(function* () {
      const resolved = yield* resolve(file, follow);
      const held = yield* holders(file);
      const left = held.filter(({ canonical }) => !under(resolved, canonical));
      if (held.length === 0 || left.length > 0)
        return yield* refuse(
          operation,
          file,
          resolved,
          left.map(({ root }) => root),
        );
      return resolved;
    });

  /**
   * `checked`, and no link the tool can reach through the tree leads out of
   * a root that holds it: every folder reached, beneath the tree or through
   * a link in it, is read once by its canonical path, so an alias whose
   * target stays inside is followed into its descendants and a cycle ends.
   * Entries under `skips` (folders of the tree) are not read.
   */
  const tree = (operation: string, file: string, skips: ReadonlyArray<string> = []) =>
    Effect.gen(function* () {
      const resolved = yield* checked(operation, file, true);
      const held = yield* holders(file);
      const skipped = skips.map((skip) => path.join(resolved, skip));
      const seen = new Set<string>();
      const isDirectory = (dir: string) =>
        Effect.map(Effect.option(base.stat(dir)), (info) =>
          Option.exists(info, ({ type }) => type === 'Directory'),
        );
      const visit = (dir: string): Effect.Effect<void, PlatformError.PlatformError> =>
        Effect.gen(function* () {
          if (seen.has(dir)) return;
          seen.add(dir);
          const names = yield* base.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
          for (const name of names) {
            const entry = path.join(dir, name);
            if (skipped.some((skip) => under(entry, skip))) continue;
            const link = yield* Effect.option(base.readLink(entry));
            if (Option.isNone(link)) {
              if (yield* isDirectory(entry)) yield* visit(entry);
              continue;
            }
            const target = yield* resolve(entry, true);
            const left = held.filter(({ canonical }) => !under(target, canonical));
            if (left.length > 0)
              return yield* refuse(
                operation,
                entry,
                target,
                left.map(({ root }) => root),
              );
            if (yield* isDirectory(target)) yield* visit(target);
          }
        });
      yield* visit(resolved);
      return resolved;
    });

  /** `file` with its folder resolved and its last name kept: the link itself, not its target. */
  const itself = (operation: string, file: string) => checked(operation, file, false);
  const at = (operation: string, file: string) => checked(operation, file, true);

  const refusedTemp = (operation: string) =>
    Effect.fail(refuse(operation, 'a temporary path', 'a temporary path', []));

  const members: Members = {
    access: base.access,
    exists: base.exists,
    glob: base.glob,
    lstat: base.lstat,
    readLink: base.readLink,
    realPath: base.realPath,
    stat: base.stat,
    chmod: (file, mode) => Effect.flatMap(at('chmod', file), (real) => base.chmod(real, mode)),
    chown: (file, uid, gid) =>
      Effect.flatMap(at('chown', file), (real) => base.chown(real, uid, gid)),
    copy: (from, to, options) =>
      Effect.gen(function* () {
        const source = yield* tree('copy', from);
        const target = yield* tree('copy', to);
        return yield* base.copy(source, target, options);
      }),
    copyFile: (from, to) =>
      Effect.gen(function* () {
        const source = yield* at('copyFile', from);
        const target = yield* at('copyFile', to);
        return yield* base.copyFile(source, target);
      }),
    link: (from, to) =>
      Effect.gen(function* () {
        const source = yield* at('link', from);
        const target = yield* itself('link', to);
        return yield* base.link(source, target);
      }),
    symlink: (target, file) =>
      Effect.gen(function* () {
        const real = yield* itself('symlink', file);
        let lands = target;
        if (!path.isAbsolute(target)) lands = `${path.dirname(real)}/${target}`;
        yield* at('symlink', lands);
        return yield* base.symlink(target, real);
      }),
    makeDirectory: (file, options) =>
      Effect.flatMap(at('makeDirectory', file), (real) => base.makeDirectory(real, options)),
    makeTempDirectory: () => refusedTemp('makeTempDirectory'),
    makeTempDirectoryScoped: () => refusedTemp('makeTempDirectoryScoped'),
    makeTempFile: () => refusedTemp('makeTempFile'),
    makeTempFileScoped: () => refusedTemp('makeTempFileScoped'),
    open: (file, options) => Effect.flatMap(at('open', file), (real) => base.open(real, options)),
    readDirectory: (file, options) =>
      Effect.flatMap(at('readDirectory', file), (real) => base.readDirectory(real, options)),
    readDirectoryEntries: (file) =>
      Effect.flatMap(at('readDirectoryEntries', file), (real) => base.readDirectoryEntries(real)),
    readFile: (file) => Effect.flatMap(at('readFile', file), (real) => base.readFile(real)),
    readFileString: (file, encoding) =>
      Effect.flatMap(at('readFileString', file), (real) => base.readFileString(real, encoding)),
    remove: (file, options) =>
      Effect.flatMap(itself('remove', file), (real) => base.remove(real, options)),
    rename: (from, to) =>
      Effect.gen(function* () {
        const source = yield* itself('rename', from);
        const target = yield* itself('rename', to);
        return yield* base.rename(source, target);
      }),
    sink: (file, options) =>
      Sink.unwrap(Effect.map(at('sink', file), (real) => base.sink(real, options))),
    stream: (file, options) =>
      Stream.unwrap(Effect.map(at('stream', file), (real) => base.stream(real, options))),
    truncate: (file, length) =>
      Effect.flatMap(at('truncate', file), (real) => base.truncate(real, length)),
    utimes: (file, atime, mtime) =>
      Effect.flatMap(at('utimes', file), (real) => base.utimes(real, atime, mtime)),
    watch: (file, options) =>
      Stream.unwrap(Effect.map(at('watch', file), (real) => base.watch(real, options))),
    writeFile: (file, data, options) =>
      Effect.flatMap(at('writeFile', file), (real) => base.writeFile(real, data, options)),
    writeFileString: (file, data, options) =>
      Effect.flatMap(at('writeFileString', file), (real) =>
        base.writeFileString(real, data, options),
      ),
  };
  const fs: FileSystem.FileSystem = { ...base, ...members };

  /** The argument a tool acts on as a whole tree: derived data it builds into, the app it signs or installs. */
  const treeAt = (tool: string, args: ReadonlyArray<string>): Option.Option<number> => {
    if (tool === 'xcodebuild')
      return Option.map(
        Arr.findFirstIndex(args, (arg) => arg === '-derivedDataPath'),
        (flag) => flag + 1,
      );
    if (tool === 'codesign') return Option.some(args.length - 1);
    if (tool === 'xcrun' && args[0] === 'simctl' && args[1] === 'install')
      return Option.some(args.length - 1);
    return Option.none();
  };

  /** The folder `prebuild:native` writes: the app's native folder, where its workspace lies. */
  const native = path.join(where.app, path.dirname(where.config.ios.workspace));

  const checkSpawn = (command: ChildProcess.Command) =>
    Effect.gen(function* () {
      if (command._tag !== 'StandardCommand')
        return yield* refuse('spawn', 'a piped command', 'a piped command', []);
      const programs = yield* Executables;
      const args = command.args.map(wordText);
      if (command.command === 'bun' && args.includes('prebuild:native'))
        yield* tree('prebuild', native, PREBUILD_SKIPS);
      const whole = treeAt(command.command, args);
      for (const [index, arg] of args.entries()) {
        if (programs.has(arg) || !path.isAbsolute(arg)) continue;
        if (Option.contains(whole, index)) yield* tree('spawn', arg);
        else yield* at('spawn', arg);
      }
      const cwd = Option.fromUndefinedOr(command.options.cwd);
      if (Option.isSome(cwd)) yield* at('spawn', cwd.value);
    });

  const contained = ChildProcessSpawner.make((command) =>
    Effect.andThen(checkSpawn(command), spawner.spawn(command)),
  );
  return { fs, spawner: contained };
};

/** The services a first `contain` finds: the platform's own. */
const platformServices = Effect.gen(function* () {
  return {
    fs: yield* FileSystem.FileSystem,
    spawner: yield* ChildProcessSpawner.ChildProcessSpawner,
  };
});

/**
 * Run `effect` over the contained host of `where`'s roots and `extra` ones:
 * its FileSystem and ChildProcessSpawner are the contained ones, and `admit`
 * widens its roots. A `contain` inside another starts again from the
 * platform's services.
 */
export const contain =
  (where: Where, extra: ReadonlyArray<string> = []) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const platform = yield* Option.match(yield* Platform, {
        onSome: Effect.succeed,
        onNone: () => platformServices,
      });
      const path = yield* Path.Path;
      const roots = [where.app, where.state, where.features, ...extra];
      const host = make(platform.fs, platform.spawner, path, where, roots);
      return yield* effect.pipe(
        Effect.provideService(
          Reach,
          Reach.of({ admit: (root) => Effect.sync(() => void roots.push(root)) }),
        ),
        Effect.provideService(FileSystem.FileSystem, host.fs),
        Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, host.spawner),
        Effect.provideService(Platform, Option.some(platform)),
      );
    });
