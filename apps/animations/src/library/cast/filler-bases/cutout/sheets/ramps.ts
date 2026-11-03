import type { Ramp } from '@manna/film/canvas';

export const RAMPS = {
  'poses-1': {
    band: { shade: '#3a3748', base: '#51566b', light: '#5f677f' },
    mantle: { shade: '#a16946', base: '#b37d52', light: '#c28b5c' },
  },
  'poses-2': {
    mantle: { shade: '#7b734f', base: '#8f8859', light: '#9e9561' },
  },
  'poses-3': {
    mantle: { shade: '#4e4e65', base: '#595e72', light: '#606579' },
  },
  'poses-4': {
    mantle: { shade: '#8e6d52', base: '#a4805d', light: '#b38d64' },
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, Ramp>>>>;
