/* oxlint-disable effect/noGlobals -- a web file is a module whose default is a string, written as JSON writes it; the data module imports no effect (docs/exact.md). */

/**
 * The files a shipped folder is written as (`load.ts` reads them), by path
 * under the app's folder: `<folder>/<name>` the iOS app ships under
 * `Resources/<folder>` (`app.json` `host.ios.resources`), and
 * `modules/web/<folder>/<name>.js` the web build ships beside the page
 * module, a module whose default is the text, since the web's development
 * host serves only `.js` files under the page module's folder and the built
 * site the whole folder.
 */
export const shippedFiles = (
  folder: string,
  entries: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<readonly [string, string]> =>
  entries.flatMap(([name, text]) => [
    [`${folder}/${name}`, text] as const,
    [`modules/web/${folder}/${name}.js`, `export default ${JSON.stringify(text)};\n`] as const,
  ]);
