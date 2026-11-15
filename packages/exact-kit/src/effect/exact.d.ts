import type { Effect } from 'effect';

/** What Exact hands a source call: its time (`time.epochAtZero + performanceNow()`) and a seed (`time.seed`). */
export interface Call {
  readonly now: number;
  readonly seed: number;
}

/** How a call waits out a sleep, and how each step of its fibers runs (`runner.ts`). */
export interface Host {
  readonly wait?: (millis: number) => Promise<void>;
  readonly turn?: <A>(run: () => A) => A;
}

/** Runs `effect` for one Exact call on the call's clock, seed and scheduler (`runner.ts`). */
export declare const runCall: <A, E>(
  effect: Effect.Effect<A, E>,
  call: Call,
  host?: Host,
) => Promise<A>;

/** `runCall` with time that jumps to each sleep's deadline at once, for a source that answers now (`runner.ts`). */
export declare const runCallSync: <A, E>(
  effect: Effect.Effect<A, E>,
  call: Call,
  host?: Pick<Host, 'turn'>,
) => A;
