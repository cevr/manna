import { describe, expect, test } from 'bun:test';

import { unitTests } from './units.ts';

/** Turbo's dry run as `unitTests` reads it. */
type DryRun = Parameters<typeof unitTests>[0];

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
        task('@manna/film#test', '<NONEXISTENT>', [
          '@manna/film#test:tools',
          '@manna/film#test:lab',
          '@manna/film#test:engine',
        ]),
        task('@manna/film#test:tools', 'bun test ./src/tools', ['@manna/core#transit']),
        task('@manna/film#test:lab', 'bun test ./src/lab'),
        task('@manna/film#test:engine', 'bun test src lint'),
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

  test('are a test with a command and each part it depends on, both run by the gate', () => {
    const dry: DryRun = {
      tasks: [
        task(
          '@manna/heartseed-exact#test',
          'bun test --path-ignore-patterns=src/app.test.ts ./src',
          [
            '@manna/core#transit',
            '@manna/heartseed-exact#test:app',
            '@manna/heartseed-exact#test:find',
          ],
        ),
        task('@manna/heartseed-exact#test:app', 'bun test ./src/app.test.ts'),
        task('@manna/heartseed-exact#test:find', 'bun test ./src/find'),
        task('@manna/heartseed-exact#test:slow', 'quint typecheck src/garden/writes.qnt'),
        task('@manna/core#transit', '<NONEXISTENT>'),
      ],
    };
    expect(unitTests(dry).map((unit) => unit.taskId)).toEqual([
      '@manna/heartseed-exact#test',
      '@manna/heartseed-exact#test:app',
      '@manna/heartseed-exact#test:find',
    ]);
  });

  test('are not a task the test run reaches for another reason, though it has a command', () => {
    const dry: DryRun = {
      tasks: [
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
