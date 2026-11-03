import { Effect, Exit, Option, Result, Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import { drawnLabs } from '../canvas/dye.ts';
import type { LoadedPuppet, PuppetSpec } from '../canvas/puppet.ts';
import { freePuppetGl, puppetGl } from '../canvas/puppet-gl.ts';
import { type Puppet, type PuppetSheet, puppetOf, unmattedKey } from '../core/puppet.ts';
import type { Raster } from '../core/raster.ts';
import { PuppetImages, PuppetUnloadable } from './images.ts';

const sheetFrom = Effect.fn('Puppet.sheet')(function* (spec: PuppetSpec) {
  const images = yield* PuppetImages;
  const unloadable = (reason: string) => PuppetUnloadable.make({ puppet: spec.key, reason });
  const [w, h] = spec.size;
  for (const part of spec.parts) {
    const drawn = Option.fromUndefinedOr(part.ramp).pipe(Option.map(drawnLabs));
    if (Option.isSome(drawn) && Result.isFailure(drawn.value))
      return yield* unloadable(`${part.name}: ${drawn.value.failure}`);
  }
  const parts = yield* Effect.forEach(spec.parts, (part) =>
    images.read(part.png).pipe(
      Effect.mapError((e) => unloadable(`${part.name}: ${e.reason}`)),
      Effect.filterOrFail(
        (pixels) => pixels.width === w && pixels.height === h,
        (pixels) =>
          unloadable(`${part.name} is ${pixels.width}x${pixels.height}, the puppet ${w}x${h}`),
      ),
      Effect.map((pixels) => ({ name: part.name, pixels })),
    ),
  );
  return {
    width: w,
    height: h,
    parts,
    paper: spec.paper,
    keep: spec.keep,
    thin: spec.thin,
    open: spec.open,
    grain: spec.grain,
    shadow: spec.shadow,
    underlap: spec.underlap,
  } satisfies PuppetSheet;
});

const puppetOfSheet = Effect.fn('Puppet.ofSheet')(function* (spec: PuppetSpec, sheet: PuppetSheet) {
  const made = puppetOf(sheet, spec.skeleton);
  if (Result.isFailure(made))
    return yield* PuppetUnloadable.make({ puppet: spec.key, reason: made.failure.reason });
  return made.success satisfies Puppet;
});

export const puppetFrom = Effect.fn('Puppet.from')(function* (spec: PuppetSpec) {
  return yield* puppetOfSheet(spec, yield* sheetFrom(spec));
});

const drawingsFrom = Effect.fn('Puppet.drawings')(function* (spec: PuppetSpec, sheet: PuppetSheet) {
  const images = yield* PuppetImages;
  const read = yield* Effect.forEach(spec.drawings ?? [], (d) =>
    images.read(d.png).pipe(
      Effect.mapError((e) =>
        PuppetUnloadable.make({ puppet: spec.key, reason: `${d.name}: ${e.reason}` }),
      ),
      Effect.flatMap((pixels) =>
        Option.match(Option.fromUndefinedOr(d.part), {
          onNone: () => Effect.succeed(pixels),
          onSome: (part) =>
            unmattedKey(sheet, spec.skeleton, part, pixels).pipe(
              Result.match({
                onFailure: (refused) =>
                  Effect.fail(
                    PuppetUnloadable.make({
                      puppet: spec.key,
                      reason: `${d.name}: ${refused.reason}`,
                    }),
                  ),
                onSuccess: (rgba) => Effect.succeed({ ...pixels, rgba }),
              }),
            ),
        }),
      ),
      Effect.map((pixels): readonly [string, Raster] => [d.name, pixels]),
    ),
  );
  return new Map(read) satisfies ReadonlyMap<string, Raster>;
});

export const loadPuppet = Effect.fn('Puppet.load')(function* (spec: PuppetSpec) {
  const images = yield* PuppetImages;
  const sheet = yield* sheetFrom(spec);
  const puppet = yield* puppetOfSheet(spec, sheet);
  const drawings = yield* drawingsFrom(spec, sheet);
  const gl = yield* Effect.acquireRelease(
    Effect.sync(() => puppetGl(puppet)),
    (state) => Effect.sync(() => freePuppetGl(state)),
  );
  return { puppet, drawings, paints: images.paints, gl } satisfies LoadedPuppet;
});

export const loadPuppets = Effect.fn('Puppet.loadPuppets')(function* (
  film: Film,
): Effect.fn.Return<Film, PuppetUnloadable, PuppetImages | Scope.Scope> {
  const caller = yield* Scope.Scope;
  const stood = Effect.gen(function* () {
    const loaded = new Map<PuppetSpec, LoadedPuppet>();
    for (const spec of film.puppets.declared) loaded.set(spec, yield* loadPuppet(spec));
    yield* Effect.acquireRelease(
      Effect.sync(() => film.puppets.stand(loaded)),
      (down) => Effect.sync(down),
    );
    return film;
  });
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const own = yield* Scope.make('sequential');
      const done = yield* Effect.exit(restore(Scope.provide(stood, own)));
      if (Exit.isFailure(done)) {
        yield* Scope.close(own, done);
        return yield* done;
      }
      yield* Scope.addFinalizerExit(caller, (exit) => Scope.close(own, exit));
      return done.value;
    }),
  );
});
