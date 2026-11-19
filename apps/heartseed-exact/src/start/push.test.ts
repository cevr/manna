/* oxlint-disable effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noGlobals -- a Bun test reading a tracked Contract file, as src/read/read.test.ts does. */

/**
 * The launch's opening moves once and only from the Garden tab's root:
 * `startPushOf` over each case (a launch at home or at a deep link, the
 * first decision or a later one, an opening with no route), and
 * `startOpen` in `features/start.contract` held to it word for word, so a
 * change to the action's guard fails here until the rule says the same.
 */

import { expect, it } from 'bun:test';
import { join } from 'node:path';

import { startPushOf } from './opening';

const TODAY = '/today';

it.each([
  ['a first launch at home pushes Today', false, TODAY, 'garden', 'garden', TODAY],
  ['a first launch at a deep link keeps it', false, TODAY, 'garden', 'list', ''],
  ['a first launch on the Read tab keeps it', false, TODAY, 'read', 'read', ''],
  ['a later navigation back at home pushes nothing', true, TODAY, 'garden', 'garden', ''],
  ['a later navigation at a deep link pushes nothing', true, TODAY, 'garden', 'list', ''],
  ['an opening with no route (home) pushes nothing', false, '', 'garden', 'garden', ''],
] as const)('%s', (_name, decided, route, tab, top, pushed) => {
  expect(startPushOf(decided, route, tab, top)).toBe(pushed);
});

it("holds startOpen's guard to startPushOf", async () => {
  const contract = await Bun.file(join(import.meta.dir, '../../features/start.contract')).text();
  expect(contract).toContain(
    [
      '  action startOpen',
      '    if not startDecided',
      '      startDecided = true',
      '      if startShown.route != "" and nav.tab == "garden" and top(nav).name == "garden"',
      '        nav = push(nav, startShown.route)',
    ].join('\n'),
  );
});
