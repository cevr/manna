// Each filler base view's dyed house parts' drawn ramps (shade, base, light),
// measured from their pixels on the kept dressed sheet by `parts-cut.ts`,
// which writes this file. Data.

import type { Ramp } from '@manna/film/canvas';

export const RAMPS = {
  'poses-1': {
    band: { shade: '#3e3a4b', base: '#51566b', light: '#595f75' },
    mantle: { shade: '#a46c48', base: '#b37d52', light: '#bc8659' },
  },
  'poses-2': {
    mantle: { shade: '#7d7651', base: '#8f8859', light: '#948d5c' },
  },
  'poses-3': {
    mantle: { shade: '#4f4f66', base: '#595e72', light: '#5e6376' },
  },
  'poses-4': {
    mantle: { shade: '#927055', base: '#a4805d', light: '#aa8661' },
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Ramp>>>>;
