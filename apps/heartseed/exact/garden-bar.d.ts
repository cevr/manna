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

/** Move back's state after one happening. */
export declare const barAfter: (bar: Bar, happened: Happened) => Bar;
