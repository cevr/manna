import type { PuppetSpec } from '@manna/film/canvas';
import type { rasterOf } from '@manna/film/core';
import { Option, Predicate } from 'effect';
import { type PaintedArm, type Rooted, paintedReason } from './skeleton.ts';

type Puppet = Parameters<typeof rasterOf>[0];
export type CensusRow = {
  readonly part: string;
  readonly side: string;
  readonly tag: 'limb' | 'refused' | 'out' | 'neither';
  readonly reason: string;
};

/** The optional cut-view data survives the generic PuppetSpec boundary. */
export const paintedArms = (spec: PuppetSpec): ReadonlyArray<PaintedArm> => {
  const skeleton: PuppetSpec['skeleton'] & Pick<Rooted, 'painted'> = spec.skeleton;
  return Option.getOrElse(Option.fromUndefinedOr(skeleton.painted), () => []);
};

/** Every known arm, including declarations and refusals whose skin is broken. */
export const censusOf = (spec: PuppetSpec, puppet: Puppet): ReadonlyArray<CensusRow> => {
  const arms = new Map<string, string>();
  const sideOf = (names: ReadonlyArray<string>) =>
    Option.getOrElse(
      Option.fromUndefinedOr(
        ['Right', 'Left'].find((side) => names.some((n) => n === 'shoulder' + side)),
      ),
      () => '?',
    );
  for (const [part, bones] of Object.entries(spec.skeleton.skin))
    for (const side of ['Right', 'Left'])
      if (['shoulder', 'elbow', 'wrist'].every((j) => bones.includes(j + side)))
        arms.set(part, side);
  for (const limb of Option.getOrElse(Option.fromUndefinedOr(spec.skeleton.limbs), () => []))
    arms.set(limb.part, sideOf(limb.bones));
  const painted = paintedArms(spec);
  for (const p of painted) arms.set(p.part, sideOf(p.limb.bones));
  for (const refusal of puppet.refused)
    if (!arms.has(refusal.part))
      arms.set(
        refusal.part,
        sideOf(
          Option.getOrElse(Option.fromUndefinedOr(spec.skeleton.skin[refusal.part]), () => []),
        ),
      );
  return [...arms].map(([part, side]): CensusRow => {
    if (puppet.parts.some((p) => p.name === part && Predicate.isNotUndefined(p.limb)))
      return { part, side, tag: 'limb', reason: '' };
    const refused = puppet.refused.filter((r) => r.part === part);
    if (refused.length > 0)
      return { part, side, tag: 'refused', reason: refused.map((r) => r.message).join('; ') };
    return Option.match(Option.fromUndefinedOr(painted.find((p) => p.part === part)), {
      onNone: (): CensusRow => ({ part, side, tag: 'neither', reason: '' }),
      onSome: (p) => ({ part, side, tag: 'out', reason: paintedReason(p) }),
    });
  });
};

/** A typo is never a permitted painted fallback; every refusal is accounted for. */
export const refusalErrors = (
  refused: ReadonlyArray<{
    readonly part: string;
    readonly kind: string;
    readonly message: string;
  }>,
  rows: ReadonlyArray<{ readonly part: string }>,
): ReadonlyArray<string> =>
  refused.flatMap((r) => {
    const errors: Array<string> = [];
    if (!rows.some((row) => row.part === r.part)) errors.push('orphan refusal: ' + r.message);
    if (r.kind === 'declaration') errors.push('declaration: ' + r.message);
    return errors;
  });
