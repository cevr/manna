import * as BunServices from '@effect/platform-bun/BunServices';
import type { PuppetSpec } from '@manna/film/canvas';
import { Effect, FileSystem, Option, Predicate } from 'effect';

const SOURCES = `${import.meta.dir}/../..`;

/** The puppet views the tree holds today: a glob that finds fewer has lost its way. */
export const LEAST_VIEWS = 50;

/** Whether `u` is a puppet's spec, as far as these checks read one: its key, size and parts. */
const isSpec = (u: unknown): u is PuppetSpec =>
  Predicate.hasProperty(u, 'key') &&
  Predicate.hasProperty(u, 'size') &&
  Predicate.hasProperty(u, 'parts');

/** Every puppet view a member's `cutout/puppets.ts` exports (`PUPPETS`) under the app's sources, by its key, sorted: the one list the checks that walk every view (the paper rim, the stroke limbs' census) read, so a new member's views are held by each with no edit there. */
export const cutViews: Effect.Effect<ReadonlyArray<PuppetSpec>> = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs.readDirectory(SOURCES, { recursive: true });
  const modules = names.filter((n) => /\/cast\/[^/]+\/cutout\/puppets\.ts$/.test(n)).toSorted();
  const specs = yield* Effect.forEach(modules, (name) =>
    Effect.map(
      Effect.promise((): Promise<unknown> => import(`${SOURCES}/${name}`)),
      (module) =>
        Option.match(
          Option.liftPredicate(module, (m) => Predicate.hasProperty(m, 'PUPPETS')),
          {
            onNone: () => [],
            onSome: (m) => Object.values(Object(m.PUPPETS)).filter(isSpec),
          },
        ),
    ),
  );
  return specs.flat().toSorted((a, b) => a.key.localeCompare(b.key));
}).pipe(Effect.orDie, Effect.provide(BunServices.layer));
