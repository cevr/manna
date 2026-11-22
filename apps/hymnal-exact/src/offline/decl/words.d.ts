/**
 * Every line and name Downloads draws, as the current app's
 * `offline/words.ts` says them. This file is
 * `@manna/hymnal-app/offline/words` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): that check stages a package's
 * declarations, never its source. `src/offline/sources.test.ts` assigns
 * each export the port reads to its declaration here.
 */
export type Counts = Readonly<
  Record<'saved' | 'printed' | 'bytes' | 'active' | 'queued' | 'partialBytes', number> &
    Record<'storage', boolean>
>;

export declare const RECORDINGS: number;
export declare const PROGRESS_LABEL: string;
export declare const progressText: (state: Pick<Counts, 'printed'>) => string;
export declare const sizeLabel: (state: Counts) => string;
export declare const sizeText: (state: Counts) => string;
export declare const busyOf: (state: Pick<Counts, 'active' | 'queued'>) => boolean;
export declare const activeLabel: (state: Counts) => string;
export declare const activeText: (state: Counts) => string;
export declare const INDEXING: string;
export declare const PAUSED: string;
export declare const failureOf: (state: Pick<Counts, 'storage'>) => string;
export declare const estimateText: (estimate: number) => string;
export declare const DOWNLOAD_ALL: string;
export declare const CANCEL: string;
export declare const DELETE: string;
export declare const CONFIRM_QUESTION: string;
export declare const CONFIRM: string;
export declare const KEEP: string;
