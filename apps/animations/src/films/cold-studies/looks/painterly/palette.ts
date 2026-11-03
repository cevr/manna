import type { Hex } from '@manna/film/canvas';

export type Ramp = readonly [Hex, Hex, Hex, Hex, Hex];

export const P = {
  ink: '#121a1b',
  gloom: '#17242a',
  teal: '#173634',
  cream: '#efe4c8',
  gold: '#c8961e',
  scarlet: '#9a1d16',
  flame: '#fff1cf',
  lamp: '#f0b860',
  sky: '#dfe8dc',
} as const satisfies Record<string, Hex>;

export const R = {
  wall: ['#18252a', '#22343a', '#33494c', '#4f6764', '#7d928a'],
  panel: ['#140f0d', '#21170f', '#352315', '#55361d', '#8a5d30'],
  wood: ['#160f0c', '#271a12', '#3f2a19', '#694422', '#b07a3c'],
  floor: ['#121616', '#1d2423', '#2c3532', '#4c524a', '#8b8a74'],
  glass: ['#5f7a78', '#86a29c', '#aac2b8', '#cddbd0', '#eef2e4'],
  skin: ['#2e3638', '#575252', '#8a6d5a', '#bf9370', '#e8c398'],
  hair: ['#101515', '#1c2323', '#2c3331', '#46493f', '#6d6650'],
  coat: ['#151f22', '#203034', '#2f4547', '#4b625e', '#7b8a78'],
  robe: ['#0e1314', '#161e20', '#212c2d', '#33403d', '#5c5a46'],
  shirt: ['#3f4544', '#6a6c63', '#958f7c', '#bdb196', '#ddd0b0'],
  paper: ['#5d5440', '#8c7b5a', '#b39f77', '#d2c19a', '#ece0bf'],
  brass: ['#2a2014', '#4f3a1d', '#80602c', '#bf9445', '#f2d488'],
  card: ['#0c1d1d', '#122a29', '#173634', '#1f4442', '#2c5753'],
  desk: ['#0f0c0a', '#1b130e', '#2b1d13', '#46301c', '#7a5530'],
} as const satisfies Record<string, Ramp>;

export const SERIF = 'EB Garamond';
