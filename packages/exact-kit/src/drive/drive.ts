/** A process the drive started, in a process group of its own: its pid, and its end. */
interface Started {
  readonly pid: number;
  readonly ended: Promise<{
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
  }>;
}

/**
 * What a drive does to the machine: start a command in a group of its own, send a signal, wait. `bunProcesses` is
 * the real one; a test hands a stand-in.
 */
interface Processes {
  readonly spawn: (argv: ReadonlyArray<string>, cwd: string) => Started;
  readonly signal: (pid: number, signal: 'SIGTERM') => void;
  readonly sleep: (ms: number) => Promise<void>;
}

/** Whether `line` of an agent's output is one of its JSON replies. */
const isReply = (line: string) =>
  line.startsWith('{') ||
  line.startsWith('[') ||
  line.startsWith('"') ||
  line === 'null' ||
  /^[-\d]|^true$|^false$/u.test(line);

/** Whether `pid` names one process a drive may signal: never 0, 1, a group's negative or a broadcast. */
const isOwnPid = (pid: number) => Number.isInteger(pid) && pid > 1;

/** What a drive is told: its name, the host, the app's folder, and the machine (the real one by default). */
interface DriveOptions {
  readonly name: string;
  readonly host: string;
  readonly appDir: string;
  readonly processes?: Processes;
  readonly print?: (line: string) => void;
  /** How long one agent run may take before its group is stopped. */
  readonly timeoutMs?: number;
}

/**
 * A drive: steps run through `bun run exact agent <host> --json` in the app's folder, each run's JSON replies, one
 * `PASS`/`FAIL` line per check, and at the end the exit code. A run that fails is reported as a failed step and
 * the drive goes on, its replies all `undefined`, so later checks are still reported. The one signal a drive sends
 * is to a run's own group when it overruns. Exact's touch runner on iOS (`xcodebuild … exact-touches-<udid>`) is
 * kept on purpose and idles out by itself, and another run may be reusing it, so `finish` signals nothing.
 */
export const makeDrive = (options: DriveOptions) => {
  const processes = options.processes ?? bunProcesses;
  const print = options.print ?? ((line: string) => console.log(line));
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  let failed = 0;

  const watch = (started: Started) => {
    let done = false;
    const ended = started.ended.then((end) => {
      done = true;
      return end;
    });
    const overrun = processes.sleep(timeoutMs).then(() => {
      if (!done && isOwnPid(started.pid)) processes.signal(-started.pid, 'SIGTERM');
    });
    void overrun;
    return ended;
  };

  const report = (name: string, ok: boolean, got: unknown) => {
    if (!ok) failed++;
    print(`${ok ? 'PASS' : 'FAIL'} ${options.host} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`);
  };

  /** Runs `ops` with the agent's `flags`; their replies, or as many `undefined`s and a failed step. */
  const run = async (flags: ReadonlyArray<string>, ops: ReadonlyArray<string>) => {
    const argv = ['bun', 'run', 'exact', 'agent', options.host, '--json', ...flags, ...ops];
    const started = processes.spawn(argv, options.appDir);
    const { code, stdout, stderr } = await watch(started);
    const replies = stdout
      .split('\n')
      .filter(isReply)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as unknown];
        } catch {
          return [];
        }
      });
    if (code === 0 && replies.length >= ops.length)
      return replies.slice(replies.length - ops.length);
    report(
      `step ${flags.join(' ')}`,
      false,
      `agent ${options.host} exited ${code} with ${replies.length} of ${ops.length} replies: ${stderr.slice(-2000)}`,
    );
    return ops.map((): unknown => undefined);
  };

  return {
    run,
    /** A first launch on `store`, its storage reset. */
    launch: (store: string, ops: ReadonlyArray<string>) =>
      run(['--storage', store, '--reset-storage'], ops),
    /** A launch again on `store`, its storage kept: what a relaunch keeps. */
    relaunch: (store: string, ops: ReadonlyArray<string>) =>
      run(['--storage', store, '--keep-storage'], ops),
    /** One check's line: `PASS`, or `FAIL` with what it got. */
    check: (name: string, ok: boolean, got?: unknown) => report(name, ok, got),
    /** Prints the summary and returns the exit code; it signals nothing, a kept touch runner included. */
    finish: () => {
      print(`${failed === 0 ? 'ok' : 'FAILED'}: ${options.name} ${options.host}, ${failed} failed`);
      return failed === 0 ? 0 : 1;
    },
  };
};

/** The machine: Bun's spawn in a group of its own, `process.kill`, `setTimeout`. */
const bunProcesses: Processes = {
  spawn: (argv, cwd) => {
    const child = Bun.spawn([...argv], { cwd, stdout: 'pipe', stderr: 'pipe', detached: true });
    return {
      pid: child.pid,
      ended: Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]).then(([stdout, stderr, code]) => ({ code, stdout, stderr })),
    };
  },
  signal: (pid, signal) => {
    try {
      process.kill(pid, signal);
    } catch {}
  },
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms).unref();
    }),
};
