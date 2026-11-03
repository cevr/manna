import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import {
  SLOW,
  DEVICES,
  byPlace,
  unmeasured,
  CONTEXT_MENU,
  RECEIPTS,
  STATES,
  targetsIn,
} from './studio-states.ts';

for (const device of DEVICES) {
  describe(`touch targets on ${device.name}`, () => {
    for (const [place, state] of byPlace(STATES))
      it.live(state.name, () => targetsIn(place, state, device), SLOW);
  });
}

describe('a place named exempt from a guard', () => {
  test('is measured at a place that has cases, in every table', () => {
    expect(unmeasured(STATES)).toEqual([]);
  });

  test('is found when the place measuring it is exempt itself', () => {
    expect(
      unmeasured({
        ...STATES,
        ask: { measuredAt: 'askPage', why: 'planted' },
        askPage: { measuredAt: 'askPage', why: 'planted' },
      }),
    ).toEqual(['ask', 'askPage']);
  });
});

const ROLE = /(?:data-role="([\w-]+)"|\brole="([\w-]+-menu)")/g;

const PARTS: ReadonlySet<string> = new Set(['receipt']);

const surfacesOf = (sources: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.from(
    new Set(sources.flatMap((s) => Array.from(s.matchAll(ROLE), (m) => m[1] ?? m[2] ?? ''))),
  ).filter((role) => role !== '' && !PARTS.has(role));

const unopened = (surfaces: ReadonlyArray<string>, layers: ReadonlyArray<string>) =>
  surfaces.filter((role) => !layers.some((layer) => layer.includes(`data-role="${role}"`)));

describe('the command surfaces', () => {
  const layers = byPlace(STATES).flatMap(([, state]) =>
    Option.toArray(Option.fromUndefinedOr(state.layer)),
  );

  it.live('each has a case that opens and measures it', () =>
    Effect.gen(function* () {
      const dir = `${import.meta.dir}/../../src/lab/command`;
      const fs = yield* FileSystem.FileSystem;
      const names = (yield* fs.readDirectory(dir)).filter((name) => name.endsWith('.tsx'));
      const sources = yield* Effect.forEach(names, (name) => fs.readFileString(`${dir}/${name}`));
      const surfaces = surfacesOf(sources);
      expect(surfaces).toEqual(
        expect.arrayContaining([
          'command-menu',
          'context-menu',
          'view-menu',
          'receipts',
          'keys-sheet',
        ]),
      );
      expect(unopened(surfaces, layers)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  test('one no case opens is found', () => {
    expect(unopened(['receipts', 'chip-menu'], [CONTEXT_MENU, RECEIPTS])).toEqual(['chip-menu']);
  });
});
