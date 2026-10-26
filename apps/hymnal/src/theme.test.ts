import { describe, expect, test } from 'bun:test';

import { PALETTE } from '@manna/brand';
import { Match } from 'effect';

import { onColor, type Roles, theme } from './theme';

/** A hex colour's red, green and blue, parsed here apart from the theme's own mixing. */
const rgb = (hex: string) =>
  [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((pair) => Number.parseInt(pair, 16));

/** An sRGB channel (0 to 255) as linear light, 0 to 1. */
const linear = (channel: number) =>
  Match.value(channel / 255).pipe(
    Match.when(
      (c) => c <= 0.04045,
      (c) => c / 12.92,
    ),
    Match.orElse((c) => ((c + 0.055) / 1.055) ** 2.4),
  );

/** WCAG 2's relative luminance of an sRGB hex colour. */
const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = rgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/** WCAG 2's contrast ratio between two colours, 1 to 21. */
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Every text role on every role it is drawn on, with WCAG AA's least ratio
 * for its smallest size there: all are body sizes (13 to 17 points), so 4.5.
 * The player draws on the ground: its title in ink, its caption and times
 * in muted, the hymn number and iOS's play button in accent; the web's and
 * Android's play button is an accent fill under onAccent, and while pressed
 * a pressed fill under onPressed. The chords stand on the page, and the
 * search field's placeholder on soft.
 */
const pairs: ReadonlyArray<readonly [text: keyof Roles, on: keyof Roles]> = [
  ['ink', 'ground'],
  ['muted', 'ground'],
  ['accent', 'ground'],
  ['chord', 'ground'],
  ['ink', 'soft'],
  ['accent', 'soft'],
  ['muted', 'soft'],
  ['onAccent', 'accent'],
  ['onPressed', 'pressed'],
  // The open dials' panel: its labels and keys in muted, its current stop in chord, the Reset pill's ink on the pill.
  ['ink', 'panel'],
  ['muted', 'panel'],
  ['accent', 'panel'],
  ['chord', 'panel'],
  ['onPill', 'pill'],
  // The docked bar: its title in ink, its marks in muted and accent.
  ['ink', 'bar'],
  ['muted', 'bar'],
  ['accent', 'bar'],
];

describe('the palette meets WCAG AA', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const [text, on] of pairs) {
      test(`${scheme}: ${text} on ${on} is at least 4.5:1`, () => {
        const roles = theme[scheme];
        expect(contrast(roles[text], roles[on])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/**
 * The panel the open dials stand on reads against the page under it: its
 * edge is a control's boundary, at 3.5:1 on the ground (WCAG 1.4.11's 3:1,
 * with the margin the panel's shadow takes from the ground beside it: barfix
 * measured 2.88:1 there for an edge at 3.13:1 on the plain ground). Its fill
 * is a tone of its own: by day the sky a step deeper than the page, by
 * night the night raised, each at least 1.05:1 off the ground.
 */
describe('the dials’ panel stands off the page', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: the edge is at least 3.5:1 on the ground`, () => {
      const roles = theme[scheme];
      expect(contrast(roles.edge, roles.ground)).toBeGreaterThanOrEqual(3.5);
    });
    test(`${scheme}: the fill is at least 1.05:1 off the ground`, () => {
      const roles = theme[scheme];
      expect(contrast(roles.panel, roles.ground)).toBeGreaterThanOrEqual(1.05);
    });
  }
  test('light: the fill is deeper than the page, and dark: lighter', () => {
    expect(luminance(theme.light.panel)).toBeLessThan(luminance(theme.light.ground));
    expect(luminance(theme.dark.panel)).toBeGreaterThan(luminance(theme.dark.ground));
  });
});

/**
 * Every fill whose channels step by 17 (`#000` to `#fff`, 4096 of them), and
 * the brand's own colours, among them its accent and the wheat, which the
 * theme fills with.
 */
const fills = [
  ...Array.from({ length: 4096 }, (_, index) =>
    [index >> 8, (index >> 4) & 15, index & 15]
      .map((digit) => digit.toString(16).repeat(2))
      .reduce((hex, pair) => `${hex}${pair}`, '#'),
  ),
  ...Object.values(PALETTE),
];

test('text on any fill, as onColor picks it, meets WCAG AA', () => {
  const under = fills.filter((fill) => contrast(onColor(fill), fill) < 4.5);
  expect(under).toEqual([]);
  // The night where it reaches AA (on the wheat), else white (on the deepened
  // wheat), else black (on a mid teal, where neither does).
  expect([onColor(PALETTE.wheat), onColor(PALETTE.accent), onColor('#099197')]).toEqual([
    PALETTE.night,
    '#ffffff',
    '#000000',
  ]);
});

test('the contrast ratio is WCAG 2’s', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  // A colour whose channels differ: the night on the paper.
  expect(contrast('#12354e', '#fff9e0')).toBeCloseTo(12.08, 2);
});

/**
 * The roles as the owner's pick, "sky" (2026-10-25), draws them: each role
 * the prototype named is its value there, or within 2 of it per channel
 * where a mix of the brand's colours draws it (light muted, panel and soft,
 * dark line), but the edges, moved until they read at 3.5:1 (the prototype's were
 * 1.6:1 by day and 2.3:1 by night). A change to the brand, the mixing or a
 * channel's order shows here.
 */
test('the roles are the sky', () => {
  expect(theme).toEqual({
    light: {
      ground: '#f7f9fb',
      ink: PALETTE.night,
      muted: '#526b7d',
      line: '#dfe6ee',
      accent: PALETTE.night,
      chord: PALETTE.duskDeep,
      soft: '#e1e8f0',
      onAccent: '#ffffff',
      pressed: '#405c71',
      onPressed: '#ffffff',
      panel: '#ebeff5',
      edge: '#6e869c',
      bar: '#f7f9fb',
      pill: PALETTE.sky,
      onPill: PALETTE.night,
    },
    dark: {
      ground: PALETTE.night,
      ink: '#eef2f6',
      muted: PALETTE.sky,
      line: '#2c4c64',
      accent: PALETTE.duskGold,
      chord: PALETTE.duskGold,
      soft: PALETTE.nightPanel,
      onAccent: PALETTE.night,
      pressed: '#c8ab7e',
      onPressed: PALETTE.night,
      panel: PALETTE.nightPanel,
      edge: '#778ea3',
      bar: '#0f2d43',
      pill: PALETTE.sky,
      onPill: PALETTE.night,
    },
  });
});
