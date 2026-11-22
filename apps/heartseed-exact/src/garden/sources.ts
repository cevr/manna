/* oxlint-disable effect/noNewPromise -- Exact calls a source for a Promise: the drive flag is answered at once. */

/**
 * The garden's data sources, as `app.ts` registers them. Each is one call
 * of `program.ts` through the runner (`runCall`), on the call's clock and
 * seed, one at a time behind every garden call before it (`writes.ts`).
 * Time and the zone come from the call's arguments alone: `now` is
 * `time.epochAtZero + performanceNow()`, `offset` is `time.utcOffset`, and
 * `seed` is `time.seed`. A change's arguments are decoded first, and one
 * that does not decode answers `Invalid` and writes nothing.
 */

import { runCall, type Host } from '@manna/exact-kit/effect';
import type { FileStorage } from '@manna/exact-kit/storage';
import { Effect, Logger, Option, Schema } from 'effect';

import { rowNamed } from '../add/shelves';
import {
  joinRange,
  moveBack,
  plantList,
  plantRange,
  readGarden,
  recallVerse,
  removeById,
} from './program';
import { SHORT_LINE } from '@manna/heartseed/chooser';
import type { Stage } from '@manna/heartseed/garden';
import { STAGE_NAMES } from '@manna/heartseed/garden/names';
import { shownOf, verseIn, type At, type GardenShown, type GardenVerse } from './view';
import { makeQueue, oneAtATime } from './writes';

/** How the sources run their calls: the runner's host (Exact's own by default), and whether the services' logs are dropped. */
export interface GardenOptions {
  readonly host?: Host;
  readonly quiet?: boolean;
  readonly driven?: boolean;
}

/** A change's answer, and the line it shows: a list too short, none for the rest (a limit has its own line on the read). */
export interface GardenChange {
  answer: string;
  line: string;
}

/** Whether the launch is a driver's, which shows the test controls. */
export interface GardenDriven {
  on: boolean;
}

/** The line `answer` shows. */
const lineOf = (answer: string) => {
  if (answer === 'Short') return SHORT_LINE;
  return '';
};

/** A change to one verse's answer, and the verse after it. */
export interface GardenVerseChange {
  answer: string;
  verse: GardenVerse;
}

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const Grade = Schema.Literals([1, 2, 3, 4]);

/** Whether Contract's `text` names a stage: one the current Heartseed names. */
const isStage = (text: string): text is Stage => Object.hasOwn(STAGE_NAMES, text);

/** A recall as Contract hands it: SayIt's recall of the verse, its peeks at rest counted. */
const RecallArg = Schema.Struct({
  startedAt: Count,
  offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1080), Schema.isLessThanOrEqualTo(1080)),
  grade: Grade,
  suggested: Schema.Literals([1, 2, 3]),
  words: Count,
  missed: Count,
  peeked: Count,
  extra: Count,
});

/** The help taken before the try, as Contract hands it: no Show all is `null`, no help at all is no peek, no Show all and a cap of Easy. */
const HelpArg = Schema.Struct({
  peeked: Schema.Array(Count),
  shownAt: Schema.NullOr(Count),
  cap: Grade,
});

/** Exact's `Store` argument, as much of it as names it: the garden keeps nothing there. */
interface ExactStore {
  readonly forget: (name: string) => void;
}

/** A source as Exact calls it: its arguments, the store, the storage. */
type Source<A, B> = (args: A, store: ExactStore, storage: FileStorage) => Promise<B>;

