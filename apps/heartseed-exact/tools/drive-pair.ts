/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewPromise, effect/noTernary, node/no-process-env -- a host script that starts two web drives at once, each in a process group of its own, and prints how each ended. */

/**
 * Two web drives at once from this checkout (`bun tools/drive-pair.ts`):
 * `drive-home` and `drive-motion`, started together as two workspaces'
 * drives would be. Each claims its own port of the app's spare range and
 * holds it across its relaunches (`@manna/exact-kit/port`), so neither
 * lands on the other's port and `drive-home`'s relaunch finds the store
 * its first launch left. Prints each drive's last lines; exits 1 unless
 * both pass.
 */

import { join } from 'node:path';

const app = join(import.meta.dir, '..');
const DRIVES = ['drive-home', 'drive-motion'] as const;

const ran = await Promise.all(
  DRIVES.map(async (name) => {
    const child = Bun.spawn(['bun', join(import.meta.dir, `${name}.ts`), 'web'], {
      cwd: app,
      env: { ...process.env },
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { name, code, out, err };
  }),
);

for (const { name, code, out, err } of ran) {
  const lines = out.trim().split('\n');
  console.log(`== ${name} web exited ${code}`);
  console.log(lines.filter((line) => line.startsWith('FAIL')).join('\n'));
  console.log(lines.at(-1));
  if (code !== 0) console.log(err.slice(-1500));
}
const failed = ran.filter(({ code }) => code !== 0).length;
console.log(`${failed === 0 ? 'ok' : 'FAILED'}: drive-pair web, ${failed} of ${ran.length} failed`);
process.exit(failed === 0 ? 0 : 1);
