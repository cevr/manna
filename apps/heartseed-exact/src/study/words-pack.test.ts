/* oxlint-disable effect/noAsyncFunction, effect/noNewError, effect/noNullish, effect/noThrowStatement, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): the test awaits the downloader over a stand-in server and a storage that answers at once. */

/**
 * Find's word index as a pack the one downloader keeps: a good body is
 * kept and handed to find under its version, each broken field is named,
 * and before it lands find is handed none.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { findPackOf } from '../../tools/find';
import { packSources } from '../packs/sources';
import { askSettled } from '../test/packs-asked';
import { STUDY_PACKS, STUDY_WORDS, findPackFrom } from './sources';
import { checkWords, wordsBodyOf, wordsPackOf } from './words-pack';

const FIND = findPackOf([
  'In the beginning God created the heaven and the earth.\nAnd the earth was without form',
]);
const PACK = wordsPackOf(FIND);
const BODY = wordsBodyOf(PACK);

const storageOf = () => {
  const files = new Map<string, ArrayBuffer>();
  return {
    files,
    fs: {
      readFile: async (path: string) => {
        const file = files.get(path);
        if (file === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' });
        return file;
      },
      atomicWriteFile: async (path: string, bytes: Uint8Array) => {
        files.set(path, Uint8Array.from(bytes).buffer);
      },
    },
  };
};

describe('the word index pack', () => {
  it('a good body is the index with its version; each broken field is named', () => {
    expect(checkWords(BODY)).toEqual({ _tag: 'Good', pack: PACK });
    expect(PACK.count).toBe(2);
    expect(checkWords('{')).toEqual({ _tag: 'Bad', fault: 'json' });
    expect(checkWords('{"format":1}')).toEqual({ _tag: 'Bad', fault: 'fields' });
    expect(checkWords(wordsBodyOf({ ...PACK, format: 2 }))).toEqual({
      _tag: 'Bad',
      fault: 'format',
    });
    expect(checkWords(wordsBodyOf({ ...PACK, find: { ...FIND, format: 0 } }))).toEqual({
      _tag: 'Bad',
      fault: 'format',
    });
    expect(checkWords(wordsBodyOf({ ...PACK, count: 3 }))).toEqual({ _tag: 'Bad', fault: 'count' });
    expect(
      checkWords(wordsBodyOf({ ...PACK, find: { ...FIND, table: `${FIND.table}x` } })),
    ).toEqual({
      _tag: 'Bad',
      fault: 'sum',
    });
    expect(checkWords(wordsBodyOf({ ...PACK, version: '2-00000000' }))).toEqual({
      _tag: 'Bad',
      fault: 'version',
    });
  });

  it('the downloader keeps it, and find reads it under its version', async () => {
    const storage = storageOf();
    const packs = packSources({
      setting: 'http://127.0.0.1:4801',
      packs: STUDY_PACKS,
      fetcher: async (url: string) =>
        new URL(url).pathname === STUDY_WORDS.path
          ? { status: 200, text: async () => BODY }
          : { status: 404, text: async () => '' },
    });
    const from = findPackFrom(packs, '');
    expect(await withDataHost(() => from('', storage))).toBeUndefined();
    const answer = await askSettled(packs.sources, ['', false, 1000], storage);
    expect(answer.kept).toContain(`words ${PACK.version}`);
    expect(await withDataHost(() => from(PACK.version, storage))).toEqual(FIND);
  });
});
