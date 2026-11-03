import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { Option, Record as Records } from 'effect';
import { CUT_AWAY, KEEP_REST } from './prompts.ts';
import { FAR, type Pt, box } from './rules.ts';
import type { Rooted } from './skeleton.ts';

type Take = PartCut['parts'][number]['take'];

export const bustSkeleton = (pivot: Pt, foot: number): Rooted => ({
  bones: [
    { name: 'lean', pivot: [pivot[0], foot], tip: pivot },
    { name: 'head', parent: 'lean', pivot, tip: [pivot[0], 10] },
  ],
  skin: { head: ['head'], torso: ['lean'] },
  root: [pivot[0], foot],
});

export interface Bust {
  readonly line: readonly Pt[];
  readonly pivot: Pt;
  readonly neighbour?: Take;
}

export const bustCut = ({ line, pivot, neighbour }: Bust): PartCut => ({
  parts: [
    ...Option.match(Option.fromUndefinedOr(neighbour), {
      onNone: () => [],
      onSome: (take) => [{ name: 'neighbour', take }],
    }),
    { name: 'head', take: [{ polygon: [[-1, -1], [FAR, -1], ...line] }], pivot },
    { name: 'torso', take: [box(-1, -1, FAR, FAR)] },
  ],
});

export interface BehindHead {
  readonly head: string;
  readonly behind: string;
}

export const bustHidden = <V extends string>(
  { head, behind }: BehindHead,
  turns: Readonly<Record<V, string>>,
): Readonly<Record<V, HiddenEntry>> =>
  Records.map(turns, (turn) => ({
    moving: ['head'],
    prompt: `${CUT_AWAY} his head (${head}) was cut away to make a cut-out puppet.${turn} Repaint ONLY the magenta area, as what lies behind his head${behind} ${KEEP_REST}`,
  }));
