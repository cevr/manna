// oxlint-disable-next-line film/no-test-seam -- a test's own child process, never shipped: the seam is its subject
import { withDataHost } from '../data-host/testing.ts';

/**
 * What `probe.test.ts` starts in a process of its own: `effect`, `effect/persistence` and the runner loaded for the
 * first time inside `withDataHost`, so their module-level code meets the refused globals as Hermes's would; `ran`, or
 * the message the load threw. Printed.
 */
const loaded = withDataHost(() => {
  try {
    const modules = [require('effect'), require('effect/persistence'), require('./runner.ts')];
    if (modules.every(Boolean)) return 'ran';
    return 'a module loaded empty';
  } catch (thrown) {
    if (thrown instanceof Error) return thrown.message;
    return String(thrown);
  }
});
process.stdout.write(loaded);
