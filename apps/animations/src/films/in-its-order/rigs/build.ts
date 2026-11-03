import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import { Console, Effect, FileSystem, Schema } from 'effect';
import { citedBy, figureOverrides, figuresRml, lockedPrints } from '@manna/film/style';
import { compile, unbuilt, unlocked, unsaid } from '@manna/film/style/build';
import { ARTBOARDS, FIGURES } from './figures.ts';

const here = import.meta.dir;

export const LEDGER = `${here}/../../../../productions/in-its-order.json`;

export const MAIN = ARTBOARDS.leadFeastFront;

const ProblemsJson = Schema.fromJsonString(Schema.Array(Schema.Unknown));

class RiveProblems extends Schema.TaggedError<RiveProblems>()('RiveProblems', {
  problems: Schema.String,
}) {
  override get message() {
    return `rive --once reported problems: ${this.problems}`;
  }
}

class OverridesUnsaid extends Schema.TaggedError<OverridesUnsaid>()('OverridesUnsaid', {
  unsaid: Schema.Array(Schema.String),
}) {
  override get message() {
    return `overrides not backed by the owner's word:\n${this.unsaid.join('\n')}`;
  }
}

class LocksBroken extends Schema.TaggedError<LocksBroken>()('LocksBroken', {
  broken: Schema.Array(Schema.String),
}) {
  override get message() {
    return `locked figures changed:\n${this.broken.join('\n')}`;
  }
}

const committed = { riv: `${here}/figures.riv`, stamp: `${here}/figures.stamp.json` };

const build = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const unbacked = yield* unsaid(LEDGER, figureOverrides(FIGURES));
  if (unbacked.length > 0)
    return yield* OverridesUnsaid.make({ unsaid: unbacked.map((u) => u.why) });
  const locks = yield* unlocked(LEDGER, lockedPrints(FIGURES));
  yield* Effect.forEach(locks.overridden, ({ item, override }) =>
    Console.log(
      `overridden: ${item}'s lock (FigureLock): ${override.reason} (${citedBy(override)})`,
    ),
  );
  if (locks.broken.length > 0)
    return yield* LocksBroken.make({ broken: locks.broken.map((b) => b.why) });
  const rml = figuresRml(FIGURES);
  const stale = yield* unbuilt({ ...committed, rml, main: MAIN });
  if (stale.length === 0)
    return yield* Console.log('figures.riv is the build of the rigs: nothing to build');
  yield* Effect.forEach(stale, (why) => Console.log(`building: ${why}`));
  const built = yield* compile(`${here}/project`, rml, MAIN);
  yield* Console.log(
    `figures.riv: ${built.bytes} bytes; warnings: ${built.warnings.length}; problems: ${built.problems.length}`,
  );
  yield* Effect.forEach(built.warnings, (w) => Console.log(`  warning: ${w}`));
  if (built.problems.length > 0)
    return yield* RiveProblems.make({
      problems: yield* Schema.encodeEffect(ProblemsJson)(built.problems),
    });
  yield* fs.copyFile(built.riv, committed.riv);
  yield* fs.writeFileString(committed.stamp, built.stamp);
});

if (import.meta.main)
  build.pipe(Effect.provide([BunCrypto.layerDigest, BunServices.layer]), BunRuntime.runMain);
