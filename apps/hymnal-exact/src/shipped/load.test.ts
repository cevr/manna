/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noKnownValueWidening -- the tests await the loader's Promise answers as Exact's data module gives them, a fake read refuses a name it lacks with a plain Error, and a fake's files are an open record a test fills in. */

/**
 * The shipped files' loader and reader (`load.ts`): a kept value answers at
 * once and reads nothing; one not kept answers after one read however many
 * ask while it runs; a read that fails or is refused keeps nothing and the
 * next ask reads again; the reader takes the app's own file first and the
 * page module's op second.
 */

import { describe, expect, it } from 'bun:test';

import { readerOf, rootOf, shippedLoader } from './load.ts';

/** A reader over `files`, counting its reads; a name it lacks is refused. */
const fake = (files: Record<string, string>) => {
  const asked: Array<string> = [];
  const read = (name: string) => {
    asked.push(name);
    const text = files[name];
    return text === undefined ? Promise.reject(new Error(`no ${name}`)) : Promise.resolve(text);
  };
  return { asked, read };
};

const numbers = (given: ReadonlyMap<number, string> = new Map()) =>
  shippedLoader<number, string>(given, String, (text) =>
    text.startsWith('ok') ? text : undefined,
  );

describe('the shipped loader', () => {
  it('answers a kept value at once, and one not wanted, reading nothing', () => {
    const loader = numbers(new Map([[1, 'ok 1']]));
    const { asked, read } = fake({});
    expect(loader.after(1, true, read, () => loader.kept.get(1))).toBe('ok 1');
    expect(loader.after(2, false, read, () => loader.kept.get(2))).toBeUndefined();
    expect(asked).toEqual([]);
  });

  it('answers a value not kept after one read, however many ask meanwhile', async () => {
    const loader = numbers();
    const { asked, read } = fake({ '5': 'ok 5' });
    const first = loader.after(5, true, read, () => loader.kept.get(5));
    const second = loader.after(5, true, read, () => loader.kept.get(5));
    expect(first).toBeInstanceOf(Promise);
    expect(await first).toBe('ok 5');
    expect(await second).toBe('ok 5');
    expect(loader.after(5, true, read, () => loader.kept.get(5))).toBe('ok 5');
    expect(asked).toEqual(['5']);
  });

  it('keeps nothing from a failed or refused read, and reads again at the next ask', async () => {
    const loader = numbers();
    const files: Record<string, string> = { '7': 'broken' };
    const { asked, read } = fake(files);
    expect(await loader.after(7, true, read, () => loader.kept.get(7))).toBeUndefined();
    expect(await loader.after(8, true, read, () => loader.kept.get(8))).toBeUndefined();
    files['7'] = 'ok 7';
    files['8'] = 'ok 8';
    expect(await loader.after(7, true, read, () => loader.kept.get(7))).toBe('ok 7');
    expect(await loader.after(8, true, read, () => loader.kept.get(8))).toBe('ok 8');
    expect(asked).toEqual(['7', '8', '7', '8']);
  });
});

describe('the shipped reader', () => {
  const bytes = (text: string) => new TextEncoder().encode(text).buffer;

  it("reads the app's own file under its folder's root first", async () => {
    const paths: Array<string> = [];
    const storage = {
      fs: {
        readFile: (path: string) => {
          paths.push(path);
          return Promise.resolve(bytes('from the bundle'));
        },
      },
    };
    expect(await readerOf('chords', storage, null)('12')).toBe('from the bundle');
    expect(paths).toEqual([`${rootOf('chords')}/12`]);
    expect(rootOf('chords')).toBe('bundle:/Resources/chords');
  });

  it("asks the web's page module alone, never the storage, and refuses what it cannot read", async () => {
    const files: Array<string> = [];
    const refused = {
      fs: {
        readFile: (path: string) => {
          files.push(path);
          return Promise.reject(new Error('refused'));
        },
      },
    };
    const requests: Array<unknown> = [];
    const native = {
      available: true,
      later: (request: Readonly<Record<string, string | number>>) => {
        requests.push(request);
        return Promise.resolve(
          request['n'] === '3' ? { text: 'from the page' } : { nothing: true },
        );
      },
    };
    expect(await readerOf('chords', refused, native)('3')).toBe('from the page');
    expect(requests).toEqual([{ op: 'chords.read', n: '3' }]);
    await expect(readerOf('chords', refused, native)('4')).rejects.toThrow('no text');
    expect(files).toEqual([]);
    await expect(readerOf('chords', refused, null)('3')).rejects.toThrow('refused');
    await expect(readerOf('chords', undefined, undefined)('3')).rejects.toThrow();
  });

  it("reads iOS's bundled file once its module answers no such op, and then asks the module no more", async () => {
    const paths: Array<string> = [];
    const storage = {
      fs: {
        readFile: (path: string) => {
          paths.push(path);
          return Promise.resolve(bytes(`file ${path.split('/').at(-1)}`));
        },
      },
    };
    const requests: Array<unknown> = [];
    const native = {
      available: true,
      later: (request: Readonly<Record<string, string | number>>) => {
        requests.push(request);
        return Promise.reject(new Error(`Hymnal answers no op ${request['op']}`));
      },
    };
    expect(await readerOf('chords', storage, native)('5')).toBe('file 5');
    expect(await readerOf('indexes', storage, native)('all')).toBe('file all');
    expect(requests).toEqual([{ op: 'chords.read', n: '5' }]);
    expect(paths).toEqual([`${rootOf('chords')}/5`, `${rootOf('indexes')}/all`]);
  });
});
