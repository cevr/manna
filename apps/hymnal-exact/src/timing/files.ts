/* oxlint-disable effect/noGlobals -- a web file is a module whose default is a string, written as JSON writes it; the data module imports no effect (docs/exact.md). */

/**
 * A timing string with each line's words left out: `head|flags,start,length;…`.
 *
 * The hymns' timing ships in the current app's encoding
 * (`apps/hymnal/vite/timing.ts`, decoded by its `timelineOf`): every line's
 * flags, start and length bundled in the data module (`linesOnly`, which the
 * player reads at Play), and each hymn's whole string, its words' syllable
 * times kept, as a file of its own read the first time its page is shown
 * (`load.ts`): `timing/<n>` the iOS app ships under `Resources/timing`
 * (`app.json` `host.ios.resources`), and `modules/web/timing/<n>.js` the
 * web build ships beside the page module, which reads it by import
 * (`modules/web/index.js`, `timing.read`). `tools/timing.ts` writes them.
 */
export const linesOnly = (encoded: string): string => {
  const bar = encoded.indexOf('|');
  const lines = encoded
    .slice(bar + 1)
    .split(';')
    .map((line) => line.split(',').slice(0, 3).join(','));
  return `${encoded.slice(0, bar)}|${lines.join(';')}`;
};

/** Where the iOS app ships the files: `app.json` puts the folder `timing/` at `Resources/timing`. */
export const TIMING_ROOT = 'bundle:/Resources/timing';

/** The iOS app's file of hymn `number`, by its path under the app's folder, and its text: the whole string. */
export const iosFileOf = (number: number, encoded: string): readonly [string, string] => [
  `timing/${number}`,
  encoded,
];

/**
 * The web's file of hymn `number`, by its path under the app's folder, and
 * its text: a module whose default is the whole string. The web's
 * development host serves only `.js` files under the page module's folder,
 * and the built site the whole folder, so a module is the one file both
 * serve.
 */
export const webFileOf = (number: number, encoded: string): readonly [string, string] => [
  `modules/web/timing/${number}.js`,
  `export default ${JSON.stringify(encoded)};\n`,
];

/** Every file the build writes for the book's timing `rows`, by its path under the app's folder. */
export const timingFiles = (
  rows: ReadonlyArray<readonly [number, string]>,
): ReadonlyArray<readonly [string, string]> =>
  rows.flatMap(([number, encoded]) => [iosFileOf(number, encoded), webFileOf(number, encoded)]);
