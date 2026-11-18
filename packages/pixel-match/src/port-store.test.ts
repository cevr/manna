/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noThrowStatement, effect/noNewError, effect/noTernary -- a Bun test over a scratch folder of the host's temporary directory, reading back the JSON the store wrote at a fixed local instant; a missing fixture is a broken test, said by a throw. */

import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { storeOf } from './fixtures.ts';
import { PORT_STORES, writePortStore } from './port-store.ts';

const HEARTSEED = PORT_STORES.heartseed ?? { bundle: '', file: '' };
const NOW = new Date(2026, 10, 18, 13, 30);

describe("a fixture in the port's store", () => {
  it('writes the fixture’s pairs, each key once, where the named store keeps app:/data/heartseed.json', () => {
    const container = mkdtempSync(join(tmpdir(), 'pm-store-'));
    const store = storeOf('heartseed', 'hs-lists', NOW);
    if (store === undefined) throw new TypeError('no hs-lists');
    const file = writePortStore(container, HEARTSEED, 'pm-home.lists', store);
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
    const file = writePortStore(container, HEARTSEED, 'pm-x', { _tag: 'Broken' });
    expect(() => JSON.parse(readFileSync(file, 'utf8'))).toThrow();
  });
});
