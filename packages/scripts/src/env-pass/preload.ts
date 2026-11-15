import { TOML } from 'bun';
import { Option, Predicate, Schema } from 'effect';
import { commandsOf } from '../test-budget/shell.ts';
import type { Resolved } from './graph.ts';

/** A bunfig's `preload`: one module or a list of them. */
const Preload = Schema.Union([Schema.String, Schema.Array(Schema.String)]);

/** What this reads of a bunfig: the modules every bun process preloads, and those `bun test` preloads. */
const Bunfig = Schema.Struct({
  preload: Schema.optionalKey(Preload),
  test: Schema.optionalKey(Schema.Struct({ preload: Schema.optionalKey(Preload) })),
});

/** A workspace as the preload reader reads it. */
export interface Workspace {
  /** Its folder from the repo's root. */
  readonly dir: string;
  readonly scripts: Readonly<Record<string, string>>;
  /** The text of its `bunfig.toml`, `''` when it has none. */
  readonly bunfig: string;
  /** Its wrappers of `bun test`, by their paths from it: they run `bun test` with the words they are given. */
  readonly wrappers: ReadonlyArray<string>;
  /** Each task turbo runs, with the package scripts that run inside it. */
  readonly runs: ReadonlyMap<string, ReadonlyArray<string>>;
}

/** The flags bun reads a preload from. */
const PRELOAD_FLAGS = new Set(['--preload', '-r']);

/** A preload as a list, whether the bunfig gives one or many; none when it gives none. */
const listOf = (preload: typeof Preload.Type = []): ReadonlyArray<string> => {
  if (Predicate.isString(preload)) return [preload];
  return preload;
};

/** What a bunfig preloads: in every bun process (`all`), and in `bun test` alone (`test`); nothing when it does not parse. */
const bunfigPreloads = (text: string) =>
  Option.match(
    Option.flatMap(Option.liftThrowable(TOML.parse)(text), Schema.decodeUnknownOption(Bunfig)),
    {
      onNone: () => ({ all: [], test: [] }),
      onSome: ({ preload, test }) => ({ all: listOf(preload), test: listOf(test?.preload) }),
    },
  );

/** The values of the preload flags among `words`, `--preload x` and `--preload=x` alike. */
const flagValues = (words: ReadonlyArray<string>) =>
  words.flatMap((word, at) => {
    const [name = '', inline] = word.split(/=(.*)/s);
    if (!PRELOAD_FLAGS.has(name)) return [];
    if (Predicate.isString(inline)) return [inline];
    return Option.toArray(Option.fromUndefinedOr(words[at + 1]));
  });

/** Where bun's subcommand stands in a `bun` command: past its own flags, a preload flag's value with it. */
const subcommandAt = (words: ReadonlyArray<string>) => {
  let at = 1;
  while ((words[at] ?? '').startsWith('-')) {
    at += 1 + Number(PRELOAD_FLAGS.has(words[at] ?? ''));
  }
  return at;
};

/** A script's path with its leading `./` gone, as a wrapper is named. */
const bare = (path: string) => path.replace(/^(?:\.\/)+/, '');

/**
 * The modules a package script preloads, as written, from the workspace's
 * folder: in each `bun` command, its own preload flags (`--preload`, `-r`)
 * and its bunfig's `preload`; in a `bun test` or a wrapper of it, the
 * flags it is given after the subcommand and its bunfig's `[test]`
 * `preload` too; and those of each script it runs with `bun run`.
 */
const scriptPreloads = (
  workspace: Workspace,
  name: string,
  seen: ReadonlySet<string>,
): ReadonlyArray<string> => {
  if (seen.has(name)) return [];
  const within = new Set([...seen, name]);
  const bunfig = bunfigPreloads(workspace.bunfig);
  return commandsOf(workspace.scripts[name] ?? '').flatMap((words) => {
    if (words[0] !== 'bun') return [];
    const at = subcommandAt(words);
    const sub = words[at] ?? '';
    const own = [...bunfig.all, ...flagValues(words.slice(1, at))];
    if (sub === 'run' && Object.hasOwn(workspace.scripts, words[at + 1] ?? ''))
      return [...own, ...scriptPreloads(workspace, words[at + 1] ?? '', within)];
    if (sub === 'test' || workspace.wrappers.includes(bare(sub)))
      return [...own, ...bunfig.test, ...flagValues(words.slice(at + 1))];
    return own;
  });
};

/** The modules a task preloads, as written: those of each package script that runs inside it. */
const preloadsOf = (workspace: Workspace, task: string): ReadonlyArray<string> => [
  ...new Set(
    (workspace.runs.get(task) ?? []).flatMap((name) => scriptPreloads(workspace, name, new Set())),
  ),
];

/** A module of the repo a workspace preloads: its path from the root, the workspace's folder and the tasks there that preload it. */
interface PreloadModule {
  readonly file: string;
  readonly dir: string;
  readonly tasks: ReadonlyArray<string>;
}

/**
 * Each module of the repo a workspace's task preloads (`preloadsOf`), once
 * for each workspace that preloads it, with the tasks there that preload it
 * (a module two workspaces preload is held to each one's turbo config): bun loads it before
 * the task's tests, so what it reads the tests run with. A preload resolves
 * from the workspace's folder, as an import there does, a bare path
 * (`src/setup.ts`) as a relative one when it names no package; `unresolved`
 * holds each that names nothing.
 */
export const preloadModules = (
  workspaces: ReadonlyArray<Workspace>,
  resolve: (from: string, specifier: string) => Resolved,
) => {
  const modules = new Map<string, PreloadModule>();
  const keyOf = (dir: string, file: string) => `${dir}\n${file}`;
  const unresolved: Array<{
    readonly dir: string;
    readonly task: string;
    readonly specifier: string;
  }> = [];
  for (const workspace of workspaces)
    for (const task of workspace.runs.keys())
      for (const specifier of preloadsOf(workspace, task)) {
        const from = `${workspace.dir}/package.json`;
        let resolved = resolve(from, specifier);
        if (resolved._tag === 'Unresolved' && !/^[./]/.test(specifier))
          resolved = resolve(from, `./${specifier}`);
        if (resolved._tag === 'Unresolved')
          unresolved.push({ dir: workspace.dir, task, specifier });
        if (resolved._tag !== 'Module') continue;
        const key = keyOf(workspace.dir, resolved.file);
        const held = modules.get(key);
        modules.set(key, {
          file: resolved.file,
          dir: workspace.dir,
          tasks: [...new Set([...(held?.tasks ?? []), task])],
        });
      }
  return { modules: [...modules.values()], unresolved };
};
