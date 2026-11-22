/* oxlint-disable effect/noNullish, effect/noAsyncFunction, effect/noTryCatch, effect/noThrowStatement, effect/noRuntimeTypeof -- Exact's data module cannot import effect (docs/exact.md): it answers a Promise; a refused read of the app's files is the web's answer that it ships them beside the page instead, not a defect, and the page module's answer is checked where it arrives, a read it cannot make rejected as the file's own would be. */

/**
 * The timing's one source, as `app.ts` registers it:
 * `timingLoad(number)` reads hymn `number`'s words' times on its first use
 * (`features/timing.contract` asks for the page shown and the hymn the
 * player holds) and answers whether they are here, so the follow is told
 * again and marks syllables (`load.ts`). The iOS app reads the file it
 * ships (`bundle:/Resources/timing/<n>`); the web, whose read of the app's
 * files is refused, asks the page module (`native.later`, `timing.read`),
 * which imports the file shipped beside it.
 */

import { TIMING_ROOT } from './files.ts';
import type { TimingLoader } from './load.ts';

/** Whether hymn `number`'s words are here. */
export interface TimingLoaded {
  readonly number: number;
  readonly loaded: boolean;
}

/** The one call of Exact's `storage` the timing makes: a read of a file the app ships. */
interface ShippedFiles {
  readonly fs: { readonly readFile: (path: string) => Promise<ArrayBuffer> };
}

/** The app's module (`native`): the page module's `timing.read` on the web. */
interface AppModule {
  readonly available: boolean;
  readonly later: (request: Readonly<Record<string, string | number>>) => Promise<unknown>;
}

/** Exact's kept values, which the timing does not read. */
interface KeptValues {
  readonly get: (name: string) => string | null;
}

/** A read of hymn `number`'s file: the app's own files, else the page module's. */
const readerOf =
  (storage: ShippedFiles, native: AppModule | null | undefined) =>
  async (number: number): Promise<string> => {
    try {
      return new TextDecoder().decode(await storage.fs.readFile(`${TIMING_ROOT}/${number}`));
    } catch (refused) {
      if (native?.available !== true) throw refused;
      const answer = await native.later({ op: 'timing.read', n: number });
      if (typeof answer !== 'object' || answer === null || !('text' in answer)) throw refused;
      if (typeof answer.text !== 'string') throw refused;
      return answer.text;
    }
  };

export const timingSources = (loader: TimingLoader) => ({
  timingLoad: async (
    [number]: readonly [number],
    _store: KeptValues,
    storage: ShippedFiles,
    native?: AppModule | null,
  ): Promise<TimingLoaded> => ({
    number,
    loaded: number > 0 && (await loader.load(number, readerOf(storage, native))),
  }),
});
