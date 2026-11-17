import { claimAppPort } from './port.ts';

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
  /** A web port of the app in `appDir` held for the rest of this process (`claimAppPort`), claimed for `label`. */
  readonly claim: (appDir: string, label: string) => Promise<number>;
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
 * the drive goes on, its replies all `undefined`, so later checks are still reported. On the web every run is on
 * one port of the app's the drive claims and holds to its end. The one signal a drive sends
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

  let claimed: Promise<number> | undefined;
  /**
   * On the web, `--port` and the port this drive claims, the first time it is asked, and holds to its end: every
   * launch, a relaunch too, is on the one port, so it finds the store the last one left, and no run of another
   * checkout serves there meanwhile. None when `flags` names a port or the host is not the web.
   */
  const portFlags = async (flags: ReadonlyArray<string>) => {
    if (options.host !== 'web' || flags.some((f) => f === '--port' || f.startsWith('--port=')))
      return [];
    claimed ??= processes.claim(options.appDir, `${options.name} ${options.host}`);
    return ['--port', String(await claimed)];
  };

  /** Runs `ops` with the agent's `flags`; their replies, or as many `undefined`s and a failed step. */
  const run = async (flags: ReadonlyArray<string>, ops: ReadonlyArray<string>) => {
    const argv = [
      ...['bun', 'run', 'exact', 'agent', options.host, '--json'],
      ...(await portFlags(flags)),
      ...flags,
      ...ops,
    ];
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

/**
 * The machine: Bun's spawn in a group of its own with this process's environment as it is at the spawn (so a run
 * inherits the port turns the drive holds), `process.kill`, `setTimeout`, and a port of the app claimed through
 * `claimAppPort`. A drive that starts its runs its own way keeps `claim` from here.
 */
export const bunProcesses: Processes = {
  spawn: (argv, cwd) => {
    const child = Bun.spawn([...argv], {
      cwd,
      env: { ...process.env },
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
    });
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
  claim: async (appDir, label) => (await claimAppPort(appDir, { label })).port,
};
