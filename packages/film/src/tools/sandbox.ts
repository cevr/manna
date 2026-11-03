import { Array as Arr } from 'effect';

export interface SandboxPlan {
  readonly reads: ReadonlyArray<string>;
  readonly writes: ReadonlyArray<string>;
  readonly offline?: boolean;
}

const CLOSED: ReadonlyArray<string> = [
  '/Users',
  '/Volumes',
  '/private/tmp',
  '/private/var/folders',
  '/private/var/tmp',
];

const quoted = (text: string) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

const rule = (verdict: 'allow' | 'deny', ops: string, folders: ReadonlyArray<string>) =>
  Arr.match(folders, {
    onEmpty: () => [],
    onNonEmpty: (some) => [
      `(${verdict} ${ops} ${some.map((folder) => `(subpath ${quoted(folder)})`).join(' ')})`,
    ],
  });

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

export const sandboxArgs = (
  plan: SandboxPlan,
  command: ReadonlyArray<string>,
): ReadonlyArray<string> => ['sandbox-exec', '-p', profileOf(plan), ...command];
