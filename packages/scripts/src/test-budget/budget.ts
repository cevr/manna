import { Option } from 'effect';

/** The budget, in milliseconds, for each unit-test task. */
const BUDGET_MS = 1_000;

/** A workspace's own budget for each of its unit-test tasks, in milliseconds, where it is not `BUDGET_MS`. */
const OWN_BUDGET_MS = new Map([['@manna/film', 1_100]]);

const budgetOf = (workspace: string): number => OWN_BUDGET_MS.get(workspace) ?? BUDGET_MS;

/** One unit-test task, run alone: its workspace, its id (`<ws>#<task>`), its time (none when its own summary did not read) and its exit code. */
interface Task {
  readonly workspace: string;
  readonly taskId: string;
  readonly ms: Option.Option<number>;
  readonly exitCode: number;
}

/** A task that has a time. */
interface Timed {
  readonly workspace: string;
  readonly taskId: string;
  readonly ms: number;
  readonly exitCode: number;
}

/** The tasks as they were timed, one after another, with the load averages before the first and the core count. */
interface Run {
  readonly tasks: ReadonlyArray<Task>;
  readonly load: Load;
  readonly cores: number;
}

/** The 1- and 5-minute load averages. */
interface Load {
  readonly one: number;
  readonly five: number;
}

/** What the budget says of a run: the report to print, what to print as the failure, and the exit code. */
interface Judged {
  readonly report: ReadonlyArray<string>;
  readonly failure: ReadonlyArray<string>;
  readonly code: 0 | 1;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

const averages = (load: Load) =>
  `${load.one.toFixed(1)} over 1 min and ${load.five.toFixed(1)} over 5 min`;

/** Whether the machine was at or below its cores by both averages before the run. */
const quiet = (run: Run) => run.load.one <= run.cores && run.load.five <= run.cores;

/** The budget's verdict on `run`. */
export const judge = (run: Run): Judged => {
  const timed = run.tasks
    .flatMap((task): ReadonlyArray<Timed> =>
      Option.match(task.ms, {
        onNone: () => [],
        onSome: (ms) => [{ ...task, ms }],
      }),
    )
    .toSorted((a, b) => b.ms - a.ms);
  const untimed = run.tasks
    .filter((task) => Option.isNone(task.ms))
    .toSorted((a, b) => a.taskId.localeCompare(b.taskId));
  const measured = quiet(run);
  const passed = timed.filter((task) => task.exitCode === 0);
  const over = passed.filter((task) => measured && task.ms >= budgetOf(task.workspace));
  const report = [
    '',
    `test:budget: each unit-test task alone, under ${seconds(BUDGET_MS)}${ownBudgets()} (load average ${averages(run.load)} before them, on ${run.cores} cores)`,
    ...timed.map((task) => `  ${seconds(task.ms).padStart(7)}  ${task.taskId}`),
    ...untimed.map(
      (task) => `  no time  ${task.taskId}: exit ${task.exitCode}, its own summary did not read`,
    ),
    ...notMeasured(run),
  ];
  const failure = [
    ...testsFailed(run.tasks.filter((task) => task.exitCode !== 0)),
    ...noTime(untimed),
    ...overBudget(over),
  ];
  if (failure.length > 0) return { report, failure, code: 1 };
  return { report, failure, code: 0 };
};

const ownBudgets = () =>
  [...OWN_BUDGET_MS].map(([name, ms]) => `, ${name}'s under ${seconds(ms)}`).join('');

const notMeasured = (run: Run): ReadonlyArray<string> => {
  if (quiet(run)) return [];
  return [`test:budget: not measured (load average ${averages(run.load)}, on ${run.cores} cores)`];
};

const testsFailed = (tasks: ReadonlyArray<Task>): ReadonlyArray<string> => {
  if (tasks.length === 0) return [];
  const each = tasks.map((task) => `${task.taskId} (exit ${task.exitCode})`);
  return [`test:budget: tests failed: ${each.join(', ')}.`];
};

const noTime = (tasks: ReadonlyArray<Task>): ReadonlyArray<string> => {
  if (tasks.length === 0) return [];
  const each = tasks.map((task) => task.taskId);
  return [`test:budget: no time measured: ${each.join(', ')}; its own summary did not read.`];
};

const overBudget = (tasks: ReadonlyArray<Timed>): ReadonlyArray<string> => {
  if (tasks.length === 0) return [];
  const each = tasks.map((task) => `${task.taskId} ${seconds(task.ms)}`);
  return [
    `test:budget: over budget: ${each.join(', ')}.`,
    'A test that waits on real time, a setup each test repeats, or one long file a worker runs alone is the usual cause.',
    'Measure a workspace again, alone, with `bun run test:budget <workspace>`.',
  ];
};
