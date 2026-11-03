import { Option } from 'effect';

interface DryTask {
  readonly taskId: string;
  readonly directory: string;
  readonly inputs: Readonly<Record<string, string>>;
  readonly dependencies: ReadonlyArray<string>;
}

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

const joined = (directory: string, file: string) => {
  const parts: Array<string> = [];
  for (const part of `${directory}/${file}`.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '' && part !== '.') parts.push(part);
  }
  return parts.join('/');
};

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
