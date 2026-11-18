/* oxlint-disable effect/noAsyncFunction, effect/noNewPromise, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): a test helper that awaits each pack's answers in turn, as Contract sends a pack's next only after its last lands, every pack's at once. */

import type { FileStorage } from '@manna/exact-kit/storage';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import type { packSources, PacksAnswer } from '../packs/sources';

const STORE = { forget: () => {} };

/** What an ask comes to once every pack has settled: the last answer's kept line, whether any pack's last try failed, and every pack landed on the way, in the order they landed. */
export type PacksSettled = Omit<PacksAnswer, 'more' | 'at'>;

/**
 * An ask as `features/packs.contract` follows it: one `packsAsk` a pack,
 * all at once, then `packsWait` for that pack while its answer says
 * `more`, each call started inside the data host. Contract keeps the
 * kept line of the answer given last (`at`).
 */
export const askSettled = async (
  downloader: Pick<ReturnType<typeof packSources>, 'names' | 'sources'>,
  [kept, force, now]: readonly [string, boolean, number],
  storage: FileStorage,
): Promise<PacksSettled> => {
  const { sources } = downloader;
  let last = kept;
  let lastAt = 0;
  const landed: Array<string> = [];
  const settle = async (name: string) => {
    let answer = await withDataHost(() =>
      sources.packsAsk([name, last, force, now], STORE, storage),
    );
    for (;;) {
      if (answer.at > lastAt) {
        last = answer.kept;
        lastAt = answer.at;
      }
      if (answer.landed !== '') landed.push(answer.landed);
      if (!answer.more) return answer.failed;
      answer = await withDataHost(() => sources.packsWait([name, last]));
    }
  };
  const failed = await Promise.all(downloader.names.map(settle));
  return { kept: last, failed: failed.some(Boolean), landed: landed.join(' ') };
};
