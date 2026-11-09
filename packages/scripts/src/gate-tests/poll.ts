import { Option } from 'effect';

/** One process of the table: its pid, its parent's and its arguments. */
interface Row {
  readonly pid: number;
  readonly ppid: number;
  readonly args: string;
}

/** A watched process: when it was first seen with its current arguments. */
export interface Held {
  readonly since: number;
  readonly args: string;
}

/** How a bounded run ended: the command's exit code, or 124 and every process past the bound. */
export interface Ended {
  readonly code: number;
  readonly over: Option.Option<string>;
}

/** The exit code of a run the watchdog ended, as `timeout(1)` gives. */
export const HUNG = 124;

/** One line of `ps -A -o pid= -o ppid= -o args=`: the pid, the parent's pid and the arguments. */
const ROW = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/u;

/** The rows of `ps -A -o pid= -o ppid= -o args=`. */
export const parseRows = (text: string): ReadonlyArray<Row> =>
  text
    .split('\n')
    .flatMap((line) => Option.toArray(Option.fromNullishOr(ROW.exec(line))))
    .map(([, pid = '', ppid = '', args = '']) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      args,
    }));

/** Every process under `root` by parentage, `root` left out. */
const descendants = (rows: ReadonlyArray<Row>, root: number): ReadonlyArray<Row> => {
  const below = (parents: ReadonlySet<number>, seen: ReadonlySet<number>): ReadonlyArray<Row> => {
    const kids = rows.filter((row) => parents.has(row.ppid) && !seen.has(row.pid));
    if (kids.length === 0) return [];
    const pids = new Set(kids.map((row) => row.pid));
    return [...kids, ...below(pids, new Set([...seen, ...pids]))];
  };
  return below(new Set([root]), new Set([root]));
};

/**
 * Whether a process is turbo itself (its program, or the script node runs,
 * is named `turbo`): its native binary, the `.bin` shim and a daemon, never
 * a task whose name only starts with it.
 */
const isTurbo = (args: string) =>
  args
    .split(/\s+/u)
    .slice(0, 2)
    .some((word) => /(^|\/)turbo$/u.test(word));

/** What one poll holds: each watched process by pid, and every one past the bound, by its arguments a line. */
interface Polled {
  readonly held: ReadonlyMap<number, Held>;
  readonly over: Option.Option<string>;
}

/**
 * One poll of the table at `now`: each live descendant of `root` but turbo,
 * kept from `held` while its arguments stay, else seen from now, and every
 * one alive past `boundMs` since it was first seen.
 */
export const step = (
  held: ReadonlyMap<number, Held>,
  rows: ReadonlyArray<Row>,
  root: number,
  now: number,
  boundMs: number,
): Polled => {
  const next = new Map(
    descendants(rows, root)
      .filter((row) => !isTurbo(row.args))
      .map((row): [number, Held] => [
        row.pid,
        Option.fromUndefinedOr(held.get(row.pid)).pipe(
          Option.filter((before) => before.args === row.args),
          Option.getOrElse(() => ({ since: now, args: row.args })),
        ),
      ]),
  );
  const over = [...next.values()].filter((each) => now - each.since > boundMs);
  return {
    held: next,
    over: Option.liftPredicate(over.map((each) => each.args).join('\n'), () => over.length > 0),
  };
};
