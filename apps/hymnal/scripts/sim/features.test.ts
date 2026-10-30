/**
 * The verify-hymnal journey files: every `features/<feature>.journey.json`
 * decodes with the journey Schema and names its own feature, so a bad file
 * fails the gate rather than the verifier's first `sim journey`; and no hold
 * checks that something is gone before the hold has landed.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, FileSystem, Path, Schema } from 'effect';

import { BadJourney } from './errors.ts';
import { decodeJourney, HOLD_SETTLE, type Journey } from './journey.ts';

const SUFFIX = '.journey.json';

/**
 * Seconds after `sim hold` returns by which its press has landed: SKILL.md's
 * `sim hold` line, "the press lands 5 to 9 s after it returns".
 */
const HOLD_LANDS = 9;

/** Decode each journey file in `dir`, by feature, or fail on the first file refused. */
const decodeAll = Effect.fn('decodeAll')(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files = (yield* fs.readDirectory(dir)).filter((name) => name.endsWith(SUFFIX)).sort();
  const journeys: Array<Journey> = [];
  for (const name of files) {
    const file = path.join(dir, name);
    const journey = yield* decodeJourney(file, yield* fs.readFileString(file));
    if (journey.feature !== name.slice(0, -SUFFIX.length)) {
      return yield* BadJourney.make({ file, issue: `its feature is ${journey.feature}` });
    }
    journeys.push(journey);
  }
  return journeys;
});

/**
 * The holds that check for a target gone before the press can have landed:
 * a `hides` in the hold's own expects, or in the next step's when the hold
 * has none, after a settle shorter than `HOLD_LANDS`. A `hides` checked then
 * finds what the pending hold is about to remove.
 */
const hidesBeforeLanding = (journey: Journey) =>
  journey.steps.flatMap((step, index) => {
    if (step.action !== 'hold' || (step.settle ?? HOLD_SETTLE) >= HOLD_LANDS) return [];
    let after = step.expect;
    if (after.length === 0) after = journey.steps[index + 1]?.expect ?? [];
    if (!after.some((expect) => 'hides' in expect)) return [];
    return [`${journey.feature}/${step.name}`];
  });

const toJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const FEATURES = import.meta.dir + '/../../../../.claude/skills/verify-hymnal/features';

describe('verify-hymnal journey files', () => {
  it.effect('every journey file decodes and names its own feature', () =>
    Effect.gen(function* () {
      const journeys = yield* decodeAll(FEATURES);
      expect(journeys.map((journey) => journey.feature)).toEqual([
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

  it.effect('no shipped hold checks a target gone before its press lands', () =>
    Effect.gen(function* () {
      const journeys = yield* decodeAll(FEATURES);
      expect(journeys.flatMap(hidesBeforeLanding)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('a hold with a short settle before a hides is named; the default settle is not', () =>
    Effect.gen(function* () {
      const hold = { action: 'hold', target: 'id=key-button' };
      const text = toJson({
        feature: 'chords-and-capo',
        platform: 'ios',
        steps: [
          { ...hold, name: 'own', settle: 2, expect: [{ hides: 'id=chord-1-1-1' }] },
          { ...hold, name: 'next', settle: 2 },
          { name: 'gone', action: 'back', expect: [{ hides: 'id=chord-1-1-1' }] },
          { ...hold, name: 'shows-first', settle: 2, expect: [{ shows: 'id=chord-1-1-1' }] },
          { ...hold, name: 'default', expect: [{ hides: 'id=chord-1-1-1' }] },
        ],
      });
      const journey = yield* decodeJourney('chords-and-capo.journey.json', text);
      expect(hidesBeforeLanding(journey)).toEqual(['chords-and-capo/own', 'chords-and-capo/next']);
    }),
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
