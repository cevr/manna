/* oxlint-disable effect/noAsyncFunction, no-await-in-loop, effect/noNewError, effect/noNewPromise, effect/noThrowStatement, effect/noNullish, effect/noTernary, effect/preferMatchTagsExhaustive, effect/noKnownValueWidening -- the store's other face is Exact's promise-based `storage.fs`: the stand-in answers with promises the test awaits call by call and refuses with errors as a host does, and the reference model is a plain `Map`, whose `get` answers undefined */

/**
 * The store against a reference model, a `Map`: generated sequences of
 * commands (get, set, remove, clear, size, keys) over keys and values from
 * every class of Unicode, empty and long strings, with refusals injected
 * into the stand-in storage, each command run through the runner inside
 * the data host. Every read equals the model's, a refused write leaves the
 * model's state, every failure is a `KeyValueStoreError` in Effect's error
 * channel, and each call builds its own layer, which holds nothing after it.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Exit } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import type * as Declared from './store.d.ts';

import { withDataHost } from '../data-host/testing.ts';
import { runCall } from '../effect/runner.ts';
import { layerFile, type FileStorage } from './store.ts';

type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const DECLARED: [
  Mutual<typeof layerFile, typeof Declared.layerFile>,
  Mutual<FileStorage, Declared.FileStorage>,
] = [true, true];

const PATH = 'app:/data/store.json';

/** A mulberry32 stream, so a red run names its seed. */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const below = (n: number) => Math.floor(next() * n);
  return { below, chance: (p: number) => next() < p };
};

type Random = ReturnType<typeof seeded>;

/** Pieces of text from each class: ASCII, Latin, CJK, an astral emoji, combining marks, right-to-left, zero width, controls, quotes and lone surrogates either way. */
const PIECES = [
  'a',
  'Z9',
  'é',
  'ß',
  '漢字',
  '😀',
  '👩🏽‍🌾',
  'e\u0301',
  'שלום',
  '\u200b',
  '\u0000',
  '\n\t',
  '"\\',
  '\ud800',
  '\udfff',
  '\ufeff',
  '/',
  '123',
  '__proto__',
];

const textOf = (random: Random): string => {
  if (random.chance(0.1)) return '';
  if (random.chance(0.05)) return 'x'.repeat(20_000 + random.below(5_000));
  return Array.from(
    { length: 1 + random.below(4) },
    () => PIECES[random.below(PIECES.length)],
  ).join('');
};

type Command =
  | { readonly _tag: 'get'; readonly key: string }
  | { readonly _tag: 'set'; readonly key: string; readonly value: string }
  | { readonly _tag: 'remove'; readonly key: string }
  | { readonly _tag: 'clear' }
  | { readonly _tag: 'size' }
  | { readonly _tag: 'keys' };

const commandOf = (random: Random, keys: readonly string[]): Command => {
  const key =
    keys.length > 0 && random.chance(0.6)
      ? (keys[random.below(keys.length)] ?? '')
      : textOf(random);
  switch (random.below(8)) {
    case 0:
    case 1:
      return { _tag: 'get', key };
    case 2:
    case 3:
      return { _tag: 'set', key, value: textOf(random) };
    case 4:
      return { _tag: 'remove', key };
    case 5:
      return { _tag: 'clear' };
    case 6:
      return { _tag: 'size' };
    default:
      return { _tag: 'keys' };
  }
};

/** What the model answers for `command`, and its state after. */
const modelStep = (model: Map<string, string>, command: Command): unknown => {
  switch (command._tag) {
    case 'get':
      return model.get(command.key);
    case 'set':
      model.set(command.key, command.value);
      return undefined;
    case 'remove':
      model.delete(command.key);
      return undefined;
    case 'clear':
      model.clear();
      return undefined;
    case 'size':
      return model.size;
    case 'keys':
      return [...model.keys()];
  }
};

const run = (
  store: KeyValueStore.KeyValueStore,
  command: Command,
): Effect.Effect<unknown, KeyValueStore.KeyValueStoreError> => {
  switch (command._tag) {
    case 'get':
      return store.get(command.key);
    case 'set':
      return store.set(command.key, command.value);
    case 'remove':
      return store.remove(command.key);
    case 'clear':
      return store.clear;
    case 'size':
      return store.size;
    case 'keys':
      return store.keys;
  }
};

