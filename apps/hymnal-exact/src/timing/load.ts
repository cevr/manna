/* oxlint-disable effect/noNullish, effect/noNewPromise -- Exact's data module cannot import effect (docs/exact.md): it answers a Promise, a read runs as one, and a hymn not read yet is undefined. */

/**
 * Each hymn's whole timing (its words' syllable times kept), read the first
 * time it is asked for and kept for the launch: the bundled timing keeps
 * only each line's flags, start and length (`files.ts`), so the follow
 * marks whole lines until the words arrive and syllables after
 * (`src/follow/sources.ts`). A hymn is read once however often it is asked:
 * a second ask while the read runs waits for the same one, an ask after it
 * arrived answers at once. A read that fails, or whose lines are not the
 * bundled ones (a stale or broken file), is kept as nothing, so the lines
 * stay marked whole, and the next ask (the hymn opened again) reads again.
 */

import { timelineOf } from '@manna/hymnal-app/follow/timeline';

import { linesOnly } from './files.ts';

/** A read of hymn `number`'s whole timing string; it rejects when the file cannot be read. */
export type ReadTiming = (number: number) => Promise<string>;

/** The loader over the bundled lines-only timing `bundled`, by hymn number. */
export const timingLoader = (bundled: ReadonlyMap<number, string>) => {
  const kept = new Map<number, string>();
  const reading = new Map<number, Promise<boolean>>();

  /** Hymn `number`'s words, read by `read` unless kept or already being read: whether they are here. */
  const load = (number: number, read: ReadTiming): Promise<boolean> => {
    if (kept.has(number)) return Promise.resolve(true);
    const lines = bundled.get(number);
    if (lines === undefined) return Promise.resolve(false);
    const going = reading.get(number);
    if (going !== undefined) return going;
    const next = Promise.resolve()
      .then(() => read(number))
      .then(
        (text) => {
          if (linesOnly(text) !== lines || timelineOf(text)._tag === 'None') return false;
          kept.set(number, text);
          return true;
        },
        () => false,
      )
      .finally(() => {
        reading.delete(number);
      });
    reading.set(number, next);
    return next;
  };

  return {
    load,
    /** Hymn `number`'s whole timing string once read; undefined before. */
    words: (number: number): string | undefined => kept.get(number),
  };
};

export type TimingLoader = ReturnType<typeof timingLoader>;
