// A member's puppets, one a cut view (`canvas/puppet.ts`): each view's part
// sheet (`sheets/<view>/`, made by `film concept parts`), its parts front to
// back as the sheet's record lists them, each PNG imported by the member's
// module so a scene that draws him is keyed by its bytes (`tools/stamp.ts`),
// on the view's skeleton, with his origin at the kept box's top-left corner
// in the padded part sheet (`frames.ts`): his pixels are the sheet's, drawn
// at its one scale. Each declares the kept view it is held to (`concept`).

import type { PuppetSpec } from '@manna/film/canvas';
import { Record as Records } from 'effect';
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
    readonly image: { readonly cast: string; readonly sheet: KeptSheet };
    readonly box: Box;
  };
};

/** A view's parts front to back, each its name and its imported PNG. */
export type Parts = ReadonlyArray<readonly [name: string, png: string]>;

/** What a member's puppets are made from, by his views' names. */
export interface PuppetMember<V extends string> {
  /** His name in the cast (`library/cast/<cast>/`). */
  readonly cast: string;
  readonly frames: Readonly<Record<V, CutFrame>>;
  readonly skeletons: Readonly<Record<V, Rooted>>;
  /** Each view's paper, the median of its kept view's border ground (its rim is un-matted from it, `core/unmatte.ts`). */
  readonly papers: Readonly<Record<V, Rgb>>;
  /** His light cloth colours: a rim pixel the un-matte's line does not reach is his, not paper, when it lies nearer one of them (`core/unmatte.ts`, `keep`). */
  readonly keep?: ReadonlyArray<Rgb>;
  /** His thin parts by name, whose rim keeps its hue on another paper (`core/unmatte.ts`, `thin`). */
  readonly thin?: ReadonlyArray<string>;
  /** His sheet's line, which a look draws again near what moved. */
  readonly line: { readonly width: number; readonly ink: Rgb };
  readonly parts: Readonly<Record<V, Parts>>;
}

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
      concept: { image: { cast: member.cast, sheet: frame.sheet }, box: frame.kept },
      paper: member.papers[view],
      keep: member.keep,
      thin: member.thin,
      line: member.line,
    };
  });
