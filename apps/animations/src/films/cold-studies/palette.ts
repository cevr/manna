import { type Hex, type Ramp, type Shading, ramp } from '@manna/film/canvas';
import type { Looks } from '@manna/film/core';
import { palette as court } from '../righteousness-by-faith/palette.ts';

export const looks = {
  style: {
    options: {
      cutpaper: 0,
      ps1: 1,
      painterly: 2,
      engraving: 3,
      bold: 4,
      rive: 5,
      rivegl: 6,
      papercut: 7,
      papercutgl: 8,
    },
    play: 'cutpaper',
  },
} as const satisfies Looks;

export type Style = keyof typeof looks.style.options;

export const STYLE: Style = looks.style.play;

export const palette = {
  paper: '#eeddc8',
  paperTone: '#8c7f71',
  ink: '#332b23',
  plate: '#fcfefc',
  shade: '#423123',
} satisfies Record<string, Hex>;

const keyLight: Hex = '#f3e9c8';

const shading: Shading = {
  turn: 20,
  dark: 0.22,
  lift: 0.4,
  deep: 13.5,
  neutral: 0.65,
  warm: 8.5,
  fade: 0.6,
};

export type { Ramp };

const shaded = (base: Hex): Ramp => ramp(base, keyLight, shading);

export const ramps = {
  ink: shaded(court.outline),
  paper: shaded(court.paper),
} as const satisfies Record<string, Ramp>;

export const hues = {
  bench: '#8a7567',
  rim: '#614940',
  panel: '#664b47',
  block: '#4d3932',
  sheets: ['#edddb9', '#b6d0e3', '#c6deb1', '#e8c4b5'],
} as const satisfies Record<string, Hex | Ramp | ReadonlyArray<Hex>>;

export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
} satisfies Record<string, string>;
