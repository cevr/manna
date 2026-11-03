import type { PartRule } from '@manna/film/tools';

export type Pt = readonly [number, number];

export const FAR = 100_000;

export const REACH = 400;

export const box = (x0: number, y0: number, x1: number, y1: number): PartRule => ({
  polygon: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
});

export interface Sleeve {
  readonly inner: ReadonlyArray<Pt>;
  readonly shoulder: Pt;
  readonly cap: number;
  readonly side: 'left' | 'right';
}

const innerAt = (inner: ReadonlyArray<Pt>, y: number) => {
  const first = inner[0] ?? [0, 0];
  if (y <= first[1]) return first[0];
  for (let k = 1; k < inner.length; k++) {
    const [x0, y0] = inner[k - 1] ?? first;
    const [x1, y1] = inner[k] ?? first;
    if (y <= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  return (inner[inner.length - 1] ?? first)[0];
};

const edgeFrom = (inner: ReadonlyArray<Pt>, y: number): Pt[] => [
  [innerAt(inner, y), y],
  ...inner.filter((p) => p[1] > y),
];

export const sleeve = (s: Sleeve) => {
  const [out, across] = { left: [-1, FAR] as const, right: [FAR, -1] as const }[s.side];
  const bottom = (s.inner[s.inner.length - 1] ?? s.shoulder)[1];
  const top = (s.inner[0] ?? s.shoulder)[1];
  const below = edgeFrom(s.inner, s.shoulder[1]);
  const whole = edgeFrom(s.inner, top);
  const take: PartRule[] = [
    { polygon: [[out, s.shoulder[1]], ...below, [out, bottom]] },
    { disc: { c: s.shoulder, r: s.cap } },
  ];
  const unless: PartRule[] = [{ polygon: [[across, top], ...whole, [across, bottom]] }];
  return { take, unless };
};

export type Hem = readonly [hem: number, middle: number, drop: number, reach: number];

export const belowHem = (hem: number, middle: number, drop: number, reach: number): PartRule => ({
  polygon: [
    [-1, hem],
    [middle - reach, hem],
    [middle, hem + drop],
    [middle + reach, hem],
    [FAR, hem],
    [FAR, FAR * 2],
    [-1, FAR * 2],
  ],
});

export const aboveHem = (hem: number, middle: number, drop: number, reach: number): PartRule => ({
  polygon: [
    [-1, -1],
    [FAR, -1],
    [FAR, hem],
    [middle + reach, hem],
    [middle, hem + drop],
    [middle - reach, hem],
    [-1, hem],
  ],
});

export type SoleRuns = ReadonlyArray<readonly [number, number, number]>;

export const underSole = (runs: SoleRuns): PartRule => {
  const first = runs[0]?.[0] ?? 0;
  const last = (runs[runs.length - 1]?.[1] ?? 0) + 1;
  return {
    polygon: [
      [-FAR, -FAR],
      [first, -FAR],
      ...runs.flatMap(([a, b, row]): Pt[] => [
        [a, row + 1],
        [b + 1, row + 1],
      ]),
      [last, -FAR],
      [FAR, -FAR],
      [FAR, FAR * 2],
      [-FAR, FAR * 2],
    ],
  };
};
