/* oxlint-disable effect/noGlobals -- a slow test's script runs in a Bun process of its own, spawned synchronously at the file's top, outside any Effect; what it says reaches the test run's own stderr. */

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
