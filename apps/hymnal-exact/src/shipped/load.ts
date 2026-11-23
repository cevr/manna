/* oxlint-disable effect/noNullish, effect/noAsyncFunction, effect/noTryCatch, effect/noThrowStatement, effect/noRuntimeTypeof, effect/noNewError, effect/noNewPromise, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md): a read answers a Promise, a refused read of the app's files is the web's answer that it ships them beside the page instead, the page module's answer is checked where it arrives, and a source answers now or after the read plainly. */

/** The one call of Exact's `storage` a read makes: a file the app ships. */
export interface ShippedFiles {
  readonly fs: { readonly readFile: (path: string) => Promise<ArrayBuffer> };
}

/** The app's module (`native`): the page module on the web. */
export interface AppModule {
  readonly available: boolean;
  readonly later: (request: Readonly<Record<string, string | number>>) => Promise<unknown>;
}

/** A read of the file `name`'s text; it rejects when the file cannot be read. */
export type ReadShipped = (name: string) => Promise<string>;

/** Where the iOS app ships `folder`: `app.json` puts the folder `<folder>/` at `Resources/<folder>`. */
export const rootOf = (folder: string): string => `bundle:/Resources/${folder}`;

/**
 * A read of `folder`'s files through a source's `storage` and `native`: the
 * iOS app reads the file it ships (`bundle:/Resources/<folder>/<name>`,
 * `app.json` `host.ios.resources`); the web, whose read of the app's files
 * is refused, asks the page module (`native.later`, `<folder>.read`), which
 * imports the module shipped beside it (`modules/web/<folder>/<name>.js`,
 * written by `files.ts`).
 */
export const readerOf =
  (
    folder: string,
    storage: ShippedFiles | null | undefined,
    native: AppModule | null | undefined,
  ): ReadShipped =>
  async (name) => {
    try {
      if (storage?.fs === undefined) throw new Error(`no files to read ${folder}/${name} from`);
      return new TextDecoder().decode(await storage.fs.readFile(`${rootOf(folder)}/${name}`));
    } catch (refused) {
      if (native?.available !== true) throw refused;
      const answer = await native.later({ op: `${folder}.read`, n: name });
      if (typeof answer !== 'object' || answer === null || !('text' in answer)) throw refused;
      if (typeof answer.text !== 'string') throw refused;
      return answer.text;
    }
  };

/**
 * Data the app ships beside the data module rather than in it, read the
 * first time a source needs it and kept for the launch, by key, those in
 * `given` kept from the start (a test gives what the build would ship);
 * `nameOf` is a key's file name, `accept` a file's value from its text, or
 * undefined to refuse it. A key is read once however often it is asked: a
 * second ask while the read runs waits for the same one. A read that fails,
 * or whose text `accept` refuses, keeps nothing, so the source answers as
 * without it and the next ask reads again.
 */
export const shippedLoader = <K, V>(
  given: ReadonlyMap<K, V>,
  nameOf: (key: K) => string,
  accept: (text: string) => V | undefined,
) => {
  const kept = new Map(given);
  const reading = new Map<K, Promise<void>>();
  const view: ReadonlyMap<K, V> = kept;

  /** `key`'s file read by `read` unless kept or already being read; it settles once the read has, kept or not. */
  const load = (key: K, read: ReadShipped): Promise<void> => {
    if (kept.has(key)) return Promise.resolve();
    const going = reading.get(key);
    if (going !== undefined) return going;
    const next = Promise.resolve()
      .then(() => read(nameOf(key)))
      .then(
        (text) => {
          const value = accept(text);
          if (value !== undefined) kept.set(key, value);
        },
        () => undefined,
      )
      .finally(() => {
        reading.delete(key);
      });
    reading.set(key, next);
    return next;
  };

  return {
    /** The values read so far, by key. */
    kept: view,
    load,
    /**
     * `answer()` now when `key`'s value is kept or `wanted` is false, else
     * once its read has settled, so a source answers once, with the value
     * when it could be read and without it when not.
     */
    after: <A>(key: K, wanted: boolean, read: ReadShipped, answer: () => A): A | Promise<A> =>
      !wanted || kept.has(key) ? answer() : load(key, read).then(answer),
  };
};

export type ShippedLoader<K, V> = ReturnType<typeof shippedLoader<K, V>>;