/** A stand-in for Exact's `storage.fs` with one file system, which refuses each call with probability `refusing`. */
const storageOf = (random: Random, refusing: { p: number }) => {
  const files = new Map<string, ArrayBuffer>();
  const refused = () => random.chance(refusing.p);
  const storage: FileStorage = {
    fs: {
      readFile: async (path) => {
        if (refused()) throw new Error('EIO');
        const file = files.get(path);
        if (file === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' });
        return file;
      },
      atomicWriteFile: async (path, data) => {
        if (refused()) throw new Error('EIO');
        files.set(path, Uint8Array.from(data).buffer);
      },
    },
  };
  return { files, storage };
};

const HOST = { turn: withDataHost, wait: () => Promise.resolve() };

/** One call: a fresh layer over `storage`, the commands run in order, each one's exit. */
const call = (storage: FileStorage, commands: readonly Command[]) =>
  runCall(
    Effect.forEach(commands, (command) =>
      Effect.exit(Effect.flatMap(KeyValueStore.KeyValueStore, (store) => run(store, command))),
    ).pipe(Effect.provide(layerFile(storage, PATH))),
    { now: 0, seed: 1 },
    HOST,
  );

const SEQUENCES = 120;

describe('the KeyValueStore over a file of Exact storage', () => {
  it('its declarations for Exact (store.d.ts) say what store.ts does', () => {
    expect(DECLARED).toEqual([true, true]);
  });

  it('answers what a Map answers over generated command sequences, a refused call leaving the model as it was', async () => {
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const random = seeded(seed);
      const refusing = { p: random.chance(0.5) ? 0.15 : 0 };
      const { storage } = storageOf(random, refusing);
      const model = new Map<string, string>();
      for (let calls = 1 + random.below(6); calls > 0; calls--) {
        const commands = Array.from({ length: 1 + random.below(8) }, () =>
          commandOf(random, [...model.keys()]),
        );
        const exits = await call(storage, commands);
        commands.forEach((command, index) => {
          const exit = exits[index];
          if (exit === undefined) throw new Error(`seed ${seed}: no exit`);
          if (Exit.isSuccess(exit)) {
            expect({ seed, command: command._tag, value: exit.value }).toEqual({
              seed,
              command: command._tag,
              value: modelStep(model, command),
            });
            return;
          }
          const error = Exit.findErrorOption(exit);
          expect({
            seed,
            failure:
              error._tag === 'Some' && error.value instanceof KeyValueStore.KeyValueStoreError,
          }).toEqual({ seed, failure: true });
        });
        refusing.p = 0;
        const [keys] = await call(storage, [{ _tag: 'keys' }]);
        expect({
          seed,
          keys: keys !== undefined && Exit.isSuccess(keys) ? keys.value : 'failed',
        }).toEqual({ seed, keys: [...model.keys()] });
        const values = await call(
          storage,
          [...model.keys()].map((key): Command => ({ _tag: 'get', key })),
        );
        expect({
          seed,
          values: values.map((each) => (Exit.isSuccess(each) ? each.value : 'failed')),
        }).toEqual({ seed, values: [...model.values()] });
        refusing.p = random.chance(0.5) ? 0.15 : 0;
      }
    }
  });

  it('holds nothing between calls: a later call reads what another wrote', async () => {
    const { storage } = storageOf(seeded(1), { p: 0 });
    await call(storage, [{ _tag: 'set', key: 'a', value: '1' }]);
    await call(storage, [{ _tag: 'set', key: 'a', value: '2' }]);
    const [read] = await call(storage, [{ _tag: 'get', key: 'a' }]);
    expect(read !== undefined && Exit.isSuccess(read) ? read.value : 'failed').toBe('2');
  });

  it('fails every call on a file it did not write, and writes nothing over it', async () => {
    const { files, storage } = storageOf(seeded(1), { p: 0 });
    for (const text of ['{"a":"1"}', 'not json', '[["a",1]]', '[["a","1"],["a","2"]]', '\u00ff']) {
      const before = Uint8Array.from(text, (char) => char.charCodeAt(0)).buffer;
      files.set(PATH, before);
      const exits = await call(storage, [
        { _tag: 'get', key: 'a' },
        { _tag: 'set', key: 'a', value: '2' },
        { _tag: 'keys' },
      ]);
      expect({ text, failed: exits.map(Exit.isFailure) }).toEqual({
        text,
        failed: [true, true, true],
      });
      expect(files.get(PATH)).toBe(before);
    }
  });
});
