/* oxlint-disable effect/noNodeBuiltinImport -- a host tool that reads and writes one committed file through node's file system and asks git through the runner it is handed. */

/**
 * The One commit every reference lives under, pinned in
 * `packages/pixel-match/one-commit`. A port's refactor under a One app's
 * folder must not move the key, or every reference reads as missing; so the
 * key is the pin, and git's last commit under the One paths is only compared
 * with it. When the two differ, the drift names both and the files changed
 * under those paths since the pin, and `pixel ref` captures only with
 * `--repin`, under the new commit, then rewrites the pin.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Option } from 'effect';

/** The folders whose commits can change what One draws. */
const ONE_PATHS = ['apps/heartseed', 'apps/hymnal', 'packages/hymnal', 'packages/core'];

/** Runs `git <args>` in the checkout; its stdout. */
type Git = (args: ReadonlyArray<string>) => string;

const pinFile = (root: string) => join(root, 'packages', 'pixel-match', 'one-commit');

/** The pinned One commit, 12 hex digits. */
export const readPin = (root: string) => readFileSync(pinFile(root), 'utf8').trim();

/** Pins `commit` as the One commit. */
export const writePin = (root: string, commit: string) =>
  writeFileSync(pinFile(root), `${commit}\n`);

/** The pin, git's last commit under the One paths, and the files changed under them between the two. */
interface Drift {
  readonly pinned: string;
  readonly latest: string;
  readonly changed: ReadonlyArray<string>;
}

/** The drift from the pin; none when git's last commit under the One paths is the pinned one. */
export const driftOf = (git: Git, pinned: string): Option.Option<Drift> => {
  const full = git(['log', '-1', '--format=%H', '--', ...ONE_PATHS]).trim();
  if (full.startsWith(pinned)) return Option.none();
  const latest = full.slice(0, 12);
  const changed = git(['diff', '--name-only', pinned, latest, '--', ...ONE_PATHS])
    .split('\n')
    .filter((line) => line.length > 0);
  return Option.some({ pinned, latest, changed });
};

/** The one line every command prints on a drift. */
export const driftLine = (drift: Drift) =>
  `pixel: One moved past the pin: pinned ${drift.pinned}, latest ${drift.latest}; changed since the pin: ${drift.changed.join(' ')}`;

/** The key a capture writes under: the pin; on a drift the latest commit with `--repin`, else a refusal. */
export const refKey = (pinned: string, drift: Option.Option<Drift>, repin: boolean) => {
  if (Option.isNone(drift)) return { _tag: 'Key' as const, one: pinned, repin: false };
  const { latest } = drift.value;
  if (repin) return { _tag: 'Key' as const, one: latest, repin: true };
  return {
    _tag: 'Refused' as const,
    reason: `pixel ref: refused, One moved past the pin ${pinned} to ${latest}; capture every row again with --repin, which pins ${latest}`,
  };
};
