/* oxlint-disable effect/noNodeBuiltinImport -- a build-time host script, imported by src/hymns/make.ts before each Exact command: it writes the Feel's WAVs the iOS app ships; it runs under Bun, never in the data module. */

/**
 * Writes the Feel's sounds (`src/feel/sounds.ts`: the current hymnal's
 * voice, rendered by its own `voiced`) under `feel/`, which the iOS app
 * ships at `Resources/feel` (`app.json`) for `modules/apple/Feel.swift`
 * to play, as the meaning table's files are written
 * (`src/results/meaning-files.ts`): at each `bun run exact`, a file only
 * when its bytes change, none committed. The web ships none: it has no
 * voice, as the current hymnal's web has none.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { soundFiles } from '../src/feel/sounds.ts';

/** Writes each sound under `app`, a file only when its bytes differ; answers the paths it wrote. */
export const writeSounds = (app: string): ReadonlyArray<string> =>
  soundFiles().flatMap(({ path, bytes }) => {
    const file = join(app, path);
    if (existsSync(file) && Buffer.from(readFileSync(file)).equals(Buffer.from(bytes))) return [];
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    return [path];
  });

writeSounds(join(import.meta.dir, '..'));
