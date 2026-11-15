/** The storage Today reads and writes, as the test's stub gives it. */
interface Storage {
  readonly fs: {
    readonly readFile: (path: string) => PromiseLike<ArrayBuffer>;
    readonly atomicWriteFile: (path: string, bytes: Uint8Array) => PromiseLike<unknown>;
  };
}

/** Exact's store and native objects, which Today reads nothing of: the test passes them empty. */
type Empty = Readonly<Record<string, never>>;

/**
 * `app.ts`'s `answer` as the Bun tests call it: a source's name, its
 * arguments, Exact's store, storage and native objects; every source answers
 * an object (a screen, an answer, a reader). Exact's generated `Answer` (`app.contract.d.ts`) holds `app.ts` to
 * the Contract itself.
 */
export declare const answer: (
  source: string,
  args: ReadonlyArray<string | number | boolean | object>,
  store: Empty,
  storage: Storage,
  native: Empty,
  // oxlint-disable-next-line effect/noUnsafeDictionaryType -- each source answers its own object, which the test reads by the fields it checks; `app.contract.d.ts` types each one.
) => PromiseLike<Readonly<Record<string, unknown>>>;
