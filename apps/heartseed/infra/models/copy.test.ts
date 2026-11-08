/**
 * The command's arguments as `bun run models:copy` passes them, run by the
 * command's own handler over fake jobs and a fake R2 writes layer that only
 * record what they were given, so nothing fetches, reads a profile or calls R2.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Layer, Option, Ref } from 'effect';
import { Command } from 'effect/cli';

import { modelsCopy } from './copy.ts';
import { Target } from './stores.ts';

const selected = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const seen = yield* Ref.make<ReadonlyArray<string>>([]);
    const note = (what: string) => Ref.update(seen, (all) => [...all, what]);
    const writes = Layer.effect(
      Target,
      Effect.as(
        note('writes built'),
        Target.of({ list: () => Effect.succeed(new Map()), put: () => Effect.die('never put') }),
      ),
    );
    const job = (mode: string) => (cache: string) =>
      Effect.flatMap(Effect.serviceOption(Target), (target) =>
        note(
          `${mode} ${cache}${Option.match(target, { onNone: () => '', onSome: () => ' over R2' })}`,
        ),
      );
    const exit = yield* Effect.exit(
      Command.runWith(modelsCopy({ writes, dryRun: job('dry run'), run: job('run') }), {
        version: '1.0.0',
        renderErrors: false,
      })(args),
    );
    return { exit, seen: yield* Ref.get(seen) };
  }).pipe(Effect.provide(BunServices.layer));

describe('models-copy arguments', () => {
  it.effect('runs the real job over R2 with no --dry-run', () =>
    Effect.gen(function* () {
      const { exit, seen } = yield* selected(['--cache', '/c']);
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(seen).toEqual(['writes built', 'run /c over R2']);
    }),
  );

  it.effect('runs the dry job with --dry-run, and never builds the R2 writes', () =>
    Effect.gen(function* () {
      const { exit, seen } = yield* selected(['--cache', '/c', '--dry-run']);
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(seen).toEqual(['dry run /c']);
    }),
  );

  it.effect('passes the cache through whole in either flag form and order', () =>
    Effect.gen(function* () {
      const cases = [
        { args: ['--dry-run', '--cache=/a b/--dry-run'], seen: ['dry run /a b/--dry-run'] },
        { args: ['--cache', '/a b'], seen: ['writes built', 'run /a b over R2'] },
      ];
      for (const { args, seen } of cases) {
        expect({ args, seen: (yield* selected(args)).seen }).toEqual({ args, seen });
      }
    }),
  );

  it.effect('fails with no --cache, or an unknown flag, and runs nothing', () =>
    Effect.gen(function* () {
      for (const args of [
        ['--dry-run'],
        ['--cache', '/c', '--dryrun'],
        ['--cache', '/c', '--dry'],
      ]) {
        const { exit, seen } = yield* selected(args);
        expect({ args, failed: Exit.isFailure(exit), seen }).toEqual({
          args,
          failed: true,
          seen: [],
        });
      }
    }),
  );
});
