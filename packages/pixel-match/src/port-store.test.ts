/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noThrowStatement, effect/noNewError, effect/noTernary -- a Bun test over a scratch folder of the host's temporary directory, reading back the JSON the store wrote at a fixed local instant; a missing fixture is a broken test, said by a throw. */

import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { storeOf } from './fixtures.ts';
import { PORT_STORES, writePortStore } from './port-store.ts';

/** Each state's file in Exact's kv store: its name in RFC 4648 base32, lower case, unpadded (`ibex2::kv::FileStore`), spelt by Python's `base64.b32encode`, not by the code under test. */
const KV_FILE = {
  settingsFeelKept: 'onsxi5djnztxgrtfmvwewzlqoq',
  favouriteList: 'mzqxm33vojuxizkmnfzxi',
  recentList: 'ojswgzloorggs43u',
  chordsOn: 'mnug64teonhw4',
} as const;

const HEARTSEED = PORT_STORES.heartseed ?? { _tag: 'File', bundle: '', file: '' };
const HYMNAL = PORT_STORES.hymnal ?? { _tag: 'File', bundle: '', file: '' };
const NOW = new Date(2026, 10, 18, 13, 30);

describe("a fixture in the port's store", () => {
  it('writes the fixture’s pairs, each key once, where the named store keeps app:/data/heartseed.json', () => {
    const container = mkdtempSync(join(tmpdir(), 'pm-store-'));
    const store = storeOf('heartseed', 'hs-lists', NOW);
    if (store === undefined) throw new TypeError('no hs-lists');
    const [file = ''] = writePortStore(container, HEARTSEED, 'pm-home.lists', store);
    expect(file).toBe(
      join(
        container,
        'Library/Caches/exact/app.heartseed.exact/agent/pm-home.lists/data/heartseed.json',
      ),
    );
    const pairs: unknown = JSON.parse(readFileSync(file, 'utf8'));
    expect(pairs).toEqual(store._tag === 'Pairs' ? store.pairs.map((pair) => [...pair]) : []);
    const keys = (pairs as ReadonlyArray<readonly [string, string]>).map(([key]) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('heartseed/passages');
  });

  it('empties what a former drive kept in the store first', () => {
    const container = mkdtempSync(join(tmpdir(), 'pm-store-'));
    const tree = join(container, 'Library/Caches/exact/app.heartseed.exact/agent/pm-home.due');
    mkdirSync(join(tree, 'kv'), { recursive: true });
    writeFileSync(join(tree, 'kv', 'kept'), 'a choice');
    writePortStore(container, HEARTSEED, 'pm-home.due', { _tag: 'Pairs', pairs: [] });
    expect(existsSync(join(tree, 'kv', 'kept'))).toBe(false);
  });

  it('writes a broken store as bytes no store wrote', () => {
    const container = mkdtempSync(join(tmpdir(), 'pm-store-'));
    const [file = ''] = writePortStore(container, HEARTSEED, 'pm-x', { _tag: 'Broken' });
    expect(() => JSON.parse(readFileSync(file, 'utf8'))).toThrow();
  });

  it("writes the hymnal's fixture as the port's persisted states, each in the file Exact's kv store reads it from", () => {
    const container = mkdtempSync(join(tmpdir(), 'pm-store-'));
    const store = storeOf('hymnal', 'hy-used', NOW);
    if (store === undefined) throw new TypeError('no hy-used');
    const files = writePortStore(container, HYMNAL, 'pm-recent.page', store);
    const states = join(
      container,
      'Library/Caches/exact/im.cvr.hymnal.exact/agent/pm-recent.page/kv/exact.state',
    );
    const read = (name: keyof typeof KV_FILE) => readFileSync(join(states, KV_FILE[name]), 'utf8');
    expect(read('settingsFeelKept')).toBe('"off"');
    expect(JSON.parse(read('favouriteList'))).toEqual([1, 100, 529]);
    expect(JSON.parse(read('recentList'))).toEqual([12, 100, 1]);
    expect(files).toHaveLength(3);
    const chords = storeOf('hymnal', 'hy-chords', NOW);
    if (chords === undefined) throw new TypeError('no hy-chords');
    writePortStore(container, HYMNAL, 'pm-recent.page', chords);
    expect(read('chordsOn')).toBe('true');
    expect(existsSync(join(states, KV_FILE.recentList))).toBe(false);
  });

  it('refuses a hymnal key the port names no state for, and a broken hymnal store', () => {
    const container = mkdtempSync(join(tmpdir(), 'pm-store-'));
    expect(() =>
      writePortStore(container, HYMNAL, 'pm-x', { _tag: 'Pairs', pairs: [['tempo', '1']] }),
    ).toThrow('fixture key tempo');
    expect(() => writePortStore(container, HYMNAL, 'pm-x', { _tag: 'Broken' })).toThrow('broken');
  });
});
