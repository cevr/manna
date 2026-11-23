import type { Exit } from 'effect';

import type { BackAnswer, BackAsk, Stage } from './garden.d.ts';

/** The names the ask and the moved line give each stage. */
export declare const NAMED: Readonly<Record<Stage, string>>;

/** Move back's state: no ask, an ask open, an ask kept, the verse moved to a stage, or the step back refused. */
export type Bar =
  | { readonly status: 'Idle' }
  | { readonly status: 'Asking'; readonly ask: BackAsk }
  | { readonly status: 'Kept'; readonly ask: BackAsk }
  | { readonly status: 'Moved'; readonly ask: BackAsk; readonly stage: Stage }
  | { readonly status: 'Refused'; readonly ask: BackAsk };

/** A tap opening an ask, its Keep, or the garden's answer to an ask. */
export type Happened =
  | { readonly type: 'opened'; readonly ask: BackAsk }
  | { readonly type: 'kept' }
  | { readonly type: 'answered'; readonly ask: BackAsk; readonly answer: BackAnswer };

/** Move back before its first tap. */
export declare const IDLE: Bar;

/** The answer a run of the step back gives: its own when it succeeded, `Failed` for any failure. */
export declare const answerOf: (exit: Exit.Exit<BackAnswer, unknown>) => BackAnswer;

/** Move back's state after one happening. */
export declare const barAfter: (bar: Bar, happened: Happened) => Bar;

/** The ask's words for a verse and the stage its step back lands at. */
export declare const askLine: (reference: string, landing: Stage) => string;

/** The line a step back to a stage leaves. */
export declare const movedLine: (stage: Stage) => string;

/** The alert a refused step back of a verse leaves. */
export declare const alertLine: (reference: string) => string;

/** What decides whether Today offers Move back on a planted verse. */
export interface BackOffer {
  readonly listening: boolean;
  readonly recital: boolean;
  readonly done: boolean;
  readonly shownAll: boolean;
  readonly visited: boolean;
}

/** Whether Today offers Move back on a planted verse. */
export declare const offersBack: (at: BackOffer) => boolean;
