import * as BunServices from '@effect/platform-bun/BunServices';
import { rasterOf } from '@manna/film/core';
import { PuppetImagesBun, puppetFrom } from '@manna/film/tools';
import { Console, Effect, Layer } from 'effect';
import { expect, it } from 'effect-bun-test';
import { bareEdges, countEdges, inverse, kindsOf, measuredHand } from './limb-check.ts';
import { cutViews } from './views.ts';

const layer = Layer.mergeAll(
  BunServices.layer,
  PuppetImagesBun.pipe(Layer.provide(BunServices.layer)),
);
const elbows = [25, 40, 55, 70, 85, 100, 115, 120];
const wrists = [-120, -90, -60, -30, 0, 30, 60, 90, 120];

/** Each view belongs to exactly one shard; each pose is a bounded test.
 * The last case prints each limb's worst measure and the pose that caused it. */
export const sweep = (shard: number, shards: number) =>
  Effect.gen(function* () {
    const views = yield* cutViews;
    for (const [index, spec] of views.entries()) {
      if (index % shards !== shard) continue;
      const puppet = yield* puppetFrom(spec);
      for (const arm of puppet.parts) {
        if (!arm.limb) continue;
        const measured = measuredHand(puppet, arm.name);
        const alone = { ...puppet, parts: [arm] };
        const base = { ...puppet, parts: puppet.parts.map(({ limb: _limb, ...part }) => part) };
        const elbowBone = arm.limb.bones[1];
        const wristBone = arm.limb.bones[2];
        const draw = (elbow: number, wrist: number) =>
          rasterOf(alone, {
            numbers: { [elbowBone]: elbow, [wristBone]: wrist },
            root: puppet.root,
            scale: 1,
          });
        const rest = bareEdges(draw(0, 0), measured, 0);
        const worst = { whole: 0, exposed: 0, unprotected: 0, ghost: 0 };
        const where = { whole: '', exposed: '', unprotected: '', ghost: '' };
        for (const elbow of elbows)
          for (const wrist of wrists)
            it.effect(`${spec.key} ${arm.name} ${elbow}/${wrist}: whole and inked cuff`, () =>
              Effect.sync(() => {
                const r = draw(elbow, wrist);
                const edges = countEdges(
                  r,
                  kindsOf(r, measured),
                  inverse(measured, elbow, wrist),
                  measured,
                );
                const values = {
                  whole: Math.max(0, bareEdges(r, measured, elbow) - rest),
                  exposed: edges.exposed,
                  unprotected: edges.unprotected,
                  ghost: edges.ghost,
                };
                for (const key of ['whole', 'exposed', 'unprotected', 'ghost'] as const)
                  if (values[key] > worst[key]) {
                    worst[key] = values[key];
                    where[key] = `${elbow}/${wrist}`;
                  }
                expect(values.whole).toBeLessThanOrEqual(12);
                expect(values.exposed).toBeLessThanOrEqual(8);
                expect(values.unprotected).toBe(0);
                expect(values.ghost).toBe(0);
              }),
            );
        it.effect(`${spec.key} ${arm.name}: painted identity at 0/10/19`, () =>
          Effect.sync(() => {
            for (const elbow of [0, 10, 19]) {
              const pose = { numbers: { [elbowBone]: elbow }, root: puppet.root, scale: 1 };
              expect(
                Buffer.compare(
                  Buffer.from(rasterOf(puppet, pose).rgba),
                  Buffer.from(rasterOf(base, pose).rgba),
                ),
              ).toBe(0);
            }
          }),
        );
        it.effect(`${spec.key} ${arm.name}: sweep receipt`, () =>
          Console.log(
            `SWEEP ${spec.key} ${arm.name}: whole=${worst.whole}@${where.whole} mixed=${worst.exposed}@${where.exposed} unprotected=${worst.unprotected}@${where.unprotected} ghost=${worst.ghost}@${where.ghost}; rest=${rest}; cloth=${measured.cloth.join('/')} skin=${measured.skin.join('/')}`,
          ),
        );
      }
    }
  }).pipe(Effect.provide(layer));
