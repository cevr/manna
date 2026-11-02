import { describe, expect, test } from 'bun:test';

import { type DryRun, unitTests } from './units.ts';

const task = (taskId: string, command: string, dependencies: ReadonlyArray<string> = []) => {
  const [workspace = '', name = ''] = taskId.split('#');
  return {
    taskId,
    task: name,
    package: workspace,
    directory: `packages/${workspace.replace('@manna/', '')}`,
    command,
    inputs: {},
    dependencies,
  };
};

describe("a workspace's unit-test tasks", () => {
  test("are the tasks of turbo's test with a command: a workspace's test, or each part of one cut into parts", () => {
    const dry: DryRun = {
      tasks: [
        task('@manna/ui#test', 'bun test src'),
        // A workspace cut into parts: its `test` has no script, and depends on each part.
        task('@manna/film#test', '<NONEXISTENT>', [
          '@manna/film#test:tools',
          '@manna/film#test:lab',
          '@manna/film#test:engine',
        ]),
        task('@manna/film#test:tools', 'bun test ./src/tools', ['@manna/core#transit']),
        task('@manna/film#test:lab', 'bun test ./src/lab'),
        task('@manna/film#test:engine', 'bun test src lint'),
        // A dependency's `transit` task has no script: it only carries its workspace's files.
        task('@manna/core#transit', '<NONEXISTENT>'),
        task('@manna/core#test', 'bun test'),
      ],
    };
    expect(unitTests(dry).map((unit) => `${unit.workspace} ${unit.task}: ${unit.command}`)).toEqual(
      [
        '@manna/core test: bun test',
        '@manna/film test:engine: bun test src lint',
        '@manna/film test:lab: bun test ./src/lab',
        '@manna/film test:tools: bun test ./src/tools',
        '@manna/ui test: bun test src',
      ],
    );
    expect(unitTests(dry)[1]).toEqual({
      workspace: '@manna/film',
      directory: 'packages/film',
      task: 'test:engine',
      taskId: '@manna/film#test:engine',
      command: 'bun test src lint',
    });
  });

  test('are not a task the test run reaches for another reason, though it has a command', () => {
    const dry: DryRun = {
      tasks: [
        // A `transit` and a `build` given scripts, a part no `test` depends on, and another workspace's part.
        task('@manna/core#transit', 'bun scripts/transit.ts'),
        task('@manna/core#build', 'tsc -b', []),
        task('@manna/core#test', 'bun test', ['@manna/core#build']),
        task('@manna/film#test', '<NONEXISTENT>', ['@manna/film#test:lab', '@manna/ui#test:dom']),
        task('@manna/film#test:lab', 'bun test ./src/lab'),
        task('@manna/film#test:stray', 'bun test ./src/stray'),
        task('@manna/ui#test:dom', 'bun test src/dom'),
      ],
    };
    expect(unitTests(dry).map((unit) => unit.taskId)).toEqual([
      '@manna/core#test',
      '@manna/film#test:lab',
    ]);
  });

  test('are none when no task has a command', () => {
    expect(unitTests({ tasks: [task('@manna/core#transit', '<NONEXISTENT>')] })).toEqual([]);
  });
});
