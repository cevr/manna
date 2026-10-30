/**
 * The verify-hymnal journey files: every `features/<feature>.journey.json`
 * decodes with the journey Schema and names its own feature, so a bad file
 * fails the gate rather than the verifier's first `sim journey`.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, FileSystem, Path } from 'effect';

import { BadJourney } from './errors.ts';
import { decodeJourney } from './journey.ts';

const SUFFIX = '.journey.json';

/** Decode each journey file in `dir`: the features, or the first file refused. */
const decodeAll = Effect.fn('decodeAll')(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files = (yield* fs.readDirectory(dir)).filter((name) => name.endsWith(SUFFIX)).sort();
  const features: Array<string> = [];
  for (const name of files) {
    const file = path.join(dir, name);
    const journey = yield* decodeJourney(file, yield* fs.readFileString(file));
    const feature = name.slice(0, -SUFFIX.length);
    if (journey.feature !== feature) {
      return yield* BadJourney.make({ file, issue: `its feature is ${journey.feature}` });
    }
    features.push(feature);
  }
  return features;
});

describe('verify-hymnal journey files', () => {
  it.effect('every journey file decodes and names its own feature', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const dir = path.join(import.meta.dir, '../../../../.claude/skills/verify-hymnal/features');
      const features = yield* decodeAll(dir);
      expect(features).toEqual([
        'about',
        'browse',
        'chords-and-capo',
        'feel',
        'follow',
        'hymn-list',
        'hymn-reader',
        'player',
        'search',
        'settings',
      ]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('a bad journey file is refused, naming the file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = path.join(dir, 'about.journey.json');
      yield* fs.writeFileString(
        file,
        '{"feature":"about","platform":"ios","steps":[{"name":"pan","action":"gesture","from":"3,437","dx":"left","dy":0}]}',
      );
      const exit = yield* Effect.exit(decodeAll(dir));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain('about.journey.json');
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
