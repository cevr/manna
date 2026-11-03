import type { PuppetSpec } from '@manna/film/canvas';
import type { PartCut } from '@manna/film/tools';
import { Record as Records, Struct } from 'effect';
import { keptCorner, paddedBox } from './frames.ts';
import type { Rooted } from './skeleton.ts';
import type { CutFrame, KeptSheet } from './table.ts';

import type { Pt } from './rules.ts';
type Box = readonly [number, number, number, number];
type Rgb = readonly [number, number, number];

export type CutPuppet = PuppetSpec & {
  readonly skeleton: Rooted;
  readonly origin: Pt;
  readonly concept: {
    readonly image: { readonly cast: string; readonly sheet: KeptSheet; readonly view?: string };
    readonly box: Box;
  };
};

export type Parts = ReadonlyArray<readonly [name: string, png: string]>;

const SHEET = ['keep', 'thin', 'open', 'grain', 'underlap'] as const satisfies ReadonlyArray<
  keyof PuppetSpec
>;

export interface PuppetMember<V extends string> extends Pick<PuppetSpec, (typeof SHEET)[number]> {
  readonly cast: string;
  readonly frames: Readonly<Record<V, CutFrame>>;
  readonly skeletons: Readonly<Record<V, Rooted>>;
  readonly papers: Readonly<Record<V, Rgb>>;
  readonly line: NonNullable<PuppetSpec['line']>;
  readonly parts: Readonly<Record<V, Parts>>;
  readonly cuts: Readonly<Record<V, PartCut>>;
}

const shadowNames = <V extends string>(
  cuts: PuppetMember<V>['cuts'],
  view: V,
): ReadonlyArray<string> => cuts[view].parts.filter((p) => p.role === 'shadow').map((p) => p.name);

const conceptImage = (
  cast: string,
  sheet: KeptSheet,
  view: string,
): Extract<NonNullable<PuppetSpec['concept']>['image'], { readonly cast: string }> => {
  if (sheet === 'single') return { cast, sheet, view };
  return { cast, sheet };
};

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
      shadow: shadowNames(member.cuts, view),
      line: member.line,
    };
  });
