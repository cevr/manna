/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noNewError, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noGlobals -- the tests await the page module's Promise answers as Exact's data module gets them, the stand-in page's Cache Storage answers Promises as the browser's does, and the stand-in files are modules whose default is JSON-written text, refused with a plain Error as the browser's import refuses one. */

/**
 * The page module's shipped reads keep what they read (`modules/web/index.js`,
 * `shippedKept`): a read that imports a file keeps its text in the page's
 * Cache Storage by the file's address, and a read whose import fails answers
 * that copy, so a hymn read once draws its chords offline. A file never kept
 * is still refused, and a page with no Cache Storage reads as before. The
 * files stand in through a plugin under names no build writes (`kepttest…`),
 * and Cache Storage through a map, as Bun has none.
 */

import { describe, expect, it } from 'bun:test';

import { later } from '../../modules/web/index.js';

const served = new Map<string, string>();
Bun.plugin({
  name: 'hymnal-exact-kept',
  setup(build) {
    build.onResolve(
      { filter: /\/modules\/web\/(chords|indexes)\/kepttest[a-z0-9]*\.js(\?.*)?$/u },
      (args) => ({ path: args.path, namespace: 'kepttest' }),
    );
    build.onLoad({ filter: /.*/u, namespace: 'kepttest' }, (args) => {
      const name = /\/(chords|indexes)\/(kepttest[a-z0-9]*)\.js/u.exec(args.path);
      const text = served.get(`${name?.[1]}/${name?.[2]}`);
      if (text === undefined) throw new Error(`no file ${args.path}`);
      return { contents: `export default ${JSON.stringify(text)};`, loader: 'js' };
    });
  },
});

const addressOf = (folder: string, name: string) =>
  new URL(`../../modules/web/${folder}/${name}.js`, import.meta.url).href;

/** A Cache Storage over one map of address to text per cache name; `written` settles once every write asked so far has. */
const cachesOf = () => {
  const stores = new Map<string, Map<string, string>>();
  const writes: Array<Promise<void>> = [];
  return {
    stores,
    written: () => Promise.all(writes),
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, string>();
      stores.set(name, store);
      return {
        put: (address: string, response: Response) => {
          const write = response.text().then((text) => {
            store.set(address, text);
          });
          writes.push(write);
          return write;
        },
        match: async (address: string) => {
          const text = store.get(address);
          return text === undefined ? undefined : new Response(text);
        },
      };
    },
  };
};

const read = (folder: string, n: string) => later({ op: `${folder}.read`, n });
const page = globalThis as { caches?: unknown };

/** `body` run on a page whose Cache Storage is `caches` (none when undefined), the files in `files` served. */
const onPage = async (
  caches: ReturnType<typeof cachesOf> | undefined,
  files: ReadonlyArray<readonly [string, string]>,
  body: () => Promise<void>,
) => {
  if (caches === undefined) delete page.caches;
  else page.caches = caches;
  served.clear();
  for (const [path, text] of files) served.set(path, text);
  await body().finally(() => {
    delete page.caches;
    served.clear();
  });
};

describe("the page module's shipped reads", () => {
  it('keep the text of each file they import, by its address, in each folder', async () => {
    const caches = cachesOf();
    const files = [
      ['chords/kepttesta', 'G C D'],
      ['indexes/kepttesta', 'one two'],
    ] as const;
    await onPage(caches, files, async () => {
      expect(await read('chords', 'kepttesta')).toEqual({ text: 'G C D' });
      expect(await read('indexes', 'kepttesta')).toEqual({ text: 'one two' });
      await caches.written();
      expect([...(caches.stores.get('hymnal-shipped') ?? [])]).toEqual([
        [addressOf('chords', 'kepttesta'), 'G C D'],
        [addressOf('indexes', 'kepttesta'), 'one two'],
      ]);
    });
  });

  it('answer the kept copy when the import fails, and refuse a file never kept', async () => {
    const caches = cachesOf();
    await onPage(caches, [['chords/kepttestb', 'A E']], async () => {
      await read('chords', 'kepttestb');
      await caches.written();
      const store = caches.stores.get('hymnal-shipped');
      store?.set(
        addressOf('chords', 'kepttestc'),
        store.get(addressOf('chords', 'kepttestb')) ?? '',
      );
      expect(await read('chords', 'kepttestc')).toEqual({ text: 'A E' });
      await expect(read('chords', 'kepttestd')).rejects.toThrow('no file');
      await expect(read('indexes', 'kepttestc')).rejects.toThrow('no file');
    });
  });

  it('read as before on a page with no Cache Storage', async () => {
    await onPage(undefined, [['chords/keptteste', 'F']], async () => {
      expect(await read('chords', 'keptteste')).toEqual({ text: 'F' });
      await expect(read('chords', 'kepttestf')).rejects.toThrow('no file');
    });
  });
});
