/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noThrowStatement, effect/noNewError, effect/noTernary, effect/noNullish -- a host tool's file names and writes on the simulator's disk, as the tool's other modules make them through node's file system; the store's text is JSON as the port's store writes it; a fixture key the port has no place for is a broken harness, said by a throw. */

/**
 * A row's fixture in the port's own store (`pixel shot`), in the named
 * agent store the drive opens (`--storage pm-<id> --keep-storage`). A named
 * store on an Apple host lives under the app's data container at
 * `Library/Caches/exact/<app id>/agent/<name>`: its `app:/` root
 * (`app:/data/heartseed.json` is `<name>/data/heartseed.json`) and, beside
 * it, the kv store Exact keeps an agent drive's persisted states in
 * (`<name>/kv/exact.state/<the state's name in base32>`, each file the
 * state's JSON text; Exact's `host/apple/src/store.rs`, `Prefs::Kv`). The
 * whole tree is emptied first, as `--reset-storage` empties it, so nothing
 * a former drive kept (a choice, a file) is left.
 *
 * Heartseed keeps the pairs One keeps in one file of its own
 * (`app:/data/heartseed.json`, a JSON array of `[key, value]` pairs,
 * through `@manna/exact-kit/storage`). The hymnal keeps each setting as a
 * persisted state of its own name (`settingsFeelKept`, `favouriteList`),
 * so each of One's keys is written as the state the port reads it from.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Store } from './fixtures.ts';
import type { AppName } from './model.ts';

/** One's stored key, as the port keeps it: the persisted state's name and its JSON text from One's value, or no state, with why. */
type StateOf =
  | { readonly _tag: 'State'; readonly name: string; readonly value: (one: string) => string }
  | { readonly _tag: 'None'; readonly why: string };

/** Where a port keeps the store a fixture describes. */
export type PortStore =
  | { readonly _tag: 'File'; readonly bundle: string; readonly file: string }
  | {
      readonly _tag: 'States';
      readonly bundle: string;
      readonly states: Readonly<Record<string, StateOf>>;
    };

/** A state that keeps One's JSON value as it is. */
const same = (name: string): StateOf => ({ _tag: 'State', name, value: (one) => one });

/** Each port's store; none for a port whose fixtures are not written yet. */
export const PORT_STORES: Partial<Record<AppName, PortStore>> = {
  heartseed: { _tag: 'File', bundle: 'app.heartseed.exact', file: 'data/heartseed.json' },
  hymnal: {
    _tag: 'States',
    bundle: 'im.cvr.hymnal.exact',
    states: {
      feel: {
        _tag: 'State',
        name: 'settingsFeelKept',
        value: (one) => JSON.stringify(one === 'false' ? 'off' : 'on'),
      },
      sound: {
        _tag: 'None',
        why: "the port has no Play sound switch; One's Sound draws nothing a screen shows",
      },
      chords: same('chordsOn'),
      'lists.favourites': same('favouriteList'),
      'lists.recent': same('recentList'),
    },
  },
};

/** The named agent store's tree in the app's data container. */
const storeTree = (container: string, bundle: string, name: string) =>
  join(container, 'Library', 'Caches', 'exact', bundle, 'agent', name);

/** The kv store's file name for a key: its UTF-8 bytes in lower-case base32 with no padding, as Exact's `ibex2::kv::FileStore` spells it. */
const kvName = (key: string) => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of new TextEncoder().encode(key)) {
    buffer = ((buffer << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(buffer >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += alphabet[(buffer << (5 - bits)) & 0x1f];
  return out;
};

/** Writes `text` at `file`, owner-only as Exact's stores write theirs. */
const writeOwn = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, text, { mode: 0o600 });
  return file;
};

/** The persisted states `store`'s pairs are in the port; a key the port names no place for, or a broken store, throws. */
export const statesOf = (states: Readonly<Record<string, StateOf>>, store: Store) => {
  if (store._tag === 'Broken') throw new Error('a broken store has no persisted states to write');
  return store.pairs.flatMap(([key, value]) => {
    const state = new Map(Object.entries(states)).get(key);
    if (state === undefined) throw new Error(`fixture key ${key}: the port names no state for it`);
    return state._tag === 'State' ? [[state.name, state.value(value)] as const] : [];
  });
};

/** Empties the named store's tree and writes `store` into it; the files written. */
export const writePortStore = (
  container: string,
  port: PortStore,
  name: string,
  store: Store,
): ReadonlyArray<string> => {
  const tree = storeTree(container, port.bundle, name);
  rmSync(tree, { recursive: true, force: true });
  if (port._tag === 'File')
    return [
      writeOwn(
        join(tree, port.file),
        store._tag === 'Broken' ? 'not a store' : JSON.stringify(store.pairs),
      ),
    ];
  return statesOf(port.states, store).map(([state, text]) =>
    writeOwn(join(tree, 'kv', 'exact.state', kvName(state)), text),
  );
};
