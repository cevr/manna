import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { judge } from './budget.js';

const quiet = { one: 3.2, five: 2.8 };
const busy = { one: 14.6, five: 9.1 };
const cores = 12;

type Task = Parameters<typeof judge>[0]['tasks'][number];

const task = (workspace: string, ms: number, exitCode = 0, name = 'test'): Task => ({
  workspace,
  taskId: `${workspace}#${name}`,
  ms: Option.some(ms),
  exitCode,
});

const untimed = (workspace: string, exitCode: number): Task => ({
  ...task(workspace, 0, exitCode),
  ms: Option.none(),
});

describe("the tests' time budget, each unit-test task alone", () => {
  test('tasks each under budget pass, printing each time with the load and the cores', () => {
    const judged = judge({
      tasks: [task('@manna/core', 420), task('@manna/film', 610, 0, 'test:lab')],
      load: quiet,
      cores,
    });
    expect(judged.code).toBe(0);
    expect(judged.failure).toEqual([]);
    expect(judged.report).toEqual([
      '',
      "test:budget: each unit-test task alone, under 1.00 s, @manna/film's under 1.10 s (load average 3.2 over 1 min and 2.8 over 5 min before them, on 12 cores)",
      '   0.61 s  @manna/film#test:lab',
      '   0.42 s  @manna/core#test',
    ]);
  });

  test('one task over budget on a machine at or below its cores fails, naming it alone', () => {
    for (const load of [quiet, { one: cores, five: cores }]) {
      const judged = judge({
        tasks: [task('@manna/film', 420, 0, 'test:engine'), task('@manna/core', 1_230)],
        load,
        cores,
      });
      expect(judged.code).toBe(1);
      expect(judged.failure[0]).toBe('test:budget: over budget: @manna/core#test 1.23 s.');
    }
  });

  test('a task at exactly 1,000 ms is over budget: the budget is under 1 s', () => {
    const judged = judge({
      tasks: [task('@manna/cli', 999), task('@manna/core', 1_000)],
      load: quiet,
      cores,
    });
    expect(judged.code).toBe(1);
    expect(judged.failure[0]).toBe('test:budget: over budget: @manna/core#test 1.00 s.');
  });

  test("each of the film workspace's parts has 1.1 s alone: 1,099 ms passes and 1,100 ms is over", () => {
    const under = judge({
      tasks: [
        task('@manna/film', 1_099, 0, 'test:lab'),
        task('@manna/film', 1_099, 0, 'test:tools'),
      ],
      load: quiet,
      cores,
    });
    expect(under.code).toBe(0);
    const over = judge({
      tasks: [
        task('@manna/film', 1_050, 0, 'test:lab'),
        task('@manna/film', 1_100, 0, 'test:tools'),
      ],
      load: quiet,
      cores,
    });
    expect(over.code).toBe(1);
    expect(over.failure[0]).toBe('test:budget: over budget: @manna/film#test:tools 1.10 s.');
  });

  test("a part is held to its workspace's budget, not another's: 1,050 ms passes in film and fails in core", () => {
    const judged = judge({
      tasks: [task('@manna/film', 1_050, 0, 'test:engine'), task('@manna/core', 1_050)],
      load: quiet,
      cores,
    });
    expect(judged.code).toBe(1);
    expect(judged.failure[0]).toBe('test:budget: over budget: @manna/core#test 1.05 s.');
  });

  test('tasks whose times sum past the budget, each under it, pass: the run states no total', () => {
    const judged = judge({
      tasks: [
        task('@manna/core', 600),
        task('@manna/film', 940, 0, 'test:lab'),
        task('@manna/film', 990, 0, 'test:tools'),
        task('@manna/scripts', 880),
      ],
      load: quiet,
      cores,
    });
    expect(judged.code).toBe(0);
    expect(judged.failure).toEqual([]);
    expect(judged.report.filter((line) => /total|bun run test|3\.41|1\.93/.test(line))).toEqual([]);
  });

  test('a machine busier than its cores measures nothing: the run says so and passes, over budget or not', () => {
    for (const ms of [420, 1_400]) {
      const judged = judge({
        tasks: [task('@manna/film', ms, 0, 'test:lab')],
        load: busy,
        cores,
      });
      expect(judged.code).toBe(0);
      expect(judged.failure).toEqual([]);
      expect(judged.report.at(-1)).toBe(
        'test:budget: not measured (load average 14.6 over 1 min and 9.1 over 5 min, on 12 cores)',
      );
    }
  });

  test('a lull in a busy period measures nothing: the 5-minute average above the cores holds the run', () => {
    const judged = judge({
      tasks: [task('@manna/film', 1_130, 0, 'test:lab')],
      load: { one: 4.9, five: 19.1 },
      cores,
    });
    expect(judged.code).toBe(0);
    expect(judged.failure).toEqual([]);
    expect(judged.report.at(-1)).toBe(
      'test:budget: not measured (load average 4.9 over 1 min and 19.1 over 5 min, on 12 cores)',
    );
  });

  test('a task whose tests fail fails the run at any load, named with its exit code', () => {
    for (const load of [quiet, busy]) {
      const judged = judge({
        tasks: [task('@manna/core', 420), task('@manna/film', 240, 1, 'test:tools')],
        load,
        cores,
      });
      expect(judged.code).toBe(1);
      expect(judged.failure).toEqual([
        'test:budget: tests failed: @manna/film#test:tools (exit 1).',
      ]);
    }
  });

  test('a task with no time fails the run at any load, its line naming its exit code and no time', () => {
    for (const load of [quiet, busy]) {
      for (const exitCode of [0, 1]) {
        const judged = judge({
          tasks: [task('@manna/core', 420), untimed('@manna/cli', exitCode)],
          load,
          cores,
        });
        expect(judged.code).toBe(1);
        expect(judged.report.slice(2, 4)).toEqual([
          '   0.42 s  @manna/core#test',
          `  no time  @manna/cli#test: exit ${exitCode}, its own summary did not read`,
        ]);
        expect(judged.failure.at(-1)).toBe(
          'test:budget: no time measured: @manna/cli#test; its own summary did not read.',
        );
        expect(judged.report.join('\n')).not.toMatch(/\d\.\d s {2}@manna\/cli/);
      }
    }
  });
});
