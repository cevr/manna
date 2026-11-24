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

/** Where a shipped key stands (`shippedLoader`'s `stateOf`). */
export type ShippedState = 'kept' | 'mended' | 'missing' | 'unread';

/** A read of the file `name`'s text; it rejects when the file cannot be read. */
export type ReadShipped = (name: string) => Promise<string>;

/** Where the iOS app ships `folder`: `app.json` puts the folder `<folder>/` at `Resources/<folder>`. */
export const rootOf = (folder: string): string => `bundle:/Resources/${folder}`;

/**
 * How the app's own modules refuse an op none of their parts answers
 * (`modules/apple/Hymnal.swift`, `modules/web/index.js`: "Hymnal answers no
 * op <op>"), told apart from a read of an op they answer that failed (a
 * file that did not load). `src/shipped/unanswered.test.ts` holds both
 * modules to it.
 */
export const UNANSWERED = /answers no op/u;

/** The ops each app module has said it answers no read for, so their reads go to the bundle alone. */
const unanswered = new WeakMap<AppModule, Set<string>>();

/**
 * A read of `folder`'s files through a source's `storage` and `native`. The
 * app's module is asked first: the web's page module answers
 * `<folder>.read` (`native.later`) by importing the module shipped beside
 * it (`modules/web/<folder>/<name>.js`, written by `files.ts`), and a read
 * it fails is refused, never sent to Exact's storage, which refuses a read
 * of the app's files on the web. Only the module's own refusal of the op
 * (`UNANSWERED`) sends a read to the bundle: the iOS app's module answers no
 * such op, and the app reads the file it ships
 * (`bundle:/Resources/<folder>/<name>`, `app.json` `host.ios.resources`).
 * That refusal is kept for its module and op, so every later read of that
 * op goes to the bundle alone; reads asked together before the first
 * refusal lands each meet the same refusal and each read the bundle.
 */
export const readerOf =
  (
    folder: string,
    storage: ShippedFiles | null | undefined,
    native: AppModule | null | undefined,
  ): ReadShipped =>
  async (name) => {
    const op = `${folder}.read`;
    const fromFiles = async () => {
      if (storage?.fs === undefined) throw new Error(`no files to read ${folder}/${name} from`);
      return new TextDecoder().decode(await storage.fs.readFile(`${rootOf(folder)}/${name}`));
    };
    if (native?.available !== true || unanswered.get(native)?.has(op) === true) return fromFiles();
    try {
      const answer = await native.later({ op, n: name });
      if (typeof answer !== 'object' || answer === null || !('text' in answer))
        throw new Error(`the module answered no text for ${folder}/${name}`);
      if (typeof answer.text !== 'string')
        throw new Error(`the module answered no text for ${folder}/${name}`);
      return answer.text;
    } catch (refused) {
      if (!(refused instanceof Error) || !UNANSWERED.test(refused.message)) throw refused;
      const ops = unanswered.get(native) ?? new Set<string>();
      unanswered.set(native, ops.add(op));
      return fromFiles();
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
 * without it and the next ask reads again. `stateOf` tells a key kept from
 * the start or at its first read (`kept`), kept by a read after one that
 * failed (`mended`: what was answered without it is stale), not kept after
 * a failed read (`missing`), or never read (`unread`).
 */
export const shippedLoader = <K, V>(
  given: ReadonlyMap<K, V>,
  nameOf: (key: K) => string,
  accept: (text: string) => V | undefined,
) => {
  const kept = new Map(given);
  const reading = new Map<K, Promise<void>>();
  const missed = new Set<K>();
  const mended = new Set<K>();
  const view: ReadonlyMap<K, V> = kept;
  const stateOf = (key: K): ShippedState => {
    if (mended.has(key)) return 'mended';
    if (kept.has(key)) return 'kept';
    return missed.has(key) ? 'missing' : 'unread';
  };

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
          if (value === undefined) {
            missed.add(key);
            return;
          }
          kept.set(key, value);
          if (missed.delete(key)) mended.add(key);
        },
        () => {
          missed.add(key);
        },
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
    stateOf,
    /**
     * `answer()` now when `key`'s value is kept or `wanted` is false, else
     * once its read has settled, so a source answers once, with the value
     * when it could be read and without it when not.
     */
    after: <A>(
      key: K,
      wanted: boolean,
      read: ReadShipped,
      answer: () => A,
    ): A | Promise<Awaited<A>> =>
      !wanted || kept.has(key) ? answer() : load(key, read).then(() => Promise.resolve(answer())),
  };
};

export type ShippedLoader<K, V> = ReturnType<typeof shippedLoader<K, V>>;
