/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish -- the last test reads the app's own source files from disk, synchronously, outside any Effect; the device's disk holds a listed key with no value as null, as One's store answers it. */

/**
 * The app's store over the device's `One.Database` (the test `one` module's
 * stand-in): it answers only what the device answered. An open that throws
 * fails that call and the next call opens again; a failed listing, record
 * read or write is a failure, never an empty list, a missing value or a
 * write reported done; each launch opens anew and closes, with its scope,
 * the handle it opened and no other. And no app source makes a
 * memory store to stand in for the device.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Effect, Exit, Layer, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { store } from './store';
import { device } from './test/one';

/** One launch: the real store built anew and `use` run over it. */
const launch = <A>(
  use: (kv: KeyValueStore.KeyValueStore) => Effect.Effect<A, KeyValueStore.KeyValueStoreError>,
) => Effect.flatMap(KeyValueStore.KeyValueStore, use).pipe(Effect.provide(Layer.fresh(store)));

/** Whether a call failed with the store's typed error. */
const failed = <A>(effect: Effect.Effect<A, KeyValueStore.KeyValueStoreError>) =>
  Effect.map(Effect.exit(effect), (exit) => Option.isSome(Exit.findErrorOption(exit)));

const RECALL = 'heartseed/recall/Made 1:1/5';
const SWITCH = 'heartseed/voice/enabled';

describe('the app store over the device', () => {
  it('opens the store named heartseed at its first call, once per launch, and a later launch reads what an earlier one wrote', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        device.launch([]);
        const first = yield* launch((kv) =>
          Effect.gen(function* () {
            const before = device.calls.open;
            yield* kv.set(SWITCH, 'false');
            yield* kv.set(RECALL, '{}');
            return { before, keys: yield* kv.keys };
          }),
        );
        expect(first).toEqual({ before: 0, keys: [SWITCH, RECALL] });
        expect(device.calls.open).toBe(1);
        expect([...device.names]).toEqual(['heartseed']);
        expect(yield* launch((kv) => kv.get(SWITCH))).toBe('false');
        expect(device.calls.open).toBe(2);
      }),
    ));

  it('fails each call whose open throws, writes nothing in its place, and opens at the next call once the device can', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        device.launch([[RECALL, '{}']]).fail('open', 2);
        const outcome = yield* launch((kv) =>
          Effect.gen(function* () {
            const keys = yield* failed(kv.keys);
            const set = yield* failed(kv.set(SWITCH, 'false'));
            const written = device.disk.has(SWITCH);
            return { keys, set, written, later: yield* kv.keys, value: yield* kv.get(RECALL) };
          }),
        );
        expect(outcome).toEqual({
          keys: true,
          set: true,
          written: false,
          later: [RECALL],
          value: '{}',
        });
        expect(device.calls.open).toBe(3);
        expect(device.calls.keys).toBe(1);
      }),
    ));

  it('fails a listing, a record read or a write the device refused, and answers the next call afresh', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        device
          .launch([[RECALL, '{"a":1}']])
          .fail('keys', 1)
          .fail('get', 1)
          .fail('set', 1);
        const outcome = yield* launch((kv) =>
          Effect.gen(function* () {
            const keys = yield* failed(kv.keys);
            const get = yield* failed(kv.get(RECALL));
            const set = yield* failed(kv.set(RECALL, '{"a":2}'));
            const stored = device.disk.get(RECALL);
            return { keys, get, set, stored, listed: yield* kv.keys, read: yield* kv.get(RECALL) };
          }),
        );
        expect(outcome).toEqual({
          keys: true,
          get: true,
          set: true,
          stored: '{"a":1}',
          listed: [RECALL],
          read: '{"a":1}',
        });
        expect(device.calls.open).toBe(1);
      }),
    ));

  it('closes the handle it opened when its scope closes, and only that: none for a launch that never opened or whose opens all failed, one after a failed open and a good one', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const counts = () => [device.calls.open, device.calls.failedOpens, device.calls.close];
        device.launch([[RECALL, '{}']]);
        yield* launch(() => Effect.void);
        expect(counts()).toEqual([0, 0, 0]);

        device.launch().fail('open', 2);
        const down = yield* launch((kv) => Effect.all([failed(kv.keys), failed(kv.get(RECALL))]));
        expect([down, counts()]).toEqual([
          [true, true],
          [2, 2, 0],
        ]);

        device.launch().fail('open', 1);
        const during = yield* launch((kv) =>
          Effect.gen(function* () {
            const first = yield* failed(kv.keys);
            const value = yield* kv.get(RECALL);
            yield* kv.set(SWITCH, 'false');
            return [first, value, device.calls.close];
          }),
        );
        expect([during, counts()]).toEqual([
          [true, '{}', 0],
          [2, 1, 1],
        ]);

        device.launch();
        yield* launch((kv) => kv.keys);
        yield* launch((kv) => kv.get(SWITCH));
        expect(counts()).toEqual([2, 0, 2]);
      }),
    ));

  it('answers a listed key with no value as no value, as the device does', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        device.launch([[RECALL, null]]);
        expect(yield* launch((kv) => kv.get(RECALL))).toBe(undefined);
      }),
    ));
});

const APP = join(import.meta.dir, '..');

/** The app's sources under `dir`: every `.ts(x)` file but tests, declarations (One writes `app/routes.d.ts`, git-ignored) and the test stand-ins, told by name so none of those is touched: the part hashes no other part's tests and no ignored file. */
const sourcesUnder = (dir: string): ReadonlyArray<string> =>
  readdirSync(join(APP, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'test' || /\.(test|d)\.tsx?$/.test(name)) return [];
    if (/\.tsx?$/.test(name)) return [path];
    if (statSync(join(APP, path)).isDirectory()) return sourcesUnder(path);
    return [];
  });

describe('nothing stands in for the device store', () => {
  it('no app source makes a memory, storage or file-system store but the natural voice’s development probe’s memory store', () => {
    const found = [...sourcesUnder('src'), ...sourcesUnder('app')].flatMap((file) => {
      const text = readFileSync(join(APP, file), 'utf8');
      return ['layerMemory', 'makeMemory', 'layerStorage', 'layerFileSystem']
        .filter((name) => text.includes(name))
        .map((name) => `${file}: ${name}`);
    });
    expect(found).toEqual(['app/probe/natural.tsx: layerMemory']);
  });
});
