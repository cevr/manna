import { Option } from 'effect';

/** What this reads of one task of turbo's dry run (`--dry=json`). */
interface DryTask {
  readonly taskId: string;
  readonly directory: string;
  /** The files the task hashes, from its workspace's folder. */
  readonly inputs: Readonly<Record<string, string>>;
  readonly dependencies: ReadonlyArray<string>;
}

/**
 * The files `taskId` is hashed on, from the root: its own inputs and the inputs
 * of each task it depends on, transitively (a `test` hashes its dependencies'
 * `transit` tasks, which hash their workspaces' files).
 */
export const hashedBy = (tasks: ReadonlyArray<DryTask>, taskId: string): ReadonlySet<string> => {
  const byId = new Map(tasks.map((task) => [task.taskId, task]));
  const hashed = new Set<string>();
  const seen = new Set<string>();
  const pending = [taskId];
  while (pending.length > 0) {
    const id = pending.pop() ?? '';
    const task = Option.fromUndefinedOr(byId.get(id)).pipe(Option.filter(() => !seen.has(id)));
    seen.add(id);
    Option.map(task, ({ directory, inputs, dependencies }) => {
      Object.keys(inputs).forEach((input) => hashed.add(joined(directory, input)));
      pending.push(...dependencies);
    });
  }
  return hashed;
};

/** `file` (from `directory`, `../` included, as turbo names a root input) from the root. */
const joined = (directory: string, file: string) => {
  const parts: Array<string> = [];
  for (const part of `${directory}/${file}`.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '' && part !== '.') parts.push(part);
  }
  return parts.join('/');
};

/** The mark `preload.ts` puts before a path the run created: a write to a path that did not exist. */
export const CREATED = '+';

/**
 * A task's log (`preload.ts`'s lines) read: the paths its tests read, less
 * each path it created or `before` holds (the paths the tasks run before it
 * created), and the paths created by it or before it. A file that did not
 * exist when turbo hashed the run holds only what the run wrote into it, so it
 * is no input of the task; once it exists, turbo hashes it where an input
 * names it.
 */
export const readLog = (log: string, before: ReadonlySet<string>) => {
  const lines = log.split('\n').filter((line) => line !== '');
  const created = new Set([
    ...before,
    ...lines.filter((line) => line.startsWith(CREATED)).map((line) => line.slice(CREATED.length)),
  ]);
  return {
    reads: lines.filter((line) => !line.startsWith(CREATED) && !created.has(line)),
    created,
  };
};

/**
 * The paths among `reads` (absolute) that lie under `root`, outside any
 * `node_modules` and `.git`, that `hashed` does not hold: from the root,
 * sorted, each once. Whether each is a file that still exists is the caller's
 * to ask: a test's own scratch file, gone after the run, is no input.
 */
export const unhashed = (
  root: string,
  reads: ReadonlyArray<string>,
  hashed: ReadonlySet<string>,
): ReadonlyArray<string> =>
  [
    ...new Set(
      reads
        .filter((read) => read.startsWith(`${root}/`))
        .map((read) => read.slice(root.length + 1))
        .filter((file) => {
          const parts = file.split('/');
          return !parts.includes('node_modules') && parts[0] !== '.git' && !hashed.has(file);
        }),
    ),
  ].toSorted();
