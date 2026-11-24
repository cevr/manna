/**
 * How a drive's browser close went, told only from what the browser itself
 * did. Playwright's close of a persistent context settles both when Chrome
 * shut down as a person's closing it does and when its `Browser.close`
 * failed and Playwright killed the process instead; only Chrome's own
 * shutdown record in the profile tells them apart, since a killed Chrome
 * writes nothing.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A close asked of the browser. `closed` only when the close succeeded and
 * the browser was then seen to have shut down cleanly (`cleanExitSince`);
 * `killed` when the close succeeded with no such record; `refused` when the
 * close failed; `late` when it had not settled in `CLOSE_MS`. Only `closed`
 * witnesses a shutdown.
 */
export type Closed = 'closed' | 'killed' | 'refused' | 'late';

/** How long a close may take before it counts as `late`. */
export const CLOSE_MS = 10_000;

/** What `closing` (a close of the browser) came to within `ms`: `closed` only when it succeeded and `shutdown` then answers that the browser recorded its own clean exit. */
export const closeOutcome = (
  closing: () => Promise<unknown>,
  shutdown: () => boolean,
  ms = CLOSE_MS,
): Promise<Closed> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Closed>((resolve) => {
    timer = setTimeout(() => resolve('late'), ms);
  });
  const settled = Promise.resolve()
    .then(closing)
    .then(
      (): Closed => (shutdown() ? 'closed' : 'killed'),
      (): Closed => 'refused',
    );
  return Promise.race([settled, late]).finally(() => clearTimeout(timer));
};

/** The profile's shutdown record: Chrome writes `Default/Preferences` as it exits cleanly, with `profile.exit_type` `Normal`. */
const PREFERENCES = join('Default', 'Preferences');

/** Whether Chrome recorded a clean exit in `profile` at or after `since` (epoch ms): its Preferences written since then, saying `Normal`. */
export const cleanExitSince = (profile: string, since: number): boolean => {
  const file = join(profile, PREFERENCES);
  if (!existsSync(file) || statSync(file).mtimeMs < since) return false;
  return /"exit_type"\s*:\s*"Normal"/u.test(readFileSync(file, 'utf8'));
};
