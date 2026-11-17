/* oxlint-disable effect/noAsyncFunction, eslint/no-await-in-loop -- Exact's app folder cannot import effect (docs/exact.md): a test helper that awaits each answer in turn, as Contract sends the next only after the last lands. */

import type { FileStorage } from '@manna/exact-kit/storage';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import type { packSources, PacksAnswer } from '../packs/sources';

const STORE = { forget: () => {} };

/** What an ask comes to once every pack has settled: the last answer's kept line and failure, and every pack landed on the way, in the order they landed. */
export type PacksSettled = Omit<PacksAnswer, 'more'>;

/**
 * An ask as `features/packs.contract` follows it: `packsAsk`, then
 * `packsWait` with the kept line it answered while an answer says `more`,
 * each call started inside the data host.
 */
export const askSettled = async (
  sources: ReturnType<typeof packSources>['sources'],
  [kept, force, now]: readonly [string, boolean, number],
  storage: FileStorage,
): Promise<PacksSettled> => {
  let answer = await withDataHost(() => sources.packsAsk([kept, force, now], STORE, storage));
  const landed: Array<string> = [];
  for (;;) {
    landed.push(...answer.landed.split(' ').filter((name) => name !== ''));
    if (!answer.more) break;
    const last = answer.kept;
    answer = await withDataHost(() => sources.packsWait([last]));
  }
  return { kept: answer.kept, failed: answer.failed, landed: landed.join(' ') };
};
