/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, node/no-process-env -- a host script `bun run exact` runs before Exact, under Bun, never in the data module: it links Exact's standard modules from the clone `EXACT` names. */

/**
 * Links Exact's standard modules the hymnal's data module imports
 * (`@exact/media-capture`, the tuner's microphone, `src/tuner/mic.ts`) into
 * this app's `node_modules` from the clone `EXACT` names (or the default),
 * as Heartseed's `tools/prepare.ts` does: they live in the Exact clone, not
 * on npm, and no machine path is committed. `bun run exact` runs it after
 * `src/hymns/make.ts`, before every Exact command.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { linkExactModules } from '@manna/exact-kit/prepare';

import { EXACT_MODULES } from './exact-modules.ts';

const app = join(import.meta.dir, '..');
const clone = process.env['EXACT'] ?? join(homedir(), 'Developer', 'vendor', 'exact');

const problems = linkExactModules(app, EXACT_MODULES, clone);
if (problems.length > 0) {
  process.stderr.write(`hymnal-exact: ${problems.join('\n')}\n`);
  process.exit(1);
}
