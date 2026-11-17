/* oxlint-disable effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): the data host's `scheduler` is a global the DOM's types do not name, read once as the shape it has, a Bun test, which has none, goes on at once, and each step waits for the turn before it by design. */

/**
 * Work cut into steps, so a pack's check never holds one turn of the data
 * host past its budget (100 ms of CPU on Hermes; docs/reference.md of
 * Exact, "On Hermes each turn of an answer has 100 ms"): a generator whose
 * every `yield` is a place its turn may end. `inTurns` runs it with
 * `scheduler.yield()` between steps, as the downloader does; `atOnce` runs
 * it whole, as the step's reference model and the build do. A step does at
 * most `SLICE` code units of hashing, or one native call (`JSON.parse`, a
 * decode), whichever it is.
 */
export type Paced<T> = Generator<undefined, T, undefined>;

/** The code units one step hashes. */
export const SLICE = 131_072;

/** `paced` run whole, in this turn. */
export const atOnce = <T>(paced: Paced<T>): T => {
  let next = paced.next();
  while (next.done !== true) next = paced.next();
  return next.value;
};

/** The data host's `scheduler`, where it has one. */
const hostScheduler = (
  globalThis as { readonly scheduler?: { readonly yield?: () => Promise<void> } }
).scheduler;

/** Ends this turn of the data host, where it has turns; else goes on at once. */
export const nextTurn = (): Promise<void> => hostScheduler?.yield?.() ?? Promise.resolve();

/** `paced` run a step a turn, `pause` between steps (`nextTurn` by default). */
export const inTurns = async <T>(
  paced: Paced<T>,
  pause: () => Promise<void> = nextTurn,
): Promise<T> => {
  let next = paced.next();
  while (next.done !== true) {
    await pause();
    next = paced.next();
  }
  return next.value;
};

const FNV_START = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;
const NEWLINE = 10;

/** `sumOf(texts.join('\n'))`, hashed `SLICE` code units a step, with no joined copy. */
export function* sumPaced(texts: ReadonlyArray<string>): Paced<number> {
  let hash = FNV_START;
  let room = SLICE;
  for (let index = 0; index < texts.length; index++) {
    if (index > 0) hash = Math.imul(hash ^ NEWLINE, FNV_PRIME);
    const text = texts[index] ?? '';
    let at = 0;
    while (at < text.length) {
      if (room === 0) {
        yield undefined;
        room = SLICE;
      }
      const take = Math.min(text.length - at, room);
      const end = at + take;
      for (; at < end; at++) hash = Math.imul(hash ^ text.charCodeAt(at), FNV_PRIME);
      room -= take;
    }
  }
  return hash >>> 0;
}
