// A heads-only member's bust: each view cut into his head over the rest of
// him, the head turning at the foot of his beard while the rest leans from
// the view's foot. The member gives each view's line, pivot and foot in the
// kept view's pixels, any still `neighbour` take, and the words for what lies
// behind his head; this module gives the bone names, the parts and their
// order, which parts a pose moves, and the prompt's frame. A view's skeleton
// goes into its part sheet's frame through `framed` (`skeleton.ts`).

import type { HiddenEntry, PartCut } from '@manna/film/tools';
import { Option, Record as Records } from 'effect';
import { CUT_AWAY, KEEP_REST } from './prompts.ts';
import { FAR, type Pt, box } from './rules.ts';
import type { Rooted } from './skeleton.ts';

/** The rules a part takes its pixels by. */
type Take = PartCut['parts'][number]['take'];

/**
 * A bust's skeleton in view pixels: the lean rises from the view's foot
 * (`foot`, the view's height) straight below the head's pivot (`pivot`, the
 * foot of his beard) up to it, and the head turns on the head bone above it.
 * His head part lies on the head bone, his torso on the lean.
 */
export const bustSkeleton = (pivot: Pt, foot: number): Rooted => ({
  bones: [
    { name: 'lean', pivot: [pivot[0], foot], tip: pivot },
    { name: 'head', parent: 'lean', pivot, tip: [pivot[0], 10] },
  ],
  skin: { head: ['head'], torso: ['lean'] },
  root: [pivot[0], foot],
});

/** A view's bust, in view pixels. */
export interface Bust {
  /** The head's lower edge, from one side of the view to the other: the head is the box above it. */
  readonly line: readonly Pt[];
  /** Where the head turns. */
  readonly pivot: Pt;
  /** Pixels in the view's box that another view on the sheet draws: a still first part, so that the cutter leaves no figure pixel in no part. */
  readonly neighbour?: Take;
}

/** A bust's cut: its still `neighbour` first when it has one, then his head above the line, turning at the pivot, then the rest of him as the torso. */
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

/** A member's words for what lies behind his head. */
export interface BehindHead {
  /** What his head holds, as the prompt names what was cut away. */
  readonly head: string;
  /** What follows "as what lies behind his head", from its punctuation on: his neck, and what else his head covered. */
  readonly behind: string;
}

/**
 * Each view's hidden entry, given how he is turned in it (`turns`, a sentence
 * with its leading space): only his head moves, so his torso and any
 * neighbour stay and nothing is repainted under them, and okra repaints what
 * lies behind his head in the member's words, the same in every view but for
 * his turn.
 */
export const bustHidden = <V extends string>(
  { head, behind }: BehindHead,
  turns: Readonly<Record<V, string>>,
): Readonly<Record<V, HiddenEntry>> =>
  Records.map(turns, (turn) => ({
    moving: ['head'],
    prompt: `${CUT_AWAY} his head (${head}) was cut away to make a cut-out puppet.${turn} Repaint ONLY the magenta area, as what lies behind his head${behind} ${KEEP_REST}`,
  }));
