/* oxlint-disable effect/noAsyncFunction, effect/noTryCatch, effect/noAs, effect/noGlobals, effect/noTernary, effect/noUnknownParameters -- Exact's app folder cannot import effect (docs/exact.md), so no Schema codec: a probe does the downloader's own `JSON.parse` and `JSON.stringify` to time them, a kept file that is not there is an answer of no work, not a defect, and a parsed pack is read as the record its writer wrote. */

/**
 * A driver's measure of the downloader's turns on a device: the data host
 * refuses a turn over its budget and names the turn's own CPU time, so a
 * turn that does one step of a pack's check `times` times over is refused
 * with `times` that step's cost in its words (`tools/drive-studydata.ts
 * ios turns` reads them from the log). The steps are the downloader's own:
 * a body's decode, its parse, the word index written again for its sum,
 * `SLICE` code units hashed, a body's encode for its write. Asked only by
 * a driver's launch that names `HEARTSEED_TURN_PROBE` (`app.ts`).
 */

import type { FileStorage } from '@manna/exact-kit/storage';

import { atOnce, nextTurn, SLICE, sumPaced } from '../packs/paced';
import type { ExactStore } from '../packs/sources';

/** What a probe did: the step and how many times, in a turn the host let pass. */
export interface StudyTurn {
  readonly piece: string;
  readonly times: number;
}

/** One step done once, its result's size, so no step is left undone. */
const once = (piece: string, bytes: ArrayBuffer, body: string, parsed: unknown): number => {
  switch (piece) {
    case 'decode':
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes).length;
    case 'parse':
      return Object.keys(JSON.parse(body) as object).length;
    case 'write':
      return JSON.stringify((parsed as { readonly find?: unknown }).find ?? parsed).length;
    case 'slice':
      return atOnce(sumPaced([body.slice(0, SLICE)])) + 1;
    default:
      return new TextEncoder().encode(body).length;
  }
};

/** The probe's sources: whether a launch probes (`studyTurning`), and `studyTurn(file, piece, times, mark)`, which does nothing on a launch that does not. */
export const turnSources = (probing: boolean) => ({
  studyTurning: () => ({ on: probing }),
  studyTurn: async (
    [file, piece, times, mark]: readonly [string, string, number, string],
    _store: ExactStore,
    storage: FileStorage,
  ): Promise<StudyTurn> => {
    if (!probing || mark === '') return { piece, times: 0 };
    let bytes: ArrayBuffer;
    try {
      bytes = await storage.fs.readFile(file);
    } catch {
      return { piece, times: 0 };
    }
    const body = new TextDecoder().decode(bytes);
    await nextTurn();
    const parsed: unknown = piece === 'write' ? JSON.parse(body) : {};
    await nextTurn();
    let done = 0;
    for (let time = 0; time < times; time++) if (once(piece, bytes, body, parsed) > 0) done++;
    return { piece, times: done };
  },
});
