import { Option } from 'effect';
import { type TurboEnv, declaredFor, passes } from './turbo.ts';

/** A test file of a workspace: the tasks turbo runs it in, and the variables it reads. */
interface ReadingTest {
  /** Its path from the repo's root. */
  readonly file: string;
  /** Its workspace's folder from the root. */
  readonly dir: string;
  /** The tasks of its workspace whose run takes it (`test`, a part, `test:slow`). */
  readonly tasks: ReadonlyArray<string>;
  /** Each variable it reads, by itself or a module it imports, with the module that reads it. */
  readonly reads: ReadonlyMap<string, string>;
}

/** A variable a test reads that turbo does not hand the task that runs it. */
export interface Gap {
  readonly dir: string;
  readonly task: string;
  readonly file: string;
  readonly name: string;
  /** The module that reads it: the test, or one it imports. */
  readonly by: string;
}

/**
 * Each variable a test reads that turbo, in its strict mode, does not hand
 * a task that runs the test (`passes`), by the root's `turbo.json` and the
 * workspace's (`turbos`, by its folder): unset there, the test reads its
 * default however the caller set it.
 */
export const gapsOf = (
  root: TurboEnv,
  turbos: ReadonlyMap<string, TurboEnv>,
  tests: ReadonlyArray<ReadingTest>,
): ReadonlyArray<Gap> =>
  tests.flatMap(({ file, dir, tasks, reads }) =>
    tasks.flatMap((task) => {
      const declared = declaredFor(root, Option.fromUndefinedOr(turbos.get(dir)), task);
      return [...reads]
        .filter(([name]) => !passes(declared, name))
        .map(([name, by]) => ({ dir, task, file, name, by }));
    }),
  );

/** A gap known and left to its owner: a workspace's task and the variable. */
export interface Reported {
  readonly dir: string;
  readonly task: string;
  readonly name: string;
}

/**
 * The gaps split by `known`: those it does not name (`open`), those it
 * names (`reported`), and each entry of it that names no gap (`stale`).
 */
export const splitReported = (gaps: ReadonlyArray<Gap>, known: ReadonlyArray<Reported>) => {
  const names = (gap: Reported) => (entry: Reported) =>
    entry.dir === gap.dir && entry.task === gap.task && entry.name === gap.name;
  return {
    open: gaps.filter((gap) => !known.some(names(gap))),
    reported: gaps.filter((gap) => known.some(names(gap))),
    stale: known.filter((entry) => !gaps.some(names(entry))),
  };
};
