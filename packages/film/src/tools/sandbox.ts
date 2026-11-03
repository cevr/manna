import { Array as Arr } from 'effect';

/**
 * What a sandboxed run may touch inside the closed folders, nothing it is
 * not given: each a folder and everything under it, by its real path.
 */
export interface SandboxPlan {
  /** Opened to read: the packet's folder, the program and what it reads to run. */
  readonly reads: ReadonlyArray<string>;
  /** Opened to read and write: the program's own state and temp files. */
  readonly writes: ReadonlyArray<string>;
  /** No network at all: for a program that needs none (downloaded code, run on the user's files). */
  readonly offline?: boolean;
}

/** What is closed to reading but where a plan opens it: every home, the temp folders, other volumes. */
const CLOSED: ReadonlyArray<string> = [
  '/Users',
  '/Volumes',
  '/private/tmp',
  '/private/var/folders',
  '/private/var/tmp',
];

/** `text` as an SBPL string: its backslashes and quotes escaped. */
const quoted = (text: string) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** One rule over `folders`; none when there are none. */
const rule = (verdict: 'allow' | 'deny', ops: string, folders: ReadonlyArray<string>) =>
  Arr.match(folders, {
    onEmpty: () => [],
    onNonEmpty: (some) => [
      `(${verdict} ${ops} ${some.map((folder) => `(subpath ${quoted(folder)})`).join(' ')})`,
    ],
  });

/**
 * The Seatbelt profile that runs a program in `plan`'s sandbox. A later rule
 * wins over an earlier one it overlaps, so the order is the policy: allow
 * all, then write nowhere but `/dev`, read nothing closed, and open the
 * plan's reads and writes.
 */
const profileOf = (plan: SandboxPlan): string =>
  [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    '(allow file-write* (subpath "/dev"))',
    ...rule('deny', 'file-read-data', CLOSED),
    ...rule('allow', 'file-read-data', [...plan.reads, ...plan.writes]),
    ...rule('allow', 'file-write*', plan.writes),
    ...['(deny network*)'].filter(() => plan.offline === true),
  ].join('\n');

/** The argv that runs `command` in `plan`'s sandbox. */
export const sandboxArgs = (
  plan: SandboxPlan,
  command: ReadonlyArray<string>,
): ReadonlyArray<string> => ['sandbox-exec', '-p', profileOf(plan), ...command];
