import { type Hex, mix } from '@manna/film/canvas';
import type { Looks } from '@manna/film/core';
import { parchment, peoplePaper } from '@manna/film/style';

export const looks = {
  ground: { options: { now: 0, light: 0.5, lighter: 0.75 }, play: 'now' },
} as const satisfies Looks;
export type Ground = keyof typeof looks.ground.options;

export const GROUND: Ground = looks.ground.play;

export const LIFT: number = looks.ground.options[GROUND];

const LIGHT_PAPER: Hex = '#f3ebdd';

const ground = (base: Hex, share = 1): Hex => mix(base, LIGHT_PAPER, LIFT * share);

const SKY = 0.4;

export const palette = {
  paper: parchment,
  paperTone: '#8c7f71',
  ink: '#332b23',
  inkSoft: '#665d52',
  board: ground('#ab8163'),
  boardLight: ground('#c49a78'),
  boardShade: ground('#83644b', 0.55),
  boardDeep: ground('#423123', 0.4),
  figure: peoplePaper,
  figureShade: '#8f8a80',
  outline: '#2b2622',
  cut: '#ab8163',
  cutLight: '#c49a78',
  cutShade: '#83644b',
  cutDeep: '#423123',
  cutRust: '#8a4736',
  scarlet: '#ce0914',
  scarletShade: '#a4070e',
  robe: '#fcfefc',
  cream: '#fdf3dc',
  gold: '#e6b347',
  glow: '#fbefc8',
  leaf: '#86b86a',
  leafPale: '#8fb06a',
  leafShade: '#5f9451',
  leafDry: '#9a7b52',
  stone: '#c9c1b2',
  water: '#48b39d',
  tealTop: ground('#5dccb5', SKY),
  tealMid: ground('#a4f0b7', SKY),
  tealLow: ground('#e7fab0', SKY),
  peachTop: ground('#f4b18b', SKY),
  peachLow: ground('#f9d08e', SKY),
  sunsetTop: ground('#d3a27f', SKY),
  sunsetLow: ground('#8a4736', 0.4),
  dawnTop: ground('#cfddcf', SKY),
  dawnLow: ground('#ded7b1', SKY),
  night: '#1b150d',
} satisfies Record<string, Hex>;

export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
  hand: 'Gaegu',
  greek: 'EB Garamond',
  hebrew: 'Frank Ruhl Libre',
} satisfies Record<string, string>;
