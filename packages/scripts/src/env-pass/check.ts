import { type Gap, type ReadingTest, type Reported, gapsOf, splitReported } from './gaps.ts';
import { type Module, type Resolved, loadedBy, productOf, readsThrough } from './graph.ts';
import { type Workspace, preloadModules } from './preload.ts';
import type { TurboEnv } from './turbo.ts';

/** What the pass-through check reads of the repo. */
interface Repo<T extends { readonly file: string }> {
  readonly graph: ReadonlyMap<string, Module>;
  /** The repo's test files, each with what the caller's `reach` reads of it. */
  readonly tests: ReadonlyArray<T>;
  /** Whether a module is the tests' own by itself (a test, a rig under a test folder). */
  readonly ofTests: (file: string) => boolean;
  readonly workspaces: ReadonlyArray<Workspace>;
  readonly resolve: (from: string, specifier: string) => Resolved;
  /** The tasks that run each test that reads a variable, by the workspaces' scripts. */
  readonly reach: (
    reading: ReadonlyArray<T & { readonly reads: ReadonlyMap<string, string> }>,
  ) => ReadonlyArray<ReadingTest>;
  readonly root: TurboEnv;
  readonly turbos: ReadonlyMap<string, TurboEnv>;
  readonly reported: ReadonlyArray<Reported>;
}

/**
 * The pass-through check over a repo: each test and each module a task
 * preloads is an entry of the tasks that run it, a preload being the tests'
 * own (never a root of the product), and each variable an entry reads that
 * turbo does not hand such a task is a gap (`open`, or `reported` when
 * `reported` names it; `stale` each entry of that list that names no gap).
 * `testSide` holds the modules the tests and preloads load that the product
 * does not run, whose unresolved imports the caller reports, and
 * `unresolvedPreloads` each preload that names nothing.
 */
export const passCheck = <T extends { readonly file: string }>(repo: Repo<T>) => {
  const preloads = preloadModules(repo.workspaces, repo.resolve);
  const preloaded = new Set(preloads.modules.map(({ file }) => file));
  const product = productOf(repo.graph, (file) => repo.ofTests(file) || preloaded.has(file));
  const reached = repo.reach(
    repo.tests
      .map((test) => ({ ...test, reads: readsThrough(test.file, repo.graph, product) }))
      .filter(({ reads }) => reads.size > 0),
  );
  const preloading = preloads.modules
    .map((module) => ({ ...module, reads: readsThrough(module.file, repo.graph, product) }))
    .filter(({ reads }) => reads.size > 0);
  const testSide = new Set(
    [...repo.tests.map(({ file }) => file), ...preloaded]
      .flatMap((file) => loadedBy(file, repo.graph))
      .filter((file) => !product.has(file)),
  );
  return {
    ...splitReported(gapsOf(repo.root, repo.turbos, [...reached, ...preloading]), repo.reported),
    reached,
    preloading,
    testSide,
    unresolvedPreloads: preloads.unresolved,
  };
};

/** Whether the check fails: an open gap, a stale entry, or an import or a preload it cannot follow. */
export const failed = (
  check: {
    readonly open: ReadonlyArray<Gap>;
    readonly stale: ReadonlyArray<Reported>;
    readonly unresolvedPreloads: ReadonlyArray<unknown>;
  },
  unresolvedImports: number,
) =>
  check.open.length + check.stale.length + check.unresolvedPreloads.length + unresolvedImports > 0;
