import * as BunServices from '@effect/platform-bun/BunServices';
import type { PuppetSpec } from '@manna/film/canvas';
import { PuppetImagesBun, decodePng, puppetFrom } from '@manna/film/tools';
import { Effect, FileSystem, Layer, Option, Predicate } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { RIM_LEFT, paperRimLeftOf } from './clean.ts';

const SOURCES = `${import.meta.dir}/../..`;

const layer = Layer.mergeAll(
  BunServices.layer,
  PuppetImagesBun.pipe(Layer.provide(BunServices.layer)),
);

const LEAST_VIEWS = 50;

const MOST_RIM = 12;

const isSpec = (u: unknown): u is PuppetSpec =>
  Predicate.hasProperty(u, 'key') &&
  Predicate.hasProperty(u, 'size') &&
  Predicate.hasProperty(u, 'parts');

const VIEWS: ReadonlyArray<PuppetSpec> =
  // oxlint-disable-next-line effect/noAsyncFunction -- read once as the file loads, so each view is a case of its own
  await Effect.runPromise(
    Effect.gen(function* () {
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
    }).pipe(Effect.provide(BunServices.layer)),
  );

const rasterOf = (png: string) =>
  Effect.gen(function* () {
    const bytes = yield* (yield* FileSystem.FileSystem).readFile(png);
    return yield* Effect.fromResult(decodePng(bytes));
  });

const rimLeftOf = (spec: PuppetSpec) =>
  Effect.gen(function* () {
    const paper = yield* Effect.fromOption(Option.fromUndefinedOr(spec.paper));
    const shadowNames = new Set(spec.shadow);
    const shadow = spec.parts.flatMap((part, k) =>
      Option.toArray(Option.liftPredicate(k, () => shadowNames.has(part.name))),
    );
    const cut = yield* Effect.forEach(spec.parts, (part) => rasterOf(part.png));
    const puppet = yield* puppetFrom(spec);
    const rim = paperRimLeftOf(
      cut,
      puppet.parts.map((p) => p.pixels),
      { ...RIM_LEFT, paper, shadow },
    );
    return rim.reduce((n, m) => n + m, 0);
  });

describe('no cast member keeps a paper rim round his puppet', () => {
  it.effect(`finds at least ${LEAST_VIEWS} puppet views`, () =>
    Effect.sync(() => expect(VIEWS.length).toBeGreaterThanOrEqual(LEAST_VIEWS)),
  );

  for (const spec of VIEWS)
    it.effect.layer(layer)(`${spec.key} keeps at most ${MOST_RIM} px of paper rim`, () =>
      Effect.map(rimLeftOf(spec), (rim) => expect(rim).toBeLessThanOrEqual(MOST_RIM)),
    );
});
