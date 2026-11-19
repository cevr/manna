/* oxlint-disable effect/noNodeBuiltinImport, effect/noThrowStatement, effect/noNewError -- a host tool that reads and writes two committed files through node's file system and asks git through the runner it is handed; a pin or ledger line that holds no commit stops the tool, said by a throw. */

/**
 * The One commit every reference lives under, pinned in
 * `packages/pixel-match/one-commit`. A port's refactor under a One app's
 * folder must not move the key, or every reference reads as missing; so the
 * key is the pin. Each commit under the One paths since the pin either is
 * listed in `packages/pixel-match/render-neutral` with the reason it draws
 * nothing new (a move between modules, an `exports` line), or is a drift:
 * the drift names those commits and their files, and `pixel ref` captures
 * only with `--repin`, under the latest commit, then rewrites the pin and
 * empties the ledger.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Array as Arr, Option } from 'effect';

/**
 * The files whose commits can change what One draws: the folders, less what
 * no One build runs (each test, and the declarations a One app keeps for
 * its port under `exact/`), so a port's declaration is no drift.
 */
const ONE_PATHS = [
  'apps/heartseed',
  'apps/hymnal',
  'packages/hymnal',
  'packages/core',
  ':(exclude,glob)apps/*/exact/**',
  ':(exclude,glob)**/*.test.ts',
  ':(exclude,glob)**/*.test.tsx',
];

/** Runs `git <args>` in the checkout; its stdout. */
type Git = (args: ReadonlyArray<string>) => string;

const pinFile = (root: string) => join(root, 'packages', 'pixel-match', 'one-commit');
const ledgerFile = (root: string) => join(root, 'packages', 'pixel-match', 'render-neutral');

const COMMIT = /^[0-9a-f]{12}$/;

/** The pinned One commit, 12 hex digits; any other text is no pin, said by a throw (an empty pin would match every commit). */
export const readPin = (root: string) => {
  const pin = readFileSync(pinFile(root), 'utf8').trim();
  if (!COMMIT.test(pin))
    throw new Error(`${pinFile(root)}: "${pin}" is no One commit (12 hex digits)`);
  return pin;
};

/** Pins `commit` as the One commit, and empties the ledger: its entries are of commits before the new pin. */
export const writePin = (root: string, commit: string) => {
  writeFileSync(pinFile(root), `${commit}\n`);
  if (existsSync(ledgerFile(root))) writeFileSync(ledgerFile(root), '');
};

/**
 * The commits since the pin listed as drawing nothing new: one line each,
 * `<12 hex digits> <reason>`. A line with no commit or no reason stops the
 * tool, so no entry passes unread; no file is an empty ledger.
 */
export const readNeutral = (root: string): ReadonlyArray<string> => {
  if (!existsSync(ledgerFile(root))) return [];
  return readFileSync(ledgerFile(root), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [commit = '', ...reason] = line.split(/\s+/);
      if (!COMMIT.test(commit) || reason.length === 0)
        throw new Error(
          `${ledgerFile(root)}: "${line}" is no entry (a 12-hex-digit commit, then its reason)`,
        );
      return commit;
    });
};

/** The pin, git's last commit under the One paths, the commits since the pin the ledger does not list, and the files they change. */
interface Drift {
  readonly pinned: string;
  readonly latest: string;
  readonly unlisted: ReadonlyArray<string>;
  readonly changed: ReadonlyArray<string>;
}

const lines = (text: string) => text.split('\n').filter((line) => line.length > 0);

/**
 * The drift from the pin: none when every commit under the One paths since
 * the pin is listed in `neutral`. Each commit a merge brings is listed on
 * its own (`--full-history`); a merge counts only when its own resolution
 * changes a file under the One paths, a file that differs from every parent
 * (its combined diff, `--cc`), so a clean merge needs no entry.
 */
export const driftOf = (
  git: Git,
  pinned: string,
  neutral: ReadonlyArray<string>,
): Option.Option<Drift> => {
  const range = `${pinned}..HEAD`;
  const merges = new Set(
    lines(git(['rev-list', '--full-history', '--merges', range, '--', ...ONE_PATHS])),
  );
  const filesOf = (full: string) =>
    lines(
      git(['diff-tree', '--cc', '--no-commit-id', '--name-only', '-r', full, '--', ...ONE_PATHS]),
    );
  const since = lines(git(['rev-list', '--full-history', range, '--', ...ONE_PATHS])).filter(
    (full) => !merges.has(full) || filesOf(full).length > 0,
  );
  const unlisted = since.filter((full) => !neutral.some((entry) => full.startsWith(entry)));
  if (unlisted.length === 0) return Option.none();
  return Option.map(Arr.head(since), (newest) => ({
    pinned,
    latest: newest.slice(0, 12),
    unlisted: unlisted.map((full) => full.slice(0, 12)),
    changed: [...new Set(unlisted.flatMap(filesOf))].toSorted(),
  }));
};

/** The one line every command prints on a drift. */
export const driftLine = (drift: Drift) =>
  `pixel: One moved past the pin: pinned ${drift.pinned}, latest ${drift.latest}; not listed render-neutral: ${drift.unlisted.join(' ')}; changed by them: ${drift.changed.join(' ')}`;

/** The key a capture writes under: the pin; on a drift the latest commit with `--repin`, else a refusal. */
export const refKey = (pinned: string, drift: Option.Option<Drift>, repin: boolean) => {
  if (Option.isNone(drift)) return { _tag: 'Key' as const, one: pinned, repin: false };
  const { latest, unlisted } = drift.value;
  if (repin) return { _tag: 'Key' as const, one: latest, repin: true };
  return {
    _tag: 'Refused' as const,
    reason: `pixel ref: refused, One moved past the pin ${pinned} by ${unlisted.join(' ')}; list each that draws nothing new in packages/pixel-match/render-neutral with its reason, or capture every row again with --repin, which pins ${latest}`,
  };
};
