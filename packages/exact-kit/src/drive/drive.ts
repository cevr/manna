/** A process the drive started, in a process group of its own: its pid, and its end. */
interface Started {
  readonly pid: number;
  readonly ended: Promise<{
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
  }>;
}

/** A row of the process table. */
interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly command: string;
}

/**
 * What a drive does to the machine: start a command in a group of its own, read the process table, send a signal,
 * wait. `bunProcesses` is the real one; a test hands a stand-in.
 */
interface Processes {
  readonly spawn: (argv: ReadonlyArray<string>, cwd: string) => Started;
  readonly list: () => ReadonlyArray<ProcessRow>;
  readonly signal: (pid: number, signal: 'SIGTERM') => void;
  readonly sleep: (ms: number) => Promise<void>;
}

/** The marker in the command of Exact's touch runner (`xcodebuild … exact-touches-<udid>.xctestrun`). */
const TOUCH_RUNNER = 'exact-touches-';

/** Whether `line` of an agent's output is one of its JSON replies. */
const isReply = (line: string) =>
  line.startsWith('{') ||
  line.startsWith('[') ||
  line.startsWith('"') ||
  line === 'null' ||
  /^[-\d]|^true$|^false$/u.test(line);

/** Whether `pid` names one process a drive may signal: never 0, 1, a group's negative or a broadcast. */
const isOwnPid = (pid: number) => Number.isInteger(pid) && pid > 1;

/** Every pid under `root` in `rows`, by parent, `root` left out. */
const descendants = (rows: ReadonlyArray<ProcessRow>, root: number) => {
  const found = new Set<number>([root]);
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows)
      if (found.has(row.ppid) && !found.has(row.pid)) {
        found.add(row.pid);
        grew = true;
      }
  }
  found.delete(root);
  return found;
};

/** What a drive is told: its name, the host, the app's folder, and the machine (the real one by default). */
interface DriveOptions {
  readonly name: string;
  readonly host: string;
  readonly appDir: string;
  readonly processes?: Processes;
  readonly print?: (line: string) => void;
  /** How long one agent run may take before its group is stopped. */
  readonly timeoutMs?: number;
  /** How often the process table is read while an iOS run goes, for the touch runner it starts. */
  readonly pollMs?: number;
}

/**
 * A drive: steps run through `bun run exact agent <host> --json` in the app's folder, each run's JSON replies, one
 * `PASS`/`FAIL` line per check, and at the end the exit code. A run that fails is reported as a failed step and
 * the drive goes on, its replies all `undefined`, so later checks are still reported. On iOS the touch runner a run
 * starts (Exact's `xcodebuild … exact-touches-<udid>`, which outlives it) is noted while the run goes, as a process
 * under the run's own pid, and `finish` stops each one noted that still runs that command; no other pid is signalled
 * but a run's own group when it overruns.
 */
export const makeDrive = (options: DriveOptions) => {
  const processes = options.processes ?? bunProcesses;
  const print = options.print ?? ((line: string) => console.log(line));
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  const pollMs = options.pollMs ?? 500;
  const runners = new Map<number, string>();
  let failed = 0;

  const noteRunners = (root: number) => {
    const rows = processes.list();
    const under = descendants(rows, root);
    for (const row of rows)
      if (under.has(row.pid) && isOwnPid(row.pid) && row.command.includes(TOUCH_RUNNER))
        runners.set(row.pid, row.command);
  };

  const watch = async (started: Started) => {
    let done = false;
    const ended = started.ended.then((end) => {
      done = true;
      return end;
    });
    const overrun = processes.sleep(timeoutMs).then(() => {
      if (!done && isOwnPid(started.pid)) processes.signal(-started.pid, 'SIGTERM');
    });
    void overrun;
    while (!done) {
      if (options.host === 'ios') noteRunners(started.pid);
      await Promise.race([ended, processes.sleep(pollMs)]);
    }
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
    /** Stops the touch runners its runs started that still run, prints the summary; the exit code. */
    finish: () => {
      const rows = processes.list();
      for (const [pid, command] of runners)
        if (rows.some((row) => row.pid === pid && row.command === command))
          processes.signal(pid, 'SIGTERM');
      print(`${failed === 0 ? 'ok' : 'FAILED'}: ${options.name} ${options.host}, ${failed} failed`);
      return failed === 0 ? 0 : 1;
    },
  };
};

/** The machine: Bun's spawn in a group of its own, `ps` for the table, `process.kill`, `setTimeout`. */
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
  list: () =>
    Bun.spawnSync(['ps', '-A', '-o', 'pid=,ppid=,command='])
      .stdout.toString()
      .split('\n')
      .flatMap((line) => {
        const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
        if (!match) return [];
        return [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] ?? '' }];
      }),
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
