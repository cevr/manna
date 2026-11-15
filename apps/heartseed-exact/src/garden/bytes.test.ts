/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNewPromise, effect/noTernary, no-await-in-loop -- each history is awaited in turn, as Exact asks its sources one by one; the file's bytes are JSON as the store writes them. */

/**
 * The stored bytes are the current Heartseed's (spec A3), so `ex-hs-import`
 * copies keys. After each generated history: the keys and values the port
 * wrote are, sorted, the very entries the current app's own services wrote
 * over `KeyValueStore.layerMemory` for the same steps; read back by the
 * current app's own layers, they decode whole (no `garden.record.skipped`,
 * no failed read) to the port's view; and a store the current app wrote,
 * laid in the port's file, reads on the port to the current app's view.
 */

import { runCall } from '@manna/exact-kit/effect';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import { Chime, Garden, layer as gardenLayer } from '@manna/heartseed/garden';
import { layer as passagesLayer, Passages } from '@manna/heartseed/passages';
import { expect, it } from 'bun:test';
import { Effect, Layer, Logger, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { runHistory } from '../test/garden-history';
import { entriesIn, makePort, plainOf } from '../test/garden-model';
import { GARDEN_FILE, readGarden } from './program';
import { readSingles, SINGLES_KEY } from './singles';

const HOST = { turn: withDataHost, wait: () => Promise.resolve() };
const silentChime = Layer.succeed(Chime, Chime.of({ grow: () => Effect.void }));

/** Every entry of `store`, sorted by key. */
const dumpOf = (store: KeyValueStore.KeyValueStore) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const keys = yield* store.keys;
      const entries = yield* Effect.forEach(keys, (key) =>
        Effect.map(store.get(key), (value): readonly [string, string] => [key, value ?? '']),
      );
      return [...entries].sort(([a], [b]) => a.localeCompare(b));
    }).pipe(Effect.orDie),
  );

/** The current app's own layers over `entries`: what they read, and every warning they log. */
const readByApp = (entries: ReadonlyArray<readonly [string, string]>) => {
  const warnings: string[] = [];
  const collect = Logger.make<unknown, void>(({ message }) => {
    warnings.push(JSON.stringify(message));
  });
  const filled = Layer.effect(KeyValueStore.KeyValueStore)(
    Effect.gen(function* () {
      const store = yield* KeyValueStore.KeyValueStore;
      yield* Effect.forEach(entries, ([key, value]) => store.set(key, value));
      return store;
    }).pipe(Effect.orDie),
  ).pipe(Layer.provide(KeyValueStore.layerMemory));
  const grounds = Layer.mergeAll(
    gardenLayer.pipe(Layer.provide(silentChime)),
    passagesLayer,
    Logger.layer([collect]),
  ).pipe(Layer.provideMerge(filled), Layer.provideMerge(Logger.layer([collect])));
  const program = Effect.all({
    garden: Effect.flatMap(Garden, (each) => each.view),
    passages: Effect.flatMap(Passages, (each) => each.view),
    singles: readSingles,
  });
  return Effect.runPromise(
    Effect.map(Effect.provide(program, grounds), (held) => ({ held, warnings })),
  );
};

it('writes the bytes the current app writes, and reads the stores it writes', async () => {
  for (let seed = 1001; seed <= 1040; seed++) {
    const { port, oracle, now } = await runHistory(seed);
    const written = [...entriesIn(port.files)].sort(([a], [b]) => a.localeCompare(b));
    const singles = oracle.singles();
    const ownWritten = await dumpOf(oracle.store);
    const singlesWritten = written.filter(([key]) => key === SINGLES_KEY);
    expect({ seed, entries: written.filter(([key]) => key !== SINGLES_KEY) }).toEqual({
      seed,
      entries: ownWritten,
    });
    expect({ seed, singles: singlesWritten.map(([, value]) => JSON.parse(value)) }).toEqual({
      seed,
      singles: singlesWritten.length === 0 ? [] : [singles],
    });

    const portHeld = await runCall(readGarden(port.storage), { now, seed }, HOST);
    const read = await readByApp(written);
    expect({ seed, warnings: read.warnings }).toEqual({ seed, warnings: [] });
    expect({ seed, held: plainOf(read.held) }).toEqual({ seed, held: plainOf(portHeld) });

    const fresh = makePort();
    const ownFile = [...ownWritten, ...singlesWritten];
    fresh.files.set(GARDEN_FILE, new TextEncoder().encode(JSON.stringify(ownFile)).buffer);
    const freshHeld = await runCall(readGarden(fresh.storage), { now, seed }, HOST);
    const known = await oracle.held(now);
    expect({ seed, held: plainOf(freshHeld) }).toEqual({ seed, held: plainOf(known) });
    expect({ seed, singles: Option.getOrNull(freshHeld.singles) }).toEqual({
      seed,
      singles: singlesWritten.length === 0 ? [] : singles,
    });
  }
});
