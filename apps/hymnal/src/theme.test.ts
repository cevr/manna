import { describe, expect, test } from 'bun:test';

import { PALETTE } from '@manna/brand';
import { Match } from 'effect';

import { onColor, type Roles, theme } from './theme';

const rgb = (hex: string) =>
  [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((pair) => Number.parseInt(pair, 16));

const linear = (channel: number) =>
  Match.value(channel / 255).pipe(
    Match.when(
      (c) => c <= 0.04045,
      (c) => c / 12.92,
    ),
    Match.orElse((c) => ((c + 0.055) / 1.055) ** 2.4),
  );

const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = rgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

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
  ['ink', 'panel'],
  ['muted', 'panel'],
  ['accent', 'panel'],
  ['chord', 'panel'],
  ['onPill', 'pill'],
  ['onChosen', 'chosen'],
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

describe('the chosen mark reads on the pill', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: chosen is at least 3:1 on the pill`, () => {
      const roles = theme[scheme];
      expect(contrast(roles.chosen, roles.pill)).toBeGreaterThanOrEqual(3);
    });
  }
  test('dark: the gold fails on the pill, so the chosen mark is the night', () => {
    expect(contrast(theme.dark.accent, theme.dark.pill)).toBeLessThan(3);
    expect(theme.dark.chosen).toBe(theme.dark.onPill);
  });
});

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
  expect([onColor(PALETTE.wheat), onColor(PALETTE.accent), onColor('#099197')]).toEqual([
    PALETTE.night,
    '#ffffff',
    '#000000',
  ]);
});

test('the contrast ratio is WCAG 2’s', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  expect(contrast('#12354e', '#fff9e0')).toBeCloseTo(12.08, 2);
});

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
      chosen: PALETTE.night,
      onChosen: '#ffffff',
      glass: '#e1e8f0d9',
      onGlass: PALETTE.night,
      onGlassMuted: '#3b596e',
      glassChosen: PALETTE.night,
      onGlassChosen: '#ffffff',
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
      chosen: PALETTE.night,
      onChosen: '#ffffff',
      glass: `${PALETTE.nightPanel}d9`,
      onGlass: '#eef2f6',
      onGlassMuted: '#cad4dd',
      glassChosen: PALETTE.duskGold,
      onGlassChosen: PALETTE.night,
    },
  });
});
