import { describe, expect, test } from 'bun:test';

import { TEXT_ROLES } from './test/look';
import { face, icon, kept, masters, type Roles, type Scheme, theme } from './theme';

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

/** What a role is drawn as: text on the listed roles, a ground text lies on, or a decoration no text lies on, with why. */
type Use =
  | { readonly text: ReadonlyArray<keyof Roles> }
  | { readonly ground: true }
  | { readonly decor: string };

const plant = 'the plant drawings and icons, whose meaning is also in words';

/**
 * Every role's use, so a role added to the theme must say how it is drawn.
 * `sun` is text on the page and a card, and the ready dot is drawn in it,
 * so its 4.5:1 covers the 3:1 a meaningful mark needs (WCAG 1.4.11).
 */
const uses: Record<keyof Roles, Use> = {
  ink: { text: ['ground', 'card', 'hearing'] },
  quiet: { text: ['ground', 'card', 'hearing'] },
  miss: { text: ['ground', 'card', 'hearing'] },
  onInk: { text: ['ink'] },
  sun: { text: ['ground', 'card'] },
  ground: { ground: true },
  card: { ground: true },
  hearing: { ground: true },
  soft: { decor: 'lines, the unsaid slot and progress segments; never under text' },
  glow: { decor: 'the listening glow' },
  pulse: { decor: 'the listening glow’s ring' },
  shadow: { decor: 'the big button’s shadow' },
  gold: { decor: plant },
  leaf: { decor: plant },
  greenEar: { decor: plant },
  soil: { decor: plant },
  furrow: { decor: plant },
};

/** Every text role on every ground it is drawn on, read from `uses`. */
const pairs: ReadonlyArray<readonly [text: keyof Roles, on: keyof Roles]> = Object.entries(
  uses,
).flatMap(([role, use]) => {
  if (!('text' in use)) return [];
  return use.text.map((on) => [role as keyof Roles, on] as const);
});

describe('every role has a use', () => {
  for (const scheme of schemes)
    test(`${scheme}: the uses name exactly the theme's roles`, () => {
      expect(Object.keys(uses).toSorted()).toEqual(Object.keys(theme[scheme]).toSorted());
    });

  test('the text roles are exactly the frame oracle’s', () => {
    const texts = new Set(pairs.map(([text]) => text));
    expect([...texts].toSorted()).toEqual([...TEXT_ROLES].toSorted());
  });
});

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

  test("tinted: the icon's mark on its ground is at least 4.5:1", () => {
    expect(contrast(icon.tinted.mark, icon.tinted.ground)).toBeGreaterThanOrEqual(AA);
  });
});

test('the heard word is the ground moved toward the glow, 22 % by day and 25 % by night', () => {
  expect(theme.light.hearing).toBe(mix(theme.light.ground, theme.light.glow, 0.22));
  expect(theme.dark.hearing).toBe(mix(theme.dark.ground, theme.dark.glow, 0.25));
});

test('the furrow is the ground moved 45 % toward the soil, in both schemes', () => {
  for (const scheme of schemes)
    expect(theme[scheme].furrow).toBe(mix(theme[scheme].ground, theme[scheme].soil, 0.45));
});

test('the masters’ hexes are lower-case, none is kept, and each maps to a role', () => {
  const roles = Object.keys(theme.light);
  for (const [hex, role] of Object.entries(masters)) {
    expect(hex).toMatch(/^#[0-9a-f]{6}$/u);
    expect(kept).not.toContain(hex);
    expect(roles).toContain(role);
  }
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
      furrow: '#c3b6a0',
      sun: '#80641f',
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
      furrow: '#57523e',
      sun: '#d4a640',
    },
  });
  expect(masters).toEqual({
    '#064f6e': 'ink',
    '#a7d4e4': 'soft',
    '#c2ae93': 'furrow',
    '#f7f3ee': 'card',
    '#8a6e4b': 'soil',
    '#6f9a4a': 'leaf',
    '#9cbf6a': 'greenEar',
    '#d4a640': 'gold',
  });
  expect(kept).toEqual(['#b8892f', '#c9a24a']);
  expect(icon).toEqual({
    light: { ground: '#dfe8cf', mark: '#2c4542' },
    dark: { ground: '#142420', mark: '#dfe8cf' },
    tinted: { ground: '#000000', mark: '#ffffff' },
  });
  expect(face).toBe('ui-rounded');
});
