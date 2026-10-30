// A member's puppets, one a cut view (`canvas/puppet.ts`): each view's part
// sheet (`sheets/<view>/`, made by `film concept parts`), its parts front to
// back as the sheet's record lists them, each PNG imported by the member's
// module so a scene that draws him is keyed by its bytes (`tools/stamp.ts`),
// on the view's skeleton, with his origin at the kept box's top-left corner
// in the padded part sheet (`frames.ts`): his pixels are the sheet's, drawn
// at its one scale. Each declares the kept view it is held to (`concept`).

import type { PuppetSpec } from '@manna/film/canvas';
import { Record as Records, Struct } from 'effect';
import { keptCorner, paddedBox } from './frames.ts';
import type { Rooted } from './skeleton.ts';
import type { CutFrame, KeptSheet } from './table.ts';

import type { Pt } from './rules.ts';
type Box = readonly [number, number, number, number];
type Rgb = readonly [number, number, number];

/** A cut view's puppet: its skeleton has its root, and it is held to its kept box on its kept sheet. */
export type CutPuppet = PuppetSpec & {
  readonly skeleton: Rooted;
  readonly origin: Pt;
  readonly concept: {
    /** The kept image: the sheet's file, or on the single sheet the view's own (`kept/<view>.png`). */
    readonly image: { readonly cast: string; readonly sheet: KeptSheet; readonly view?: string };
    readonly box: Box;
  };
};

/** A view's parts front to back, each its name and its imported PNG. */
export type Parts = ReadonlyArray<readonly [name: string, png: string]>;

/**
 * The un-matte's options a member names once for all his views, each passed
 * to every view's puppet as `PuppetSpec` names it (`core/unmatte.ts`): `keep`,
 * his light cloth colours, which a rim pixel the line does not reach is his
 * when it lies nearer; `thin`, his thin parts by name, whose rim keeps its
 * hue on another paper; `open`, the sheet's box edges his figure leaves
 * through, past which paper the box cuts off is not un-matted; `grain`,
 * his paper's grain in luma, past which a rim pixel darker than the paper is
 * his cloth, kept whole.
 */
const SHEET = ['keep', 'thin', 'open', 'grain'] as const satisfies ReadonlyArray<keyof PuppetSpec>;

/** What a member's puppets are made from, by his views' names. */
export interface PuppetMember<V extends string> extends Pick<PuppetSpec, (typeof SHEET)[number]> {
  /** His name in the cast (`library/cast/<cast>/`). */
  readonly cast: string;
  readonly frames: Readonly<Record<V, CutFrame>>;
  readonly skeletons: Readonly<Record<V, Rooted>>;
  /** Each view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
  readonly papers: Readonly<Record<V, Rgb>>;
  /** His sheet's line, which a look draws again near what moved. */
  readonly line: NonNullable<PuppetSpec['line']>;
  readonly parts: Readonly<Record<V, Parts>>;
}

/** A view's concept image: a single drawing is its own file, so its view names it; a sheet is named by its kind alone. */
const conceptImage = (
  cast: string,
  sheet: KeptSheet,
  view: string,
): Extract<NonNullable<PuppetSpec['concept']>['image'], { readonly cast: string }> => {
  if (sheet === 'single') return { cast, sheet, view };
  return { cast, sheet };
};

/** Each of a member's views' puppet, by the view's name. */
export const puppetsOf = <V extends string>(
  member: PuppetMember<V>,
): Readonly<Record<V, CutPuppet>> =>
  Records.map(member.parts, (parts, view): CutPuppet => {
    const frame = member.frames[view];
    const sheet = paddedBox(frame);
    return {
      key: `${member.cast}/cutout/${view}`,
      size: [sheet[2] - sheet[0], sheet[3] - sheet[1]],
      parts: parts.map(([name, png]) => ({ name, png })),
      skeleton: member.skeletons[view],
      origin: keptCorner(frame),
      concept: {
        image: conceptImage(member.cast, frame.sheet, view),
        box: frame.kept,
      },
      paper: member.papers[view],
      ...Struct.pick(member, SHEET),
      line: member.line,
    };
  });
