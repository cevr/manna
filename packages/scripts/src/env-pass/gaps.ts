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
  readonly reads: ReadonlyArray<string>;
}

/** A variable a test reads that turbo does not hand the task that runs it. */
interface Gap {
  readonly dir: string;
  readonly task: string;
  readonly file: string;
  readonly name: string;
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
      return reads
        .filter((name) => !passes(declared, name))
        .map((name) => ({ dir, task, file, name }));
    }),
  );
