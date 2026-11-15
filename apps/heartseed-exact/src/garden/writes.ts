/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise -- Exact's data module answers a Promise, and an answer is carried across an `await` alone (docs/exact-data-layer.md, rule 6), so the queue waits by `await`, never in a `.then`. */

/**
 * The queue of one launch of the data module, so garden calls run one at a
 * time in the order they came: `last` is the end of the last call queued.
 * Each call builds its own store over the one file and its own services,
 * so the current app's lock (a `Semaphore` in the garden's layer) orders
 * nothing across calls; two answers interleave at their awaits, and a call
 * that read the file before another wrote it would write its old entries
 * back over the other's change. So every garden source, reads too, runs
 * inside `oneAtATime`. The protocol and its two properties, no lost update
 * and no half-seen write, are `writes.qnt`, walked whole by
 * `writes.test.ts`.
 */
interface Queue {
  last: Promise<void>;
}

/** A queue with no call in it. */
export const makeQueue = (): Queue => ({ last: Promise.resolve() });

/** `run` once every call queued on `queue` before it has ended, however it ended; its answer, or its failure. */
export const oneAtATime = async <A>(queue: Queue, run: () => Promise<A>): Promise<A> => {
  const before = queue.last;
  let release = (): void => {};
  queue.last = new Promise<void>((resolve) => {
    release = resolve;
  });
  await before;
  const [ended] = await Promise.allSettled([run()]);
  release();
  if (ended.status === 'rejected') return Promise.reject(ended.reason);
  return ended.value;
};
