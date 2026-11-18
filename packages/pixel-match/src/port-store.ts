/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a host tool's file names and writes on the simulator's disk, as the tool's other modules make them through node's file system; the store's text is JSON as the port's store writes it. */

/**
 * A row's fixture in the port's own store (`pixel shot`): the port keeps
 * the same key-value pairs One keeps (Heartseed's garden in
 * `app:/data/heartseed.json`, a JSON array of `[key, value]` pairs, through
 * `@manna/exact-kit/storage`), so the fixture's pairs are written there, in
 * the named agent store the drive opens (`--storage pm-<id> --keep-storage`).
 * A named store on an Apple host lives under the app's data container at
 * `Library/Caches/exact/<app id>/agent/<name>`, which is its `app:/` root
 * (`app:/data/heartseed.json` is `<name>/data/heartseed.json`, as an
 * agent drive's store on the simulator shows); the whole tree
 * is emptied first, as `--reset-storage` empties it, so nothing a former
 * drive kept (a choice, a file) is left.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Store } from './fixtures.ts';
import type { AppName } from './model.ts';

/** Where each port keeps the store a fixture describes: its app id and the store's file under `app:/`; none for a port whose fixtures are not written yet. */
export const PORT_STORES: Partial<
  Record<AppName, { readonly bundle: string; readonly file: string }>
> = {
  heartseed: { bundle: 'app.heartseed.exact', file: 'data/heartseed.json' },
};

/** The named agent store's tree in the app's data container. */
const storeTree = (container: string, bundle: string, name: string) =>
  join(container, 'Library', 'Caches', 'exact', bundle, 'agent', name);

/** The store file's text: the pairs as the port's store writes them, or bytes no store wrote, so every read of a broken store fails. */
const storeText = (store: Store) => {
  if (store._tag === 'Broken') return 'not a store';
  return JSON.stringify(store.pairs);
};

/** Empties the named store's tree and writes `store` as its one file; the file's path. */
export const writePortStore = (
  container: string,
  port: { readonly bundle: string; readonly file: string },
  name: string,
  store: Store,
) => {
  const tree = storeTree(container, port.bundle, name);
  rmSync(tree, { recursive: true, force: true });
  const file = join(tree, port.file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, storeText(store));
  return file;
};
