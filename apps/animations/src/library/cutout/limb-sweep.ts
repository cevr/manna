import * as BunServices from '@effect/platform-bun/BunServices';
import { rasterOf } from '@manna/film/core';
import { PuppetImagesBun, puppetFrom } from '@manna/film/tools';
import { Console, Effect, FileSystem, Layer, Option, Result } from 'effect';
import { expect, it } from 'effect-bun-test';
import {
  bareEdges,
  colourMatch,
  countEdges,
  inverse,
  kindsOf,
  measuredHand,
  shoulderInk,
  shoulderRasters,
  handShare,
  limbCanvas,
} from './limb-check.ts';
import { censusOf, paintedArms, refusalErrors } from './limb-census.ts';
import { posesFor, shardOf } from './limb-shards.ts';
import { paintedReason } from './skeleton.ts';
import { cutViews } from './views.ts';

const layer = Layer.mergeAll(
  BunServices.layer,
  PuppetImagesBun.pipe(Layer.provide(BunServices.layer)),
);

/** Poses are dealt across derived file shards; metadata and opt-outs have
 * one owner per view. Every shard prints its pose count and worst measures. */
export const sweep = (file: string) =>
  Effect.gen(function* () {
    const views = yield* cutViews;
    const fs = yield* FileSystem.FileSystem;
    const { index: shard, count: shards } = Result.getOrThrow(
      shardOf(file, yield* fs.readDirectory(import.meta.dir)),
    );
    for (const [index, spec] of views.entries()) {
      const ownedPoses = posesFor(index, { index: shard, count: shards });
      if (ownedPoses.length === 0) continue;
      const puppet = yield* puppetFrom(spec);
      const census = censusOf(spec, puppet);
      expect(refusalErrors(puppet.refused, census)).toEqual([]);
      const swept: Array<string> = [];
      for (const arm of puppet.parts) {
        if (!arm.limb) continue;
        swept.push(arm.name);
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
        for (const [elbow, wrist] of ownedPoses)
          it.effect(`${spec.key} ${arm.name} ${elbow}/${wrist}: whole and inked cuff`, () =>
            Effect.gen(function* () {
              const canvas = limbCanvas(puppet, measured, elbow, wrist);
              const r = rasterOf(alone, canvas.pose, canvas.size);
              const edges = countEdges(
                r,
                kindsOf(r, measured),
                inverse(measured, elbow, wrist, canvas.offset),
                measured,
              );
              const values = {
                whole: Math.max(0, bareEdges(r, measured, elbow, canvas.offset) - rest),
                exposed: edges.exposed,
                unprotected: edges.unprotected,
                ghost: edges.ghost,
              };
              for (const key of ['whole', 'exposed', 'unprotected', 'ghost'] as const)
                if (values[key] > worst[key]) {
                  worst[key] = values[key];
                  where[key] = `${elbow}/${wrist}`;
                }
              const crop = shoulderRasters(puppet, measured, elbow, wrist);
              const shoulder = shoulderInk(
                crop.engine,
                crop.painted,
                measured,
                elbow,
                crop.offset,
                wrist,
                crop.fixed,
                crop.moving,
                crop.fixedMoving,
              );
              const paintedArm = { ...alone, parts: base.parts.filter((p) => p.name === arm.name) };
              const front = { ...base, parts: base.parts.slice(0, puppet.parts.indexOf(arm)) };
              const hand = handShare(
                r,
                rasterOf(paintedArm, canvas.pose, canvas.size),
                rasterOf(front, canvas.pose, canvas.size),
                measured,
                elbow,
                wrist,
                canvas.offset,
              );
              yield* Console.log(
                `HAND ${spec.key} ${arm.name} ${elbow}/${wrist}: share=${hand.share.toFixed(4)} reference=${hand.reference} visible=${hand.visible} painted=${hand.painted} owned=${hand.owned}; whole=${values.whole} mixed=${values.exposed} unprotected=${values.unprotected} ghost=${values.ghost} shoulder=${shoulder}`,
              );
              expect(values.whole).toBeLessThanOrEqual(12);
              expect(values.exposed).toBeLessThanOrEqual(8);
              expect(values.unprotected).toBe(0);
              expect(values.ghost).toBe(0);
              expect(shoulder).toBe(0);
              expect(hand.owned).toBeGreaterThan(0);
              expect(hand.share).toBeGreaterThanOrEqual(0.85);
            }),
          );
        if (index % shards === shard) {
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
          const pad = 256;
          const big = { ...puppet, width: puppet.width + 2 * pad, height: puppet.height + 2 * pad };
          const pose = (elbow: number, wrist: number) => ({
            numbers: { [elbowBone]: elbow, [wristBone]: wrist },
            root: [puppet.root[0] + pad, puppet.root[1] + pad] as const,
            scale: 1,
          });
          const forcedArm = { ...arm, limb: { ...measured.limb, fade: [-2, -1] as const } };
          const plain = { ...big, parts: base.parts };
          const forced = {
            ...big,
            parts: puppet.parts.map((p) => {
              if (p.name === arm.name) return forcedArm;
              return p;
            }),
          };
          const [bx, by, bw, bh] = measured.limb.regions.box;
          const reach = Math.ceil(measured.limb.chain.fore * 0.9);
          const box = [
            Math.max(0, bx + pad - reach),
            Math.max(0, by + pad - reach),
            Math.min(big.width, bx + bw + pad + reach),
            Math.min(big.height, by + bh + pad + reach),
          ] as const;
          it.effect(`${spec.key} ${arm.name}: E receipt`, () =>
            Effect.gen(function* () {
              const E = colourMatch(rasterOf(plain, pose(0, 0)), rasterOf(forced, pose(0, 0)), box);
              yield* Console.log(
                `METRIC ${spec.key} ${arm.name}: E_IoU=${E.iou.toFixed(4)} E_dE=${E.de.toFixed(4)}`,
              );
            }),
          );
          it.effect(`${spec.key} ${arm.name}: swap receipt`, () =>
            Effect.gen(function* () {
              const E = colourMatch(
                rasterOf(plain, pose(19.9, -0.85 * 19.9)),
                rasterOf(big, pose(20, -17)),
                box,
              );
              yield* Console.log(`METRIC ${spec.key} ${arm.name}: swap_dE=${E.de.toFixed(4)}`);
            }),
          );
          it.effect(`${spec.key} ${arm.name}: visible hand receipt`, () =>
            Effect.gen(function* () {
              const skin = (r: ReturnType<typeof rasterOf>) =>
                kindsOf(r, measured).filter((k) => k === 3).length;
              const visible = skin(rasterOf({ ...big, parts: [forcedArm] }, pose(0, 0)));
              const original = skin(
                rasterOf(
                  { ...big, parts: base.parts.filter((p) => p.name === arm.name) },
                  pose(0, 0),
                ),
              );
              yield* Console.log(
                `METRIC ${spec.key} ${arm.name}: hand_visible=${visible}/${original}=${(visible / Math.max(1, original)).toFixed(4)}`,
              );
            }),
          );
        }
        it.effect(`${spec.key} ${arm.name}: sweep receipt`, () =>
          Console.log(
            `SWEEP ${spec.key} ${arm.name}: shard=${shard} poses=${ownedPoses.length} whole=${worst.whole}@${where.whole} mixed=${worst.exposed}@${where.exposed} unprotected=${worst.unprotected}@${where.unprotected} ghost=${worst.ghost}@${where.ghost}; rest=${rest}; cloth=${measured.cloth.join('/')} skin=${measured.skin.join('/')}`,
          ),
        );
      }
      it.effect(`${spec.key}: sweep covers every census limb`, () =>
        Effect.sync(() => {
          expect(swept.toSorted()).toEqual(
            census
              .filter((r) => r.tag === 'limb')
              .map((r) => r.part)
              .toSorted(),
          );
        }),
      );
      const painted = paintedArms(spec);
      if (painted.length > 0 && index % shards === shard) {
        const trial = yield* puppetFrom({
          ...spec,
          skeleton: {
            ...spec.skeleton,
            limbs: [
              ...Option.getOrElse(Option.fromUndefinedOr(spec.skeleton.limbs), () => []),
              ...painted.map((p) => p.limb),
            ],
          },
        });
        for (const out of painted)
          it.effect(`${spec.key} ${out.part}: opt-out condition still fails`, () =>
            Effect.gen(function* () {
              expect(Array.isArray(out.reason)).toBe(true);
              const measured = measuredHand(trial, out.part);
              const alone = { ...trial, parts: [measured.arm] };
              const draw = (elbow: number, wrist: number) =>
                rasterOf(alone, {
                  numbers: { [measured.limb.bones[1]]: elbow, [measured.limb.bones[2]]: wrist },
                  root: trial.root,
                  scale: 1,
                });
              const rest = bareEdges(draw(0, 0), measured, 0);
              const receipt: Array<string> = [];
              const conditions: Array<readonly [number, number]> = [];
              for (const reason of out.reason) {
                const r = draw(reason.elbow, reason.wrist);
                const edges = countEdges(
                  r,
                  kindsOf(r, measured),
                  inverse(measured, reason.elbow, reason.wrist),
                  measured,
                );
                let shoulder = 0;
                if (reason.measure === 'shoulder') {
                  const crop = shoulderRasters(trial, measured, reason.elbow, reason.wrist);
                  shoulder = shoulderInk(
                    crop.engine,
                    crop.painted,
                    measured,
                    reason.elbow,
                    crop.offset,
                    reason.wrist,
                    crop.fixed,
                    crop.moving,
                    crop.fixedMoving,
                  );
                }
                const values = {
                  ...edges,
                  whole: Math.max(0, bareEdges(r, measured, reason.elbow) - rest),
                  shoulder,
                };
                conditions.push([values[reason.measure], reason.bound]);
                receipt.push(`${reason.measure}=${values[reason.measure]}`);
              }
              yield* Console.log(
                `OUT ${spec.key} ${out.part}: ${paintedReason(out)}; measured ${receipt.join('; ')}`,
              );
              for (const [value, bound] of conditions) expect(value).toBeGreaterThan(bound);
            }),
          );
      }
    }
  }).pipe(Effect.provide(layer));
