import { Option, Schema } from 'effect';

/** What this reads of a task in a `turbo.json`: the variables it hashes and the ones it only hands on. */
const TaskEnv = Schema.Struct({
  env: Schema.optionalKey(Schema.Array(Schema.String)),
  passThroughEnv: Schema.optionalKey(Schema.Array(Schema.String)),
});

/** What this reads of a `turbo.json`: the variables every task gets, and each task's own. */
export const TurboEnv = Schema.Struct({
  globalEnv: Schema.optionalKey(Schema.Array(Schema.String)),
  globalPassThroughEnv: Schema.optionalKey(Schema.Array(Schema.String)),
  tasks: Schema.optionalKey(Schema.Record(Schema.String, TaskEnv)),
});
export type TurboEnv = typeof TurboEnv.Type;

/**
 * The variables turbo 2.11 hands every task in its strict mode, whatever the
 * `turbo.json`s name, measured on 2.11.10 by a task that prints its
 * environment: `PATH`, `SHELL` and `SYSTEMROOT` (its docs), and the
 * others it passed. `TMPDIR`, `LC_ALL`, `LOGNAME` and `BUN_INSTALL` it did
 * not pass.
 */
const BUILTIN = new Set([
  'PATH',
  'SHELL',
  'SYSTEMROOT',
  'HOME',
  'USER',
  'PWD',
  'TZ',
  'LANG',
  'CI',
  'TERM',
  'TERM_PROGRAM',
  'COLORTERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'DISPLAY',
  'TMP',
  'TEMP',
  'XDG_DATA_DIRS',
  'PNPM_HOME',
]);

/** turbo's word, in a workspace's list, for the list the root's task gives. */
const EXTENDS = '$TURBO_EXTENDS$';

/**
 * The names and patterns turbo hands `task` in a workspace: the root's
 * `globalEnv` and `globalPassThroughEnv`, and the task's `env` and
 * `passThroughEnv`, each the workspace's list when its `turbo.json` sets
 * one (the root's beside it when it holds `$TURBO_EXTENDS$`), else the
 * root's.
 */
export const declaredFor = (
  root: TurboEnv,
  workspace: Option.Option<TurboEnv>,
  task: string,
): ReadonlyArray<string> => {
  const inherited = Option.fromUndefinedOr(root.tasks?.[task]);
  const own = Option.flatMap(workspace, (turbo) => Option.fromUndefinedOr(turbo.tasks?.[task]));
  const field = (key: 'env' | 'passThroughEnv') => {
    const base = Option.match(inherited, { onNone: () => [], onSome: (def) => def[key] ?? [] });
    return Option.match(
      Option.flatMap(own, (def) => Option.fromUndefinedOr(def[key])),
      {
        onNone: () => base,
        onSome: (list) => {
          if (!list.includes(EXTENDS)) return list;
          return [...base, ...list.filter((name) => name !== EXTENDS)];
        },
      },
    );
  };
  return [
    ...(root.globalEnv ?? []),
    ...(root.globalPassThroughEnv ?? []),
    ...field('env'),
    ...field('passThroughEnv'),
  ];
};

/** A turbo pattern as a test of a name: `*` stands for any run of characters. */
const matcherOf = (pattern: string) =>
  new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );

/**
 * Whether turbo hands `name` to a task that declares `declared`: it is one
 * turbo hands every task (`BUILTIN`), or a pattern names it and no `!`
 * pattern takes it back.
 */
export const passes = (declared: ReadonlyArray<string>, name: string) => {
  if (BUILTIN.has(name)) return true;
  const negated = declared.filter((pattern) => pattern.startsWith('!'));
  const named = declared.filter((pattern) => !pattern.startsWith('!'));
  return (
    named.some((pattern) => matcherOf(pattern).test(name)) &&
    !negated.some((pattern) => matcherOf(pattern.slice(1)).test(name))
  );
};
