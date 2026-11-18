/* oxlint-disable effect/noNodeBuiltinImport -- Exact's app folder cannot import effect (docs/exact.md): a host script that writes the home's pictures before Exact reads them. */

/**
 * Writes the current Heartseed's own home pictures (its `assets/home/*.png`,
 * one per name and scheme, as `bun run home-icons` draws them there) into
 * this app's `assets/home/` (ignored, never committed), where home and a
 * list's page name them (`features/home.contract`, `homeIconOf`). Exact's
 * bake takes no linked folder, so each picture is written, and only when
 * its bytes changed, so a build after a test has nothing new to stage. Run
 * before every `bun run exact` (`tools/prepare.ts`).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The current app's pictures. */
export const HOME_ICONS_FROM = join(import.meta.dir, '..', '..', 'heartseed', 'assets', 'home');

/** Where the port's pictures are written. */
export const HOME_ICONS_TO = join(import.meta.dir, '..', 'assets', 'home');

/** Writes each picture whose bytes differ; the names written. */
export const writeHomeIcons = (from = HOME_ICONS_FROM, to = HOME_ICONS_TO) => {
  mkdirSync(to, { recursive: true });
  return readdirSync(from)
    .filter((name) => name.endsWith('.png'))
    .filter((name) => {
      const bytes = readFileSync(join(from, name));
      const at = join(to, name);
      if (existsSync(at) && readFileSync(at).equals(bytes)) return false;
      writeFileSync(at, bytes);
      return true;
    });
};
