export const ARTBOARDS = { accused: 'Accused', judge: 'Judge', hand: 'Hand' } as const;

export const ACCUSED_ART = { width: 320, height: 300, feet: [160, 280] } as const;

export const ACCUSED_HEAD = -165;

export const ACCUSED_KNOBS = {
  gazeX: 0,
  gazeY: ACCUSED_HEAD,
  follow: 0,
  eyes: 1,
  eyeW: 1,
  browY: 0,
  browTilt: 0,
  mouth: 0,
  mouthLine: 1,
  mouthOpen: 0,
} as const;

export const ACCUSED_TIMELINES = {
  breath: { seconds: 4, move: 4 },
  bow: { seconds: 1.4, move: 0.35 },
  stamp: { seconds: 0.6, move: 0.2 },
  lift: { seconds: 1.2, move: 0.37 },
  boil: { seconds: 4, move: 4 },
} as const;
export type AccusedTimeline = keyof typeof ACCUSED_TIMELINES;

export const ACCUSED_FACE = { node: 'face', height: 76 } as const;

export const JUDGE_ART = { width: 360, height: 360, head: [180, 140] } as const;

export const JUDGE_KNOBS = {
  gazeX: 10,
  gazeY: 220,
  follow: 0,
  eyes: 0.62,
  eyeW: 1,
  browY: 0,
  browTilt: 0,
  mouth: 0,
  mouthLine: 1,
  mouthOpen: 0,
  lean: 0,
} as const;

export const JUDGE_TIMELINES = {
  breath: { seconds: 5, move: 5 },
  boil: { seconds: 4, move: 4 },
} as const;
export type JudgeTimeline = keyof typeof JUDGE_TIMELINES;

export const JUDGE_FACE = { node: 'face', height: 130 } as const;

export const HAND_ART = { width: 48, height: 48 } as const;

export const boilTime = (tick: number) => (tick % 48) / 12 + 1e-4;
