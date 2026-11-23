/**
 * What `run.ts` starts once a command passed its rules: the clone's own app CLI, as the `exact.mjs`
 * that `exact new` writes runs it, for the app in `argv[2]` named `argv[3]`, with the clone `EXACT`
 * names. Never run by hand: `bun run exact <verb>` in the app reaches it through the wrapper. On an iOS run, once it
 * holds the build lock, it first clears the stale launch consoles of the app's simulator (`sim-tmp.ts`).
 */
import { join } from 'node:path';

import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect } from 'effect';

import { CLEAR_BEFORE, clearSimulatorConsoles } from './sim-tmp.ts';

const [appDir = '', name = '', ...args] = process.argv.slice(2);
const exact2 = process.env['EXACT'] ?? '';
if (exact2 === '' || appDir === '') {
  console.error('exact-cli: run it through `bun run exact` in the app');
  process.exit(2);
}
const pinnedBun: string = (
  await Bun.file(join(exact2, 'package.json')).json()
).packageManager.replace('bun@', '');
const { ensureBun } = await import(join(exact2, 'scripts/bun.mjs'));
ensureBun(pinnedBun);
const clearBefore = Number(process.env[CLEAR_BEFORE] ?? '');
const simulator = process.env['EXACT_SIM'] ?? '';
if (Number.isFinite(clearBefore) && clearBefore > 0 && simulator !== '')
  await Effect.runPromise(
    clearSimulatorConsoles(simulator, clearBefore).pipe(Effect.provide(BunServices.layer)),
  );
const { run } = await import(join(exact2, 'scripts/app-cli.mjs'));
process.exit(await run({ dir: appDir, name, exact2, args }));
