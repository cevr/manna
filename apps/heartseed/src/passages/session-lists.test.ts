/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- the cases keep a device's disk in a plain map, run the app's calls through promise-run calls, and compare values as JSON text. */

/**
 * The session over a planted list (hshandbook R15, C7): the app's own
 * `addList` and `removeList`. Over the session, the passages and the
 * garden as the app builds them, with a plan made, a landed plant makes
 * the plan again over R7's pieces (`piecesWithListsModel`: the own, the
 * passages, the lists, the taught collections), and a landed uproot makes
 * it again without the list's verses that nothing else holds, every recall
 * kept on the disk; with no plan made, neither makes one. Over a session
 * that counts its makings, every other answer (`Held`, `Full`, `Invalid`,
 * `Unread`, `Failed`, `Absent`) makes none and each is answered as the
 * passages answer it.
 *
 * It catches `addList` or `removeList` without `session.remake`, a making
 * after an answer that changed nothing, and the session's pieces leaving
 * the lists out or putting them after the taught collections.
 */

import { describe, expect, it } from 'bun:test';
import { Clock, Effect, Exit, Layer, Logger, Option, Scope } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';

import { readPassage } from '../../vite/passage';
import { addList, removeList } from '../app';
import { Dictation } from '../dictation';
import { initial } from '../dictation/attempt';
import { Chime, layer as gardenLayer } from '../garden';
import { sourceWords } from '../matcher/words';
import {
  layer as passagesLayer,
  LISTS_KEY,
  PASSAGES_KEY,
  Passages,
  type PlantAnswer,
  type RemoveAnswer,
} from '../passages';
import { collectionsOf } from '../promises/taught';
import type { Recall } from '../sayit';
import { layer as sessionLayer, Session } from '../session/service';
import { keyOf, PREFIX } from '../test/garden-model';
import { HANDBOOK_MODEL, piecesWithListsModel } from '../test/handbook-model';
import type { Held, ModelTextPiece, Span } from '../test/passages-model';
import { CORPUS } from '../test/passages-rig';
import { withPhrasesRule } from '../test/phrase-model';

const words = (text: string) => sourceWords(text).length;

const PROMISE_TEXT = readPassage();

const PROMISE: ModelTextPiece = {
  reference: PROMISE_TEXT.reference,
  text: PROMISE_TEXT.text,
  words: words(PROMISE_TEXT.text),
  group: PROMISE_TEXT.reference,
};

const TAUGHT = ['protection'];

/** `A Seared Conscience`, 4 verses, and a passage over its first verse. */
const LIST = HANDBOOK_MODEL.get('bhb-2176');
const [BOOK = 0, CHAPTER = 0, VERSE = 0] = LIST?.places[0] ?? [];
const OVER: Span = { book: BOOK, chapter: CHAPTER, first: VERSE, last: VERSE };

const AT = Date.UTC(2026, 10, 9, 15);

const recallOn = (reference: string, startedAt: number): Recall => ({
  reference,
  startedAt,
  offset: 0,
  grade: 3,
  suggested: 3,
  words: 8,
  missed: 0,
  peeked: 0,
  extra: 0,
});

/** A disk with the passage over the list's first verse, no list, and recalls on the promise and on the list's last verse. */
const diskOf = () => {
  const disk = new Map<string, string>([[PASSAGES_KEY, JSON.stringify([OVER])]]);
  const last = LIST?.verses.at(-1) ?? '';
  for (const recall of [
    recallOn(PROMISE.reference, AT - 3 * 86_400_000),
    recallOn(last, AT - 2 * 86_400_000),
  ])
    disk.set(keyOf(recall), JSON.stringify(recall));
  return disk;
};

const storeOf = (disk: Map<string, string>) =>
  KeyValueStore.makeStringOnly({
    get: (key) => Effect.sync(() => disk.get(key)),
    set: (key, value) => Effect.sync(() => void disk.set(key, value)),
    remove: (key) => Effect.sync(() => void disk.delete(key)),
    clear: Effect.sync(() => disk.clear()),
    size: Effect.sync(() => disk.size),
    keys: Effect.sync(() => [...disk.keys()]),
  });

const nanos = (millis: number) => BigInt(millis) * 1_000_000n;

const CLOCK: Clock.Clock = {
  currentTimeMillisUnsafe: () => AT,
  currentTimeMillis: Effect.succeed(AT),
  currentTimeNanosUnsafe: () => nanos(AT),
  currentTimeNanos: Effect.succeed(nanos(AT)),
  monotonicTimeNanosUnsafe: () => nanos(AT),
  monotonicTimeNanos: Effect.succeed(nanos(AT)),
  sleep: () => Effect.void,
};

