/**
 * The contained host (`host.ts`) on the cases that once led the driver out
 * of the app, each through `runSim` on a real scratch tree: a configured
 * native path behind a link to outside, `dd/Build` a link to outside (there
 * before, or made by the prebuild), `build.log` a link to an outside file,
 * and a link deep in derived data that the build itself follows. Each is
 * refused, typed, and changes nothing outside the roots; install still works
 * on the layouts a real checkout has (a linked `node_modules`, CocoaPods'
 * header links, a Swift package's linked source, a checkout reached through
 * a linked folder). `contain.slow.test.ts` runs every command and plant.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { runDomain } from './fixtures/contain.ts';
import { checkReceipt, receipts } from './fixtures/differential.ts';

const APP = 'repo/apps/hymnal';
const TRIGGERS = new Set([
  `${APP}/ios`,
  `${APP}/ios/Hymnal`,
  `${APP}/ios/Hymnal.xcworkspace`,
  `${APP}/ios/build/dd/Build`,
  `${APP}/ios/build/dd/Build/Intermediates.noindex/Hymnal.build`,
  'out/build.log',
]);

describe('the contained host against the OS', () => {
  for (const receipt of receipts)
    it.live(`${receipt.world.name}: decides as the OS lands`, () =>
      Effect.gen(function* () {
        const found = yield* Effect.promise(() => checkReceipt(receipt));
        expect(found).toEqual([]);
      }),
    );
});

describe('the contained host', () => {
  it.live('refuses each census trigger, typed, and keeps install alive on real layouts', () =>
    Effect.gen(function* () {
      const found = yield* Effect.promise(() =>
        runDomain({
          kinds: ['out'],
          commands: (name) => name === 'ios:install' || name === 'ios:install --prebuild',
          liveness: (name) => name === 'ios:install',
          plants: (name, plant) =>
            TRIGGERS.has(plant.rel) &&
            (plant.kind === 'out' ||
              (plant.kind === 'prebuild' && name === 'ios:install --prebuild')),
        }),
      );
      expect(found.violations).toEqual([]);
      expect(found.untyped).toEqual([]);
      expect(found.liveness).toEqual([]);
      expect(found.livenessCases).toBe(6);
      expect([...found.triggers].toSorted()).toEqual([
        'build-log',
        'dd-build',
        'deep-dd',
        'native-path',
      ]);
    }),
  );
});
