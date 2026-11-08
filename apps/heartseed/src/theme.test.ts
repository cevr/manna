import { describe, expect, test } from 'bun:test';

import { face, icon, type Roles, type Scheme, theme } from './theme';

/** A hex colour's red, green and blue, parsed here apart from the theme. */
const rgb = (hex: string) =>
  [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((pair) => Number.parseInt(pair, 16));

/** An sRGB channel (0 to 255) as linear light, 0 to 1, by WCAG 2's formula. */
const linear = (channel: number) => {
  const c = channel / 255;
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2's relative luminance of an sRGB hex colour. */
const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = rgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/** WCAG 2's contrast ratio between two colours, 1 to 21, unrounded. */
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** `from` moved `share` of the way toward `to`, each channel rounded, as hex. */
const mix = (from: string, to: string, share: number) => {
  const [a, b] = [rgb(from), rgb(to)];
  return a.reduce(
    (hex, channel, index) =>
      `${hex}${Math.round(channel + share * ((b[index] ?? 0) - channel))
        .toString(16)
        .padStart(2, '0')}`,
    '#',
  );
};

const AA = 4.5;
const schemes: ReadonlyArray<Scheme> = ['light', 'dark'];

/** Every text role on every ground it is drawn on: the inks on the page, a card and the heard word, and text on an ink fill. */
const pairs: ReadonlyArray<readonly [text: keyof Roles, on: keyof Roles]> = [
  ...(['ink', 'quiet', 'miss'] as const).flatMap((text) =>
    (['ground', 'card', 'hearing'] as const).map((on) => [text, on] as const),
  ),
  ['onInk', 'ink'],
];

describe('every text reads at WCAG AA', () => {
  for (const scheme of schemes)
    for (const [text, on] of pairs)
      test(`${scheme}: ${text} on ${on} is at least 4.5:1`, () => {
        expect(contrast(theme[scheme][text], theme[scheme][on])).toBeGreaterThanOrEqual(AA);
      });

  for (const scheme of schemes) {
    test(`${scheme}: the icon's mark on its ground is at least 4.5:1`, () => {
      expect(contrast(icon[scheme].mark, icon[scheme].ground)).toBeGreaterThanOrEqual(AA);
    });
    test(`${scheme}: the launch screen's mark (ink) on its ground is at least 4.5:1`, () => {
      expect(contrast(theme[scheme].ink, theme[scheme].ground)).toBeGreaterThanOrEqual(AA);
    });
  }
});

test('the heard word is the ground moved toward the glow, 22 % by day and 25 % by night', () => {
  expect(theme.light.hearing).toBe(mix(theme.light.ground, theme.light.glow, 0.22));
  expect(theme.dark.hearing).toBe(mix(theme.dark.ground, theme.dark.glow, 0.25));
});

test('the contrast ratio is WCAG 2’s', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  expect(contrast('#2c4542', '#f1f0e6')).toBeCloseTo(9.01, 2);
});

/**
 * The roles, the icon's colours and the face as brand C draws them (the
 * owner's pick, 2026-11-08), after `quiet` and `miss` were raised to AA on
 * `hearing`. A change to any of them shows here.
 */
test('the roles are brand C, Two leaves', () => {
  expect(theme).toEqual({
    light: {
      ground: '#f1f0e6',
      card: '#f9f8f1',
      ink: '#2c4542',
      quiet: '#5a6761',
      soft: '#b9cfae',
      miss: '#a04a34',
      hearing: '#ebe0c1',
      glow: '#d4a640',
      pulse: 'rgba(212, 166, 64, 0.45)',
      onInk: '#f1f0e6',
      shadow: '#2c4542',
      gold: '#d4a640',
      leaf: '#6f9a4a',
      greenEar: '#9cbf6a',
      soil: '#8a6e4b',
    },
    dark: {
      ground: '#142420',
      card: '#1d322c',
      ink: '#e6eedb',
      quiet: '#a0b4a7',
      soft: '#3d5c4f',
      miss: '#f09982',
      hearing: '#444528',
      glow: '#d4a640',
      pulse: 'rgba(212, 166, 64, 0.45)',
      onInk: '#142420',
      shadow: '#000000',
      gold: '#d4a640',
      leaf: '#86b862',
      greenEar: '#a9cd78',
      soil: '#a88a62',
    },
  });
  expect(icon).toEqual({
    light: { ground: '#dfe8cf', mark: '#2c4542' },
    dark: { ground: '#142420', mark: '#dfe8cf' },
  });
  expect(face).toBe('ui-rounded');
});
