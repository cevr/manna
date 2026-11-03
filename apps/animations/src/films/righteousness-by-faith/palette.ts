import { type Hex, mix } from '@manna/film/canvas';
import type { Looks } from '@manna/film/core';
import { parchment, peoplePaper } from '@manna/film/style';

/**
 * The looks the film chooses between, at named levels. `ground`: how far the
 * ground is lifted toward light paper, `now` the chipboard as first cut (the
 * owner's pick, 2026-09-30), `light` and `lighter` the two lifts they
 * compared. The review lists each level and a pick rewrites `play`; every
 * value below and in `light.ts` and `acts.ts` follows it.
 */
export const looks = {
  ground: { options: { now: 0, light: 0.5, lighter: 0.75 }, play: 'now' },
} as const satisfies Looks;
export type Ground = keyof typeof looks.ground.options;

/** The film's ground level: the level `looks.ground` plays. */
export const GROUND: Ground = looks.ground.play;

/** The lift, 0..1: the share of the way each ground colour rises toward `LIGHT_PAPER`. */
export const LIFT: number = looks.ground.options[GROUND];

/** The warm light paper the ground rises toward: under the robe's white and the glow. */
const LIGHT_PAPER: Hex = '#f3ebdd';

/**
 * A ground colour lifted by `share` of the film's lift. Walls take all of it;
 * skies, floors and dark props less, so skies keep their colour and floors
 * stay under the figures.
 */
const ground = (base: Hex, share = 1): Hex => mix(base, LIGHT_PAPER, LIFT * share);

/** The share of the lift a sky takes: enough to lighten it, not so much it washes out. */
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
