type Paper = readonly [number, number, number];

export type TurnaroundView =
  | 'front'
  | 'threeQuarterLeft'
  | 'back'
  | 'profileLeft'
  | 'profileRight'
  | 'threeQuarterRight';

export type PoseView = 'poses-1' | 'poses-2' | 'poses-3';

export const TURNAROUND_PAPERS = {
  front: [252, 241, 221],
  threeQuarterLeft: [252, 241, 221],
  back: [252, 241, 221],
  profileLeft: [252, 241, 221],
  profileRight: [252, 242, 222],
  threeQuarterRight: [252, 241, 221],
} as const satisfies Readonly<Record<TurnaroundView, Paper>>;

export const POSES_PAPERS = {
  'poses-1': [253, 240, 215],
  'poses-2': [253, 239, 215],
  'poses-3': [253, 240, 215],
} as const satisfies Readonly<Record<PoseView, Paper>>;
