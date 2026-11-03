// The feast mother's papers, by view: each the median of its kept view's
// border ground. Her puppets un-matte each part's rim from its view's paper
// (`puppets.ts`, `core/unmatte.ts`), and her cut table's clean rule clears the
// paper-coloured rim her part sheets keep outside her ink (`cut.ts`, `CLEAN`).
// Data only: both read it, so neither imports the other's pixels.

/** A paper colour, RGB. */
type Paper = readonly [number, number, number];

/** Her turnaround's cut views, drawn on one sheet in one ink. */
export type TurnaroundView =
  | 'front'
  | 'threeQuarterLeft'
  | 'back'
  | 'profileLeft'
  | 'profileRight'
  | 'threeQuarterRight';

/** Her poses' cut views, holding the baby. */
export type PoseView = 'poses-1' | 'poses-2' | 'poses-3';

/**
 * Each turnaround view's paper: 252,241,221 on all but profileRight, whose
 * ground is 252,242,222, the ground each view's dry-run pads its part sheet with.
 */
export const TURNAROUND_PAPERS = {
  front: [252, 241, 221],
  threeQuarterLeft: [252, 241, 221],
  back: [252, 241, 221],
  profileLeft: [252, 241, 221],
  profileRight: [252, 242, 222],
  threeQuarterRight: [252, 241, 221],
} as const satisfies Readonly<Record<TurnaroundView, Paper>>;

/** Each pose's paper. */
export const POSES_PAPERS = {
  'poses-1': [253, 240, 215],
  'poses-2': [253, 239, 215],
  'poses-3': [253, 240, 215],
} as const satisfies Readonly<Record<PoseView, Paper>>;
