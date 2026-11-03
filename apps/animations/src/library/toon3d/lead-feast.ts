import type { MemberSpec } from './spec.ts';

/**
 * The feast lead (cast-sheet/look.md) as numbers read off his kept six views:
 * one head is 189 kept px (the front view's hair top to its chin), the soles sit
 * at y 0 and the front view's box centre at x 0. Paints are the kept views'
 * measured lit and shade tones (look.md's hex pairs sit beside them in
 * `LOOK_PAINTS`), because the kept drawing is what each view is measured against.
 */
export const leadFeast: MemberSpec = {
  name: 'lead-feast',
  paints: {
    skin: { base: '#fcaf72', shade: '#de9467' },
    hair: { base: '#71422e', shade: '#663b29' },
    tunic: { base: '#f9dbb6', shade: '#eac6a9' },
    mantle: { base: '#5e848b', shade: '#496679' },
    sash: { base: '#fceccf', shade: '#d4c3b6' },
    sandal: { base: '#9d6847', shade: '#8b4e30' },
  },
  ink: { colour: '#2c1b10', outline: 7, inner: 5 },
  paper: '#fdf1d9',
  shadow: { colour: '#e9d6cf', radii: [0.62, 0.2] },
  light: { direction: [-0.62, 0.42, 0.66], threshold: 0.28, soft: 0.02 },
  head: {
    base: [0, 0, 0],
    sections: [
      [2.43, 0.15, 0.1, 0.25, 2.8],
      [2.47, 0.24, 0.2, 0.17, 3],
      [2.55, 0.285, 0.3, 0.08, 2.8],
      [2.66, 0.31, 0.36, 0.03, 2.5],
      [2.82, 0.305, 0.385, 0, 2.3],
      [3, 0.3, 0.385, -0.01, 2.2],
      [3.14, 0.27, 0.35, -0.02, 2.1],
      [3.25, 0.2, 0.27, -0.02, 2],
      [3.31, 0.08, 0.1, -0.02, 2],
    ],
    proxy: { kind: 'sphere', centre: [-0.05, 2.86, -0.45] },
    face: {
      eyes: [
        { centre: [-0.125, 2.857], radii: [0.027, 0.058] },
        { centre: [0.12, 2.857], radii: [0.027, 0.058] },
      ],
      brows: [
        { centre: [-0.15, 2.905], radius: 0.07, from: 1.05, to: 2.09, width: 0.022 },
        { centre: [0.15, 2.905], radius: 0.07, from: 1.05, to: 2.09, width: 0.022 },
      ],
      mouth: { centre: [0, 2.69], radius: 0.073, from: 3.58, to: 5.85, width: 0.024 },
      lean: 0.45,
    },
    ears: { y: 2.79, x: 0.33, z: -0.03, radii: [0.07, 0.09, 0.05] },
  },
  hair: {
    sections: [
      [2.6, 0.29, 0.36, -0.06, 2.2],
      [2.75, 0.315, 0.42, -0.03, 2.2],
      [2.95, 0.345, 0.43, -0.02, 2.2],
      [3.12, 0.32, 0.4, -0.02, 2.1],
      [3.27, 0.25, 0.32, -0.02, 2],
      [3.37, 0.14, 0.18, -0.02, 2],
      [3.41, 0.04, 0.05, -0.02, 2],
    ],
    line: [3.1, 2.86, 2.6],
    curls: { count: 150, radius: 0.065, lift: 0.01 },
  },
  neck: [
    [2.18, 0.15, 0.13, 0.02, 2],
    [2.6, 0.15, 0.13, 0.04, 2],
  ],
  body: {
    sections: [
      [0.22, 0.47, 0.385, 0.01, 2.4],
      [0.45, 0.465, 0.38, 0.01, 2.4],
      [0.75, 0.45, 0.365, 0.01, 2.4],
      [1.05, 0.42, 0.34, 0.01, 2.4],
      [1.3, 0.37, 0.31, 0.01, 2.4],
      [1.55, 0.34, 0.29, 0.01, 2.4],
      [1.85, 0.35, 0.3, 0, 2.5],
      [2.05, 0.37, 0.29, 0, 2.6],
      [2.17, 0.33, 0.26, 0, 2.4],
      [2.25, 0.25, 0.2, 0, 2.2],
      [2.3, 0.17, 0.14, 0.01, 2],
    ],
    proxy: { kind: 'cylinder', centre: [0.05, 0, -0.12] },
  },
  mantle: {
    edge: { point: [0.15, 2.28, 0], normal: [1.03, -0.55, 0] },
    hem: { point: [0, 0.63, 0], normal: [-0.26, 1, -0.33] },
  },
  sash: {
    y: 1.5,
    height: 0.13,
    swell: 0.035,
    knot: { radius: 0.085, offset: [0, 1.55, 0.36] },
    ends: [
      { top: [-0.03, 1.5, 0.37], bottom: [-0.05, 0.68, 0.44], width: 0.125 },
      { top: [0.04, 1.5, 0.36], bottom: [0.08, 0.74, 0.43], width: 0.125 },
    ],
  },
  arms: {
    right: {
      shoulder: [-0.27, 2.06, 0],
      upper: 0.4,
      fore: 0.38,
      hang: [-0.27, 0],
      radii: [0.12, 0.125, 0.16],
      hand: 0.125,
      paint: 'tunic',
    },
    left: {
      shoulder: [0.27, 2.06, 0],
      upper: 0.4,
      fore: 0.38,
      hang: [0.27, 0],
      radii: [0.125, 0.13, 0.165],
      hand: 0.125,
      paint: 'mantle',
    },
  },
  feet: { x: 0.28, radii: [0.19, 0.12, 0.28], z: 0.14, sole: 0.04, strap: [0.08, 0.13] },
};

/** look.md's own hex pairs, kept for the measured comparison against the kept views' paint. */
export const LOOK_PAINTS: MemberSpec['paints'] = {
  skin: { base: '#f2b27c', shade: '#c9877e' },
  hair: { base: '#6c432b', shade: '#57384a' },
  tunic: { base: '#f2d8b7', shade: '#cbbfd2' },
  mantle: { base: '#58767a', shade: '#4f5f78' },
  sash: { base: '#eadcc2', shade: '#c8bdd6' },
  sandal: { base: '#7a5236', shade: '#7a5236' },
};