/** The session, the passages and the garden over `disk`, as `appLayer` builds them. */
const layerOf = (disk: Map<string, string>) =>
  sessionLayer([PROMISE], collectionsOf(TAUGHT)).pipe(
    Layer.provideMerge(passagesLayer),
    Layer.provideMerge(
      gardenLayer.pipe(Layer.provide(Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })))),
    ),
    Layer.provide(Layer.mock(Dictation)({ view: Effect.succeed(initial.view) })),
    Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, storeOf(disk))),
    Layer.provideMerge(Layer.merge(Layer.succeed(Clock.Clock, CLOCK), Logger.layer([]))),
  );

const launchOf = async (disk: Map<string, string>) => {
  const scope = Scope.makeUnsafe();
  const services = await Effect.runPromise(Layer.buildWithScope(layerOf(disk), scope));
  const run = <A>(effect: Effect.Effect<A, never, Session | Passages>) =>
    Effect.runPromise(Effect.provideContext(effect, services));
  return { run, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

const sessionNow = Effect.flatMap(Session, (session) => session.view);

/** The pieces the model wants with `lists` held beside the passage. */
const wanted = (lists: readonly string[]) => {
  const held: Held = { tag: 'Read', passages: [OVER], lists };
  return piecesWithListsModel(CORPUS, [PROMISE], held, TAUGHT, words, withPhrasesRule);
};

const recallsOn = (disk: ReadonlyMap<string, string>) =>
  [...disk.keys()].filter((key) => key.startsWith(PREFIX)).toSorted();

describe('a list planted and uprooted with a plan made', () => {
  it('makes the plan again over the passages, the list, then the taught collections, and again without the list, its recalls kept', async () => {
    const disk = diskOf();
    const recalls = recallsOn(disk);
    const live = await launchOf(disk);
    await live.run(Effect.flatMap(Session, (session) => session.begin));
    const before = await live.run(sessionNow);
    expect(Option.isSome(before.plan)).toBe(true);
    expect(JSON.stringify(before.pieces)).toBe(JSON.stringify(wanted([])));
    expect(await live.run(addList('bhb-2176'))).toBe('Added');
    const planted = await live.run(sessionNow);
    expect(JSON.stringify(planted.pieces)).toBe(JSON.stringify(wanted(['bhb-2176'])));
    expect(planted.pieces.some((piece) => piece.group === LIST?.title)).toBe(true);
    expect(disk.get(LISTS_KEY)).toBe('["bhb-2176"]');
    expect(await live.run(removeList('bhb-2176'))).toBe('Removed');
    const uprooted = await live.run(sessionNow);
    expect(JSON.stringify(uprooted.pieces)).toBe(JSON.stringify(wanted([])));
    expect(uprooted.pieces.some((piece) => piece.reference === LIST?.verses[0])).toBe(true);
    expect(uprooted.pieces.some((piece) => piece.reference === LIST?.verses.at(-1))).toBe(false);
    expect(recallsOn(disk)).toEqual(recalls);
    await live.close();
  });

  it('makes no plan when none was made', async () => {
    const disk = diskOf();
    const live = await launchOf(disk);
    expect(await live.run(addList('bhb-2176'))).toBe('Added');
    expect(Option.isNone((await live.run(sessionNow)).plan)).toBe(true);
    expect(await live.run(removeList('bhb-2176'))).toBe('Removed');
    expect(Option.isNone((await live.run(sessionNow)).plan)).toBe(true);
    await live.close();
  });
});

/** `effect` run over passages that answer `plant` and `uproot` with `answer`, and a session that counts its makings. */
const counted = <A>(
  name: string,
  answer: PlantAnswer | RemoveAnswer,
  effect: Effect.Effect<A, never, Passages | Session>,
) => {
  let makings = 0;
  const layer = Layer.merge(
    Layer.mock(Passages)({
      plant: () => Effect.succeed(answer as PlantAnswer),
      uproot: () => Effect.succeed(answer as RemoveAnswer),
    }),
    Layer.mock(Session)({ remake: Effect.sync(() => void (makings += 1)) }),
  );
  return Effect.map(Effect.provide(effect, layer), (got) => `${name} ${got} ${makings}`);
};

describe('the answers that change nothing', () => {
  it('make no plan, and each is answered as the passages answer it', async () => {
    const plants: PlantAnswer[] = ['Added', 'Held', 'Full', 'Invalid', 'Unread', 'Failed'];
    const uproots: RemoveAnswer[] = ['Removed', 'Absent', 'Unread', 'Failed'];
    const got = await Effect.runPromise(
      Effect.all([
        ...plants.map((answer) => counted('plant', answer, addList('bhb-2176'))),
        ...uproots.map((answer) => counted('uproot', answer, removeList('bhb-2176'))),
      ]),
    );
    expect(got).toEqual([
      'plant Added 1',
      'plant Held 0',
      'plant Full 0',
      'plant Invalid 0',
      'plant Unread 0',
      'plant Failed 0',
      'uproot Removed 1',
      'uproot Absent 0',
      'uproot Unread 0',
      'uproot Failed 0',
    ]);
  });
});
