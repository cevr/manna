/* oxlint-disable effect/noNodeBuiltinImport -- Exact's app folder cannot import effect (docs/exact.md): a host helper the look's tests read the app's files through. */

/**
 * The files the look's tests read: the brand (`app.forma`) and every
 * Contract file a screen is drawn from (`app.contract`, `features/*.contract`),
 * each by its path from the app's folder.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = join(import.meta.dir, '..');

/** The brand file's text. */
export const readBrand = (): string => readFileSync(join(app, 'app.forma'), 'utf8');

/** Each Contract file a screen is drawn from, by its path from the app's folder, and its text. */
export const readContracts = (): ReadonlyMap<string, string> =>
  new Map(
    [
      'app.contract',
      ...readdirSync(join(app, 'features'))
        .filter((name) => name.endsWith('.contract'))
        .map((name) => join('features', name)),
    ].map((path) => [path, readFileSync(join(app, path), 'utf8')]),
  );
