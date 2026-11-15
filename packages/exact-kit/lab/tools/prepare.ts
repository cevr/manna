/**
 * Readies the lab for an Exact command, as an app's `tools/prepare.ts` does, through `@manna/exact-kit/prepare`:
 * it links the Exact modules the lab uses (none: it draws buttons and text alone) from the clone `EXACT` names,
 * and writes its contract test from `probe-table.json`, only when the table changed it.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { linkExactModules, writeGenerated } from '@manna/exact-kit/prepare';

import table from '../probe-table.json';
import { contractTest } from './contract.ts';

/** Exact's standard modules the lab's Contract uses. */
const MODULES: ReadonlyArray<string> = [];

const lab = join(import.meta.dir, '..');
const clone = process.env['EXACT'] ?? join(homedir(), 'Developer', 'vendor', 'exact');

const problems = linkExactModules(lab, MODULES, clone);
if (problems.length > 0) {
  process.stderr.write(`exact-lab: ${problems.join('\n')}\n`);
  process.exit(1);
}
writeGenerated(join(lab, 'app.test.contract'), contractTest(table));
