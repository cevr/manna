/* oxlint-disable effect/noNullish -- a Web Storage over a plain map for a test, whose absent key is `null` as `layerStorage` reads it. */

/**
 * The current hymnal's settings over texts a test holds: Effect's Web
 * Storage store over a plain map, as the device keeps the current app's
 * `Atom.kvs` settings, so a test writes a key's raw text and reads what the
 * current app's own atoms make of it. Its `settingsOn` is not in the port's
 * declaration of `@manna/hymnal-app/settings` (Exact's type check reads only
 * what the data module reads), so the caller names the part it runs.
 */

import type { Layer } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import * as current from '@manna/hymnal-app/settings';

/** A Web Storage over `texts`. */
const storageOver = (texts: Map<string, string>): Storage =>
  ({
    getItem: (key: string) => texts.get(key) ?? null,
    setItem: (key: string, value: string) => void texts.set(key, value),
    removeItem: (key: string) => void texts.delete(key),
    clear: () => texts.clear(),
    key: (index: number) => [...texts.keys()][index] ?? null,
    get length() {
      return texts.size;
    },
  }) as Storage;

/** The current app's settings over `texts`, typed as the part `S` the caller runs. */
export const currentSettings = <S>(texts: Map<string, string>): S =>
  (
    current as unknown as {
      readonly settingsOn: (store: Layer.Layer<KeyValueStore.KeyValueStore>) => S;
    }
  ).settingsOn(KeyValueStore.layerStorage(() => storageOver(texts)));
