/**
 * The lab's drive, through `@manna/exact-kit/drive` (`bun lab/tools/drive.ts web|ios` from `packages/exact-kit`):
 * it asks every probe row through the agent and checks each outcome against `probe-table.json`, then relaunches
 * with the storage kept and checks the outcomes, which live in the view's state, are gone. One `PASS`/`FAIL` line
 * per check; exits 1 on any failure.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import table from '../probe-table.json';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-lab', host, appDir: join(import.meta.dir, '..') });
const store = `lab-${host}-${Date.now().toString(36)}`;
const rows = Object.entries(table);

const asked = await drive.launch(store, [
  'clock data',
  ...rows.flatMap(([key]) => [`tap ask-${key}`, 'clock settle']),
  'state outcomes',
]);
const outcomes = new Map(
  ((asked.at(-1) ?? []) as ReadonlyArray<{ key: string; text: string }>).map((o) => [
    o.key,
    o.text,
  ]),
);
for (const [key, text] of rows)
  drive.check(`row ${key}`, outcomes.get(key) === text, outcomes.get(key));

const relaunched = await drive.relaunch(store, ['clock data', 'state outcomes']);
drive.check('a relaunch starts with no outcomes', Bun.deepEquals(relaunched[1], []), relaunched[1]);

process.exit(drive.finish());
