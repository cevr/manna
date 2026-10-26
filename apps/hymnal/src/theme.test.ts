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
 * a pressed fill under onPressed.
 */
const pairs: ReadonlyArray<readonly [text: keyof Roles, on: keyof Roles]> = [
  ['ink', 'ground'],
  ['muted', 'ground'],
  ['accent', 'ground'],
  ['ink', 'soft'],
  ['accent', 'soft'],
  ['onAccent', 'accent'],
  ['onPressed', 'pressed'],
  // The open dials' panel: its labels and keys in muted, its current key and notch in accent, the reset chip's ink on soft.
  ['ink', 'panel'],
  ['muted', 'panel'],
  ['accent', 'panel'],
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
 * is lighter than the ground: by day white, as far as any fill lifts off the
 * brand's paper (1.06:1), and by night at least 1.08:1.
 */
describe('the dials’ panel stands off the page', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: the edge is at least 3.5:1 on the ground`, () => {
      const roles = theme[scheme];
      expect(contrast(roles.edge, roles.ground)).toBeGreaterThanOrEqual(3.5);
    });
    test(`${scheme}: the fill is lighter than the ground`, () => {
      const roles = theme[scheme];
      expect(luminance(roles.panel)).toBeGreaterThan(luminance(roles.ground));
    });
  }
  test('light: the fill is white, the most lift the paper allows', () => {
    expect(theme.light.panel).toBe('#ffffff');
    expect(contrast(theme.light.panel, theme.light.ground)).toBeGreaterThanOrEqual(1.05);
  });
  test('dark: the fill lifts at least 1.08:1 off the ground', () => {
    expect(contrast(theme.dark.panel, theme.dark.ground)).toBeGreaterThanOrEqual(1.08);
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
 * The roles as Moonlit wheat draws them. A change to the brand, the mixing or
 * a channel's order shows here.
 */
test('the roles are Moonlit wheat', () => {
  expect(theme).toEqual({
    light: {
      ground: PALETTE.paper,
      ink: PALETTE.ink,
      muted: PALETTE.soft,
      line: '#b8beb4',
      accent: PALETTE.accent,
      soft: PALETTE.wheat,
      onAccent: '#ffffff',
      pressed: '#655e1f',
      onPressed: '#ffffff',
      panel: '#ffffff',
      edge: '#718388',
    },
    dark: {
      ground: PALETTE.night,
      ink: PALETTE.nightInk,
      muted: PALETTE.nightSoft,
      line: PALETTE.nightRule,
      accent: PALETTE.nightAccent,
      soft: '#596d6b',
      onAccent: PALETTE.night,
      pressed: '#d0ca9b',
      onPressed: PALETTE.night,
      panel: '#1b3c52',
      edge: '#89927e',
    },
  });
});
