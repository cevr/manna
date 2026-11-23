/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, effect/noNullish -- each launch's calls are awaited in turn as Exact asks them, the stand-in host's wait answers with a promise as Exact's does, and a recall without Show all is `null` on the wire as the Contract hands it. */

/**
 * The launch's opening through the port's own source (`startRead`), over
 * each store the current app tells apart: one that cannot be read (Today),
 * a fresh one and one with lists but no plant (the first minute, home in
 * the port), and one whose verse was said (home). Each row is held to the
 * current app's `openingOf` over the same garden view as well.
 */

import { expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';
import type { FileStorage } from '@manna/exact-kit/storage';
import { openingOf, type Opening } from '@manna/heartseed/first/flow';
import { Effect, Logger, Option } from 'effect';

import { GARDEN_FILE, readGarden } from '../garden/program';
import { makePort, storageOf } from '../test/garden-model';
import { startSources } from './sources';

const HOST = { turn: withDataHost, wait: () => Promise.resolve() };
const NOW = Date.UTC(2026, 10, 15, 13, 0, 0);
const GOOD = {
  startedAt: NOW,
  offset: 0,
  grade: 3,
  suggested: 3,
  words: 10,
  missed: 0,
  peeked: 0,
  extra: 0,
};
const NO_HELP = { peeked: [], shownAt: null, cap: 4 };
const FIRST = '/first/welcome/none';

/** The launch's opening as the port's source answers it on `storage`. */
const openedOn = (storage: FileStorage) =>
  withDataHost(() =>
    startSources({ host: HOST, quiet: true }).startRead([NOW, 1], { forget: () => {} }, storage),
  );

/** The current app's opening over the garden view the port reads from `storage`. */
const oneOn = (storage: FileStorage) =>
  Effect.runPromise(
    Effect.map(readGarden(storage), (held) => openingOf(Option.some(held.garden))).pipe(
      Effect.provide(Logger.layer([])),
    ),
  );

/** A store whose garden file is not a store: every read of it fails. */
const unreadable = () =>
  storageOf(new Map([[GARDEN_FILE, new TextEncoder().encode('not a store').buffer]])).storage;

/** A store with John 3:16-18 planted as a list and nothing said. */
const listed = async () => {
  const port = makePort();
  await port.call('gardenPlant', [43, 3, 16, 18, NOW, 0, 1]);
  return port.storage;
};

/** A store whose John 3:16 was said once. */
const said = async () => {
  const port = makePort();
  await port.call('gardenPlant', [43, 3, 16, 18, NOW, 0, 1]);
  await port.call('gardenRecall', ['John 3:16', GOOD, NO_HELP, NOW, 0, 1]);
  return port.storage;
};

const rows: ReadonlyArray<
  readonly [string, () => FileStorage | Promise<FileStorage>, Opening, string]
> = [
  ['an unreadable store opens Today', unreadable, 'today', '/today'],
  ['a fresh store opens the first minute', () => storageOf().storage, 'first', FIRST],
  ['lists with no plant open the first minute', listed, 'first', FIRST],
  ['a verse said opens home', said, 'home', ''],
];

for (const [name, store, opening, route] of rows)
  it(name, async () => {
    const storage = await store();
    expect(await openedOn(storage)).toEqual({ opening, route });
    expect(await oneOn(storage)).toBe(opening);
  });
