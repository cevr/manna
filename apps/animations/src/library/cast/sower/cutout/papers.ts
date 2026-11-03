/** A paper colour, RGB. */
type Paper = readonly [number, number, number];

/** His turnaround's views, drawn on one sheet in one ink. */
export type TurnaroundView =
  | 'front'
  | 'threeQuarterLeft'
  | 'back'
  | 'profileLeft'
  | 'profileRight'
  | 'threeQuarterRight';

/** His poses' views, drawn on one sheet in one ink. */
export type PosesView = 'poses-1' | 'poses-2' | 'poses-3' | 'poses-4';

/**
 * Each cut view's paper, the median of its kept view's border ground (its rim
 * is un-matted from it, `core/unmatte.ts`), but the left profile's. His is a
 * calibration: his border's median is 250,237,217, but his sheet glows
 * lighter beside his outline (251,243,228 outside his ink), nearer his linen
 * than the border's paper, and un-matted from the border's paper that glow
 * keeps as thin paper strips. 252,245,230 is the paper whose un-matte, run
 * on his view, clears his slivers and holes fit rows, read by simulation.
 */
export const TURNAROUND_PAPERS = {
  front: [250, 237, 217],
  threeQuarterLeft: [250, 236, 216],
  back: [249, 236, 216],
  profileLeft: [252, 245, 230],
  profileRight: [250, 237, 217],
  threeQuarterRight: [250, 236, 216],
} as const satisfies Readonly<Record<TurnaroundView, Paper>>;

/** Each pose's paper, the median of its kept view's border ground. */
export const POSES_PAPERS = {
  'poses-1': [249, 234, 213],
  'poses-2': [249, 233, 211],
  'poses-3': [249, 234, 212],
  'poses-4': [249, 234, 212],
} as const satisfies Readonly<Record<PosesView, Paper>>;
