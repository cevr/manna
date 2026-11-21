/* oxlint-disable effect/noNullish -- Exact's data module imports no effect for its own state (docs/exact.md): the search's hymns about a query are made at the first call, a plain `undefined` before it. */

/**
 * The search's sources, as `app.ts` registers them: `findAbout(query)`
 * answers the hymns about `query` once it has stood (`features/find.contract`
 * asks after the current app's `PAUSE`), read through the host's storage
 * from the table the app ships (`table.ts`).
 */

import type { Storage, Store } from '../../app.contract.d.ts';
import { type AboutAnswer, aboutOver } from './table.ts';

export const resultsSources = () => {
  let about: ((query: string) => Promise<AboutAnswer>) | undefined;
  return {
    findAbout: ([query]: readonly [string], _store: Store, storage: Storage) => {
      about ??= aboutOver((path) => storage.fs.readFile(path));
      return about(query);
    },
  };
};
