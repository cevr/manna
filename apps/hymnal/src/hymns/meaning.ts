/**
 * Meaning search, with no model at run time: the hymns about a query, and
 * the hymns like a hymn.
 *
 * The app ships a word table distilled from EmbeddingGemma (each word's
 * vector, the model run on the word alone, at 4 bits a value) and each
 * hymn's vector (the model run on its title and words, at 8 bits a value):
 * `assets/meaning/meaning.js`, built by `packages/hymnal/scripts/meaning`,
 * whose `table.ts` gives the format. The rule over it is `meaning-rule.ts`,
 * which this module hands the shipped table.
 *
 * The table's strings are read on the first call (`table`), never at
 * start; a query decodes only its own words' rows.
 */

import { Duration, Effect, Fiber, Option } from 'effect';

import { meaning } from '../../assets/meaning/meaning.js';
import { ABOUT, aboutIn, aboutQueryIn, moreLikeIn, type Table, tableOf } from './meaning-rule';

export { ABOUT };

/**
 * The table, read the first time it is asked for and kept. Search mode and
 * the hymn page read it soon after they open (`readMeaningSoon`), so
 * neither a keystroke's pause nor the About sheet pays for it.
 */
const table: () => Table = (() => {
  let read = Option.none<Table>();
  return () =>
    Option.getOrElse(read, () => {
      const made = tableOf(meaning());
      read = Option.some(made);
      return made;
    });
})();

/**
 * Lets the thread go before the read: a timer of 1 ms is a task of its own.
 * `Effect.sleep(Duration.zero)` is `Effect.yieldNow`, which runs on
 * `setImmediate`, and React Native runs `setImmediate` as a microtask of the
 * same task, so it would let no frame run.
 */
const READ_AFTER = Duration.millis(1);

/**
 * Reads the table in a timer task after the one that asks, if it is not read
 * yet, so the next meaning search does not. The task that asks never holds the
 * thread for the read (about 55 ms in Hermes), and a frame can run between
 * them. Returns the cancel, for an effect's cleanup.
 */
export const readMeaningSoon = (): (() => void) => {
  const read = Effect.runFork(
    Effect.sleep(READ_AFTER).pipe(Effect.andThen(Effect.sync(() => void table()))),
  );
  return () => void Effect.runFork(Fiber.interrupt(read));
};

/** The hymns about `query`, `count` at most, the nearest first; none when the table knows none of its words. */
export const about = (query: string, count = 10): ReadonlyArray<number> =>
  aboutIn(table, query, count);

/** How long search mode waits after the last keystroke before it looks for the hymns about the query, in ms. */
export const PAUSE = 150;

/**
 * `query`, once it has stood `PAUSE` ms: search mode runs it on each
 * keystroke and interrupts the one before, so only a pause in the typing
 * asks for the hymns about the query.
 */
export const afterPause = (query: string): Effect.Effect<string> =>
  Effect.as(Effect.sleep(Duration.millis(PAUSE)), query);

/**
 * The hymns about `asked` that search mode shows under the results of
 * `shown`: none while the two differ, so an older query's hymns never stand
 * under a newer query's matches.
 */
export const aboutShown = <A>(
  asked: string,
  shown: string,
  hymns: ReadonlyArray<A>,
): ReadonlyArray<A> =>
  Option.getOrElse(
    Option.liftPredicate(hymns, () => asked === shown),
    () => [],
  );

/**
 * The hymns search mode shows about `query`: none for a query that holds a
 * digit (a number asked for, `no 100`) or has under three letters (a word
 * still being typed), else `about`'s `ABOUT`.
 */
export const aboutQuery = (query: string): ReadonlyArray<number> => aboutQueryIn(table, query);

/** The hymns most like hymn `number`, `count` at most, the nearest first; none for a number the table lacks. */
export const moreLike = (number: number, count = 10): ReadonlyArray<number> =>
  moreLikeIn(table, number, count);
