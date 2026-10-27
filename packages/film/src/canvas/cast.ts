// A film's cast render table (`rigs/cast.ts`, `CAST`): each kept view of
// each member's sheets, by member, kind and view name, drawn by its rig in
// its pose, laid in the view's kept box on a canvas the size of the sheet
// (`film concept render`, `tools/cast-render.ts`), so the render reads as the
// sheet and each view is held to the one the owner kept. The rig's origin
// stands at `at` in the sheet's pixels, drawn at the sheet's one scale
// (`CastSheet.scale`): a standing figure's feet on the sheet's ground line, a
// bust's head where the sheet draws it, never a figure fitted to its box.
// What else the view draws lies in the rig's own units about that origin:
// the rigs drawn with it (its hands at its cuffs, a baby's head) and its
// props (a bottle, a stool), each a plain canvas piece. Pure: the table is
// data a test reads in Bun, and only its props' draws touch a canvas.

import type { PoseOf, RivePropSpec } from './rive.ts';

type Pt = readonly [number, number];

/** A box in a sheet's pixels: left, top, right, bottom. */
type SheetBox = readonly [number, number, number, number];

/** A rig drawn with a view's own: its pose, its origin at `at` in the view's units. */
interface CastWith {
  readonly rig: RivePropSpec;
  readonly pose: PoseOf<RivePropSpec>;
  readonly at: Pt;
}

/** A plain canvas piece a view draws (a bottle, a stool): in the view's units about its origin, behind its figure or in front. */
export interface CastProp {
  readonly name: string;
  readonly draw: (ctx: CanvasRenderingContext2D) => void;
  readonly behind?: true;
}

/** One kept view: its kept box, where its rig's origin stands in the sheet's pixels, the rig in its pose, and what is drawn with it. */
export interface CastView {
  readonly box: SheetBox;
  readonly at: Pt;
  readonly rig: RivePropSpec;
  readonly pose: PoseOf<RivePropSpec>;
  readonly with?: ReadonlyArray<CastWith>;
  readonly props?: ReadonlyArray<CastProp>;
}

/** A film's cast render table: member, kind (`turnaround`, `poses`, `heads`), kept view name. */
type CastTable = Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, CastView>>>>>
>;

/** A kept sheet as the render lays it: its size in pixels, and its one scale, sheet pixels a canon unit. */
export interface CastSheet {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

/** Each member's sheets, by kind: what the render's canvas and scale are. */
type CastSheets = Readonly<Record<string, Readonly<Record<string, CastSheet>>>>;

/** What a film's `rigs/cast.ts` gives the cast render: its table, its sheets, and the paper its page lays them on. */
export interface CastModule {
  readonly CAST: CastTable;
  readonly SHEETS: CastSheets;
  readonly PAPER: { readonly base: string; readonly tone: string; readonly seed: number };
}

/** The page name of `member`'s cast render in `film`: what the player mounts and `film concept render` opens. */
export const castPage = (film: string, member: string) => `${film}/cast/${member}`;

/** A film's cast render table, checked by its type: every view of every kind of every member. */
export const castTable = <const T extends CastTable>(table: T): T => table;

/** Every rig a member's views draw, by key: what its page declares and loads. */
export const castRigs = (member: Readonly<Record<string, Readonly<Record<string, CastView>>>>) => {
  const rigs: Record<string, RivePropSpec> = {};
  for (const views of Object.values(member))
    for (const v of Object.values(views))
      for (const rig of [v.rig, ...(v.with ?? []).map((w) => w.rig)]) rigs[rig.key] = rig;
  return rigs;
};