/** The garden's sources, with the queue of one launch of the data module. */
export const gardenSources = (options: GardenOptions = {}) => {
  const queue = makeQueue();
  const logged = <A>(program: Effect.Effect<A>) => {
    if (options.quiet === true) return Effect.provide(program, Logger.layer([]));
    return program;
  };
  const run = <A>(program: Effect.Effect<A>, now: number, seed: number) =>
    oneAtATime(queue, () => runCall(logged(program), { now, seed }, options.host));
  const at = (now: number, offset: number): At => ({ now, offset });
  const invalid = (now: number, offset: number) =>
    run(
      Effect.succeed<GardenVerseChange>({
        answer: 'Invalid',
        verse: verseIn({ _tag: 'Unread' }, '', at(now, offset)),
      }),
      now,
      0,
    );

  const gardenRead: Source<readonly [number, number, number], GardenShown> = (
    [offset, now, seed],
    _store,
    storage,
  ) =>
    run(
      Effect.map(readGarden(storage), (held) => shownOf(held, at(now, offset))),
      now,
      seed,
    );

  const gardenPlant: Source<
    readonly [number, number, number, number, number, number, number],
    GardenChange
  > = ([book, chapter, first, last, now, _offset, seed], _store, storage) =>
    run(
      Effect.map(plantRange(storage, { book, chapter, first, last }), ({ answer }) => ({
        answer,
        line: lineOf(answer),
      })),
      now,
      seed,
    );

  const gardenJoin: Source<
    readonly [number, number, number, number, number, number, number],
    GardenChange
  > = ([book, chapter, first, last, now, _offset, seed], _store, storage) =>
    run(
      Effect.map(joinRange(storage, { book, chapter, first, last }), ({ answer }) => ({
        answer,
        line: '',
      })),
      now,
      seed,
    );

  const gardenRemove: Source<readonly [string, number, number, number], GardenChange> = (
    [id, now, _offset, seed],
    _store,
    storage,
  ) =>
    run(
      Effect.map(removeById(storage, id), ({ answer }) => ({ answer, line: '' })),
      now,
      seed,
    );

  const gardenRecall: Source<
    readonly [string, unknown, unknown, number, number, number],
    GardenVerseChange
  > = ([reference, recall, help, now, offset, seed], _store, storage) =>
    Option.match(
      Option.all([
        Schema.decodeUnknownOption(RecallArg)(recall),
        Schema.decodeUnknownOption(HelpArg)(help),
      ]),
      {
        onNone: () => invalid(now, offset),
        onSome: ([kept, taken]) =>
          run(
            Effect.map(recallVerse(storage, reference, kept, Option.some(taken)), (result) => ({
              answer: result.answer,
              verse: verseIn(result.held.garden, reference, at(now, offset)),
            })),
            now,
            seed,
          ),
      },
    );

  const gardenBack: Source<readonly [string, number, number, number], GardenVerseChange> = (
    [reference, now, offset, seed],
    _store,
    storage,
  ) =>
    run(
      Effect.map(moveBack(storage, reference), (result) => ({
        answer: result.answer,
        verse: verseIn(result.held.garden, reference, at(now, offset)),
      })),
      now,
      seed,
    );

  const gardenBackFrom: Source<
    readonly [string, string, number, number, number],
    GardenVerseChange
  > = ([reference, from, now, offset, seed], _store, storage) =>
    Option.match(Option.liftPredicate(from, isStage), {
      onNone: () => invalid(now, offset),
      onSome: (stage) =>
        run(
          Effect.map(moveBack(storage, reference, Option.some(stage)), (result) => ({
            answer: result.answer,
            verse: verseIn(result.held.garden, reference, at(now, offset)),
          })),
          now,
          seed,
        ),
    });

  const gardenDrive = () => Promise.resolve<GardenDriven>({ on: options.driven === true });

  const addPlant: Source<readonly [string, number, number, number], GardenChange> = (
    [slug, now, _offset, seed],
    _store,
    storage,
  ) =>
    Option.match(rowNamed(slug), {
      onNone: () => run(Effect.succeed({ answer: 'Invalid', line: '' }), now, seed),
      onSome: ({ list }) =>
        run(
          Effect.map(plantList(storage, list), ({ answer }) => ({ answer, line: '' })),
          now,
          seed,
        ),
    });

  return {
    addPlant,
    gardenRead,
    gardenPlant,
    gardenJoin,
    gardenRemove,
    gardenRecall,
    gardenBack,
    gardenBackFrom,
    gardenDrive,
  };
};
