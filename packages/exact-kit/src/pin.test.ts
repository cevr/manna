import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Layer, Path, Sink, Stream } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { describe, expect, it } from 'effect-bun-test';

import { EXACT_BASE, EXACT_PATCHES, EXACT_PIN, toPin } from './pin.ts';

const CLONE = '/nonexistent/loop-probe-x/exact';
const PATCHES = '/nonexistent/loop-probe-x/patches';

const handleOf = (stdout: string, exitCode: number) =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(0),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: Stream.make(new TextEncoder().encode(stdout)),
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  });

/** A git call the stand-in saw: its subcommand and arguments after the clone and hooks flags, and the committer it set. */
interface Call {
  readonly args: string;
  readonly committer: string;
}

/** A clone as git answers for it: its `HEAD` before and after `am`, whether it is dirty, holds the base, and takes the patches. */
interface Clone {
  readonly head: string;
  readonly made: string;
  readonly dirty: boolean;
  readonly base: boolean;
  readonly applies: boolean;
}

const standIn = (clone: Clone, calls: Array<Call>) => {
  let applied = false;
  return ChildProcessSpawner.make((command) => {
    if (command._tag !== 'StandardCommand') return Effect.succeed(handleOf('', 0));
    const args = command.args.map(String).slice(4);
    const env = command.options.env ?? {};
    calls.push({ args: args.join(' '), committer: String(env['GIT_COMMITTER_NAME'] ?? '') });
    const answer = (out: string, code = 0) => Effect.succeed(handleOf(out, code));
    const failed = (ok: boolean) => answer('', Number(!ok));
    if (args[0] === 'rev-parse' && applied) return answer(clone.made);
    if (args[0] === 'rev-parse') return answer(clone.head);
    if (args[0] === 'status' && clone.dirty) return answer(' M kernel/src/lib.rs');
    if (args[0] === 'cat-file') return failed(clone.base);
    if (args[0] === 'am' && args[1] !== '--abort') {
      applied = clone.applies;
      return failed(clone.applies);
    }
    return answer('');
  });
};

const replay = (clone: Clone) => {
  const calls: Array<Call> = [];
  return toPin(CLONE, PATCHES).pipe(
    Effect.result,
    Effect.provide(
      Layer.mergeAll(
        BunServices.layer,
        Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, standIn(clone, calls)),
      ),
    ),
    Effect.map((result) => ({ result, calls: calls.map((c) => c.args), committers: calls })),
  );
};

const AT_BASE: Clone = {
  head: EXACT_BASE,
  made: EXACT_PIN,
  dirty: false,
  base: true,
  applies: true,
};
const AM = `am --quiet --no-gpg-sign --committer-date-is-author-date ${EXACT_PATCHES.map((p) => `${PATCHES}/${p}`).join(' ')}`;

describe('toPin brings a clone to the pin', () => {
  it.effect(
    'replays the patches on the base under the fixed committer, and is done at the pin',
    () =>
      Effect.gen(function* () {
        const { result, calls, committers } = yield* replay(AT_BASE);
        expect(result).toEqual(expect.objectContaining({ _tag: 'Success', success: EXACT_PIN }));
        expect(calls).toEqual([
          'rev-parse HEAD',
          'status --porcelain --untracked-files=no',
          `cat-file -e ${EXACT_BASE}^{commit}`,
          `checkout --quiet --detach ${EXACT_BASE}`,
          AM,
          'rev-parse HEAD',
        ]);
        expect(committers.find((c) => c.args === AM)?.committer).toBe('manna exact-kit');
        const again = yield* replay({ ...AT_BASE, head: EXACT_PIN });
        expect(again.calls).toEqual(['rev-parse HEAD']);
      }),
  );

  it.effect('fetches a base the clone lacks, and refuses when origin has none', () =>
    Effect.gen(function* () {
      const { result, calls } = yield* replay({ ...AT_BASE, base: false });
      expect(result._tag).toBe('Failure');
      expect(calls).toContain('fetch --quiet origin');
      expect(calls.some((c) => c.startsWith('checkout'))).toBe(false);
    }),
  );

  it.effect('refuses a dirty clone before it moves it', () =>
    Effect.gen(function* () {
      const { result, calls } = yield* replay({ ...AT_BASE, dirty: true });
      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') expect(result.failure.reason).toContain('uncommitted');
      expect(calls.some((c) => c.startsWith('checkout'))).toBe(false);
    }),
  );

  it.effect('aborts and refuses, naming the base, when a patch no longer applies', () =>
    Effect.gen(function* () {
      const { result, calls } = yield* replay({ ...AT_BASE, applies: false });
      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.failure.reason).toContain('no longer apply');
        expect(result.failure.reason).toContain(EXACT_BASE);
      }
      expect(calls.at(-1)).toBe('am --abort');
    }),
  );

  it.effect('refuses a replay that makes another commit than the pin, naming both', () =>
    Effect.gen(function* () {
      const other = 'e'.repeat(40);
      const { result } = yield* replay({ ...AT_BASE, made: other });
      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.failure.reason).toContain(other);
        expect(result.failure.reason).toContain(EXACT_PIN);
      }
    }),
  );

  it.effect('every listed patch is in patches/, written with no commit of its own', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = path.join(
        yield* path.fromFileUrl(new URL('.', import.meta.url)),
        '..',
        'patches',
      );
      expect([...(yield* fs.readDirectory(dir))].toSorted()).toEqual([...EXACT_PATCHES].toSorted());
      for (const patch of EXACT_PATCHES) {
        const text = yield* fs.readFileString(path.join(dir, patch));
        expect(text.startsWith(`From ${'0'.repeat(40)} `)).toBe(true);
      }
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
