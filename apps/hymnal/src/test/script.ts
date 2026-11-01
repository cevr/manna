/* oxlint-disable effect/noGlobals -- a slow test's script runs in a Bun process of its own, spawned synchronously at the file's top, outside any Effect; what it says reaches the test run's own stderr. */

/**
 * Runs a test script in a `bun` process of its own, under a wall-clock limit.
 *
 * A slow test file runs the phone's scripts (`phone-list.tsx`, `phone-pager.tsx`,
 * `list-feel.tsx`) with a synchronous spawn, which blocks the event loop: no
 * case's timeout can end it. So the limit is the spawn's own. At the limit the
 * child is ended with `SIGKILL`, and `stderr` gains one line that names the
 * script, its arguments and the limit; a child that exits non-zero gains one
 * line with its exit. Each such line is also written to the test run's own
 * `stderr`, so a file whose cases read only `stdout` still shows it.
 */

/** What a script wrote, and whether its limit ended it. */
export interface ScriptRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly ended: boolean;
}

export const runScript = (
  script: string,
  args: ReadonlyArray<string> = [],
  limitMs = 60_000,
): ScriptRun => {
  const run = Bun.spawnSync(['bun', script, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: limitMs,
    killSignal: 'SIGKILL',
  });
  const named = [script, ...args].join(' ');
  const ended = run.exitedDueToTimeout === true;
  let said = '';
  if (ended) said = `${named} ran past ${limitMs / 1000} s and was ended\n`;
  else if (run.exitCode !== 0) said = `${named} exited ${run.exitCode ?? run.signalCode}\n`;
  if (said !== '') process.stderr.write(said);
  return { stdout: run.stdout.toString(), stderr: `${run.stderr.toString()}${said}`, ended };
};
