/* oxlint-disable effect/noNullish -- Exact's data module imports no effect for its own state (docs/exact.md): the search's hymns about a query are made at the first call, a plain `undefined` before it. */

/**
 * The search's sources, as `app.ts` registers them: `findAbout(query)`
 * answers the hymns about `query` once it has stood (`features/find.contract`
 * asks after the current app's `PAUSE`), read through the host's storage
 * from the table the app ships (`table.ts`).
 */

import { type AboutAnswer, aboutOver } from './table.ts';

/** The one call of Exact's `storage` the search makes: a read of a file the app ships. */
interface ShippedFiles {
  readonly fs: { readonly readFile: (path: string) => Promise<ArrayBuffer> };
}

/** Exact's kept values, which the search does not read. */
interface KeptValues {
  readonly get: (name: string) => string | null;
}

export const resultsSources = () => {
  let about: ((query: string) => Promise<AboutAnswer>) | undefined;
  return {
    findAbout: ([query]: readonly [string], _store: KeptValues, storage: ShippedFiles) => {
      about ??= aboutOver((path) => storage.fs.readFile(path));
      return about(query);
    },
  };
};
