import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Console, Duration, Effect, Path, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { EXACT_BASE, EXACT_PATCHES, EXACT_PIN } from './run.ts';

/** Why a clone could not be brought to the pin. */
export class PatchRefused extends Schema.TaggedError<PatchRefused>()('PatchRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `exact patch: ${this.reason}`;
  }
}

/** The committer every replay writes, with the author's date, so the pin's hash is the same in every clone. */
const COMMITTER = {
  GIT_COMMITTER_NAME: 'manna exact-kit',
  GIT_COMMITTER_EMAIL: 'exact-kit@manna.invalid',
};

/** `git -C clone <args>` with the clone's hooks off: its trimmed output and its exit code. */
const git = (clone: string, args: ReadonlyArray<string>, env: Record<string, string> = {}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('git', ['-C', clone, '-c', 'core.hooksPath=/dev/null', ...args], {
          env,
          extendEnv: true,
          forceKillAfter: Duration.seconds(5),
        }),
      );
      const [out, code] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 2 },
      );
      return { out: out.trim(), code: Number(code) };
    }),
  );

const refuse = (reason: string) => Effect.fail(PatchRefused.make({ reason }));

/**
 * Brings the clone at `clone` to `EXACT_PIN`: `EXACT_BASE` checked out, fetched first if the clone lacks it, and
 * `EXACT_PATCHES` from `patches` replayed on it by `git am` with a fixed committer and the author's date, which makes
 * the pin's own hash. A clone at the pin is left alone. Refused, the clone unmoved, when it has uncommitted changes;
 * refused, the clone left at the base, when a patch no longer applies or the replay makes another commit.
 */
export const toPin = Effect.fn('ExactKit.toPin')(function* (clone: string, patches: string) {
  const path = yield* Path.Path;
  const head = yield* git(clone, ['rev-parse', 'HEAD']);
  if (head.code !== 0) return yield* refuse(`no Exact clone at ${clone}`);
  if (head.out === EXACT_PIN) return EXACT_PIN;
  const dirty = yield* git(clone, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty.out !== '')
    return yield* refuse(`${clone} has uncommitted changes; commit or discard them first`);
  const hasBase = git(clone, ['cat-file', '-e', `${EXACT_BASE}^{commit}`]);
  if ((yield* hasBase).code !== 0) {
    yield* git(clone, ['fetch', '--quiet', 'origin']);
    if ((yield* hasBase).code !== 0)
      return yield* refuse(`${clone} has no commit ${EXACT_BASE}, even after fetching origin`);
  }
  if ((yield* git(clone, ['checkout', '--quiet', '--detach', EXACT_BASE])).code !== 0)
    return yield* refuse(`${clone} could not check out ${EXACT_BASE}`);
  const applied = yield* git(
    clone,
    [
      'am',
      '--quiet',
      '--no-gpg-sign',
      '--committer-date-is-author-date',
      ...EXACT_PATCHES.map((patch) => path.join(patches, patch)),
    ],
    COMMITTER,
  );
  if (applied.code !== 0) {
    yield* git(clone, ['am', '--abort']);
    return yield* refuse(
      `${EXACT_PATCHES.join(', ')} no longer apply to ${EXACT_BASE}; ${clone} is left at it. Rebase the patches in a clone of their own and write them again (docs/exact.md, "The pin")`,
    );
  }
  const made = (yield* git(clone, ['rev-parse', 'HEAD'])).out;
  if (made !== EXACT_PIN)
    return yield* refuse(
      `the patches on ${EXACT_BASE} made ${made}, not the pin ${EXACT_PIN}: a pin move writes the new commit into EXACT_PIN and docs/exact.md`,
    );
  return made;
});

if (import.meta.main)
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const clone = yield* Config.String('EXACT');
    const patches = path.join(
      yield* path.fromFileUrl(new URL('.', import.meta.url)),
      '..',
      'patches',
    );
    const pin = yield* toPin(clone, patches);
    yield* Console.log(`exact patch: ${clone} is at the pin ${pin}`);
    return 0;
  }).pipe(
    Effect.catchTag('PatchRefused', (refused) => Effect.as(Console.error(refused.message), 2)),
    // oxlint-disable-next-line effect/noGlobals -- a refused replay exits non-zero, as the wrapper does
    Effect.flatMap((code) => Effect.sync(() => process.exit(code))),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
