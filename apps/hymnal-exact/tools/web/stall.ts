/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noNewPromise, effect/noTryCatch -- a host script's watchdog over a drive's checks: its timer is the host's, and a check is an awaited function that may throw or never settle; it never runs in the data module. */

/** How a watched check ended. */
export type Ended =
  | { readonly ended: 'done' }
  | { readonly ended: 'threw'; readonly step: string; readonly error: string }
  | { readonly ended: 'stalled'; readonly step: string; readonly idleMs: number };

export interface Stall {
  /** The step the running check is at; the watchdog counts from here. */
  readonly mark: (step: string) => void;
  /** `check` run until it settles or stalls. */
  readonly watch: (check: () => Promise<unknown>) => Promise<Ended>;
}

/**
 * A drive's checks under a stall watchdog, looking every `everyMs`: each
 * helper a check awaits marks its step, and a check that marks no step for
 * `stallMs` ends `stalled` with the step it was last at, so a wait that
 * never resolves fails within the bound with its check and step named
 * instead of hanging the drive. A long check stays alive while it makes
 * steps, so the bound holds at any load and any count of addresses.
 */
export const makeStall = (stallMs: number, everyMs = Math.min(1000, stallMs)): Stall => {
  let step = 'start';
  let at = Date.now();
  const mark = (next: string) => {
    step = next;
    at = Date.now();
  };
  const watch = async (check: () => Promise<unknown>): Promise<Ended> => {
    mark('start');
    let stall: (ended: Ended) => void = () => {};
    const stalled = new Promise<Ended>((resolve) => {
      stall = resolve;
    });
    const timer = setInterval(() => {
      const idleMs = Date.now() - at;
      if (idleMs >= stallMs) stall({ ended: 'stalled', step, idleMs });
    }, everyMs);
    const settled = (async (): Promise<Ended> => {
      try {
        await check();
        return { ended: 'done' };
      } catch (error) {
        return { ended: 'threw', step, error: String(error) };
      }
    })();
    try {
      return await Promise.race([settled, stalled]);
    } finally {
      clearInterval(timer);
    }
  };
  return { mark, watch };
};
