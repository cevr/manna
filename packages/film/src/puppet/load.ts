// A film's puppets loaded before its first frame (`loadPuppets`), as its rigs
// are (`rive/load.ts`): every puppet its drawings declare
// (`film.puppets.declared`), each part PNG read and decoded through the
// `PuppetImages` the host gives (the page awaits each image's decode here,
// never in a frame), made into a puppet on its skeleton (`puppetOf`), and
// stood on the film for its draws. What a puppet holds on a WebGL context
// (its textures and buffers, `canvas/puppet-gl.ts`) is the load scope's and
// freed when it closes; the puppets stand on the film until then. A part
// PNG of another size than its puppet declares, or a skeleton that does not
// fit the parts, fails the load, naming why, and nothing is drawn.

import { Effect, Exit, Result, Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import type { LoadedPuppet, PuppetSpec } from '../canvas/puppet.ts';
import { freePuppetGl, puppetGl } from '../canvas/puppet-gl.ts';
import { type Puppet, puppetOf } from '../core/puppet.ts';
import { PuppetImages, PuppetUnloadable } from './images.ts';

/** `spec`'s puppet: each part PNG read and decoded, checked against its declared size, skinned on its skeleton. */
export const puppetFrom = Effect.fn('Puppet.from')(function* (spec: PuppetSpec) {
  const images = yield* PuppetImages;
  const unloadable = (reason: string) => PuppetUnloadable.make({ puppet: spec.key, reason });
  const [w, h] = spec.size;
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
  const made = puppetOf({ width: w, height: h, parts }, spec.skeleton);
  if (Result.isFailure(made)) return yield* unloadable(made.failure.reason);
  return made.success satisfies Puppet;
});

/** One declared puppet, loaded, its GL state freed with the scope. */
const loadPuppet = Effect.fn('Puppet.load')(function* (spec: PuppetSpec) {
  const images = yield* PuppetImages;
  const puppet = yield* puppetFrom(spec);
  const gl = yield* Effect.acquireRelease(
    Effect.sync(() => puppetGl(puppet)),
    (state) => Effect.sync(() => freePuppetGl(state)),
  );
  return { puppet, paints: images.paints, gl } satisfies LoadedPuppet;
});

/**
 * Load every puppet `film`'s drawings declare and stand them on it for its
 * draws, until the caller's scope closes: what a film's load path runs
 * before its first frame. The film, ready to draw. As `loadRigs`, what the
 * load acquires is held in a scope of its own that only the load closes
 * while it runs, then handed to the caller's.
 */
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
