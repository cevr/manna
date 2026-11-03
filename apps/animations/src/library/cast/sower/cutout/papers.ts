type Paper = readonly [number, number, number];

export type TurnaroundView =
  | 'front'
  | 'threeQuarterLeft'
  | 'back'
  | 'profileLeft'
  | 'profileRight'
  | 'threeQuarterRight';

export type PosesView = 'poses-1' | 'poses-2' | 'poses-3' | 'poses-4';

export const TURNAROUND_PAPERS = {
  front: [250, 237, 217],
  threeQuarterLeft: [250, 236, 216],
  back: [249, 236, 216],
  profileLeft: [252, 245, 230],
  profileRight: [250, 237, 217],
  threeQuarterRight: [250, 236, 216],
} as const satisfies Readonly<Record<TurnaroundView, Paper>>;

export const POSES_PAPERS = {
  'poses-1': [249, 234, 213],
  'poses-2': [249, 233, 211],
  'poses-3': [249, 234, 212],
  'poses-4': [249, 234, 212],
} as const satisfies Readonly<Record<PosesView, Paper>>;
