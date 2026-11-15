/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, node/no-process-env -- Exact's app folder cannot import effect (docs/exact.md): a host script `bun run exact` runs before Exact; it links Exact's standard modules from the clone `EXACT` names and writes the passage, synchronously, before any build reads them. */

/**
 * Readies the app folder for an Exact command, every time `bun run exact`
 * runs. Exact's standard modules (`@exact/speech-synthesis`,
 * `@exact/speech-recognition` and the `@exact/media-capture` it uses) live
 * in the Exact clone, not on npm, so each is linked into this app's
 * `node_modules` from the clone `EXACT` names (or the default), and no
 * machine path is committed. Then Today's passage is written
 * (`tools/passage.ts`), and the chapters the garden reads (`tools/chapters.ts`).
 */

import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { writeChapters } from './chapters';
import { writePassage } from './passage';

/** Exact's standard modules the app's Contract uses. */
const MODULES = ['speech-synthesis', 'speech-recognition', 'media-capture'];

const app = join(import.meta.dir, '..');
const clone = process.env['EXACT'] ?? join(homedir(), 'Developer', 'vendor', 'exact');

/** Links `@exact/<name>` to the clone's package; a problem's text, or '' when linked. */
const link = (name: string) => {
  const target = join(clone, 'packages', name);
  const at = join(app, 'node_modules', '@exact', name);
  if (!existsSync(target)) return `no ${target}: clone Exact (docs/exact.md)`;
  mkdirSync(join(app, 'node_modules', '@exact'), { recursive: true });
  const present = lstatSync(at, { throwIfNoEntry: false });
  if (present?.isSymbolicLink() && readlinkSync(at) === target) return '';
  if (present !== undefined) unlinkSync(at);
  symlinkSync(target, at, 'dir');
  return '';
};

const problems = MODULES.map(link).filter((problem) => problem !== '');
if (problems.length > 0) {
  process.stderr.write(`heartseed-exact: ${problems.join('\n')}\n`);
  process.exit(1);
}

writePassage();
writeChapters();
