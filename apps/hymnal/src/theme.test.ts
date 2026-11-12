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
 * in muted, the hymn number in accent; the web's and Android's play button
 * is an accent fill under onAccent, and while pressed a pressed fill under
 * onPressed. A button's fill carries onButton, a chosen tab's fill the ink.
 * The chords stand on the page, and the search field's placeholder on soft.
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
  ['onButton', 'button'],
  ['ink', 'selected'],
  ['chord', 'bar'],
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
 * A checked chip's chosen mark is a state, not text: a fill that must read on
 * the pill at WCAG 1.4.11's 3:1. The accent where it does (by day, the
 * night), else the pill's ink (by night, where the number reads 1.13:1 on
 * the button's pill). The find bar's glass is held in
 * `home/findglass.test.tsx`.
 */
describe('the chosen mark reads on the pill', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: chosen is at least 3:1 on the pill`, () => {
      const roles = theme[scheme];
      expect(contrast(roles.chosen, roles.pill)).toBeGreaterThanOrEqual(3);
    });
  }
  test('dark: the number fails on the pill, so the chosen mark is the night', () => {
    expect(contrast(theme.dark.accent, theme.dark.pill)).toBeLessThan(3);
    expect(theme.dark.chosen).toBe(theme.dark.onPill);
  });
});

/** A colour in OKLab (Ottosson's matrices), from its sRGB hex. */
const oklab = (hex: string) => {
  const [r = 0, g = 0, b = 0] = rgb(hex).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

/**
 * Buttons are told from what they stand on and from the chords: the play
 * and Sound marks on the bar at WCAG 1.4.11's 3:1, and the chords at least
 * 0.06 from the button in OKLab, so a chord never reads as a button.
 */
describe('the button stands apart', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: the button is at least 3:1 on the bar`, () => {
      const roles = theme[scheme];
      expect(contrast(roles.button, roles.bar)).toBeGreaterThanOrEqual(3);
    });
    test(`${scheme}: the chord is at least 0.06 from the button in OKLab`, () => {
      expect(apart(theme[scheme].chord, theme[scheme].button)).toBeGreaterThanOrEqual(0.06);
    });
  }
});

/** Two colours' distance in OKLab. */
const apart = (a: string, b: string) => {
  const [one, other] = [oklab(a), oklab(b)];
  return Math.hypot(...one.map((value, k) => value - (other[k] ?? 0)));
};

/**
 * By night the chords part from the words they stand over (owner,
 * 2026-11-12: "no differentiation between chords and text"): at least 0.20
 * from the ink in OKLab, at the same weight, and apart from the sung
 * syllable (`accent`, 0.12) and the sung line (`muted`, 0.08), so a sung
 * word never reads as a chord.
 */
describe('dark: the chords stand apart from the words', () => {
  const night = theme.dark;
  const least = [
    ['ink', 0.2],
    ['accent', 0.12],
    ['muted', 0.08],
  ] as const;
  for (const [role, distance] of least)
    test(`the chord is at least ${distance} from ${role} in OKLab`, () => {
      expect(apart(night.chord, night[role])).toBeGreaterThanOrEqual(distance);
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

/**
 * The roles as the owner's picks draw them. Light is "sky" (2026-10-25):
 * each role the prototype named is its value there, or within 2 of it per
 * channel where a mix of the brand's colours draws it (muted, panel and
 * soft), but the edge, moved until it reads at 3.5:1 (the prototype's was
 * 1.6:1); the button is the accent and a chosen tab's fill is soft, so
 * light draws as before. Dark is the Night field with lifted panels (C2)
 * under the analogous accents (system 1), each role the value the pick's
 * pages show. A change to the brand, the mixing or a channel's order shows
 * here.
 */
test('the roles are the owner’s picks', () => {
  expect(theme).toEqual({
    light: {
      ground: '#f7f9fb',
      ink: PALETTE.night,
      muted: '#526b7d',
      line: '#dfe6ee',
      accent: PALETTE.night,
      button: PALETTE.night,
      onButton: '#ffffff',
      selected: '#e1e8f0',
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
      ground: '#0a1f2d',
      ink: '#f3f5f9',
      muted: '#99adc2',
      line: '#233745',
      accent: '#94d8e2',
      button: '#66d0df',
      onButton: PALETTE.night,
      selected: '#155159',
      chord: '#a3a2fd',
      soft: PALETTE.nightPanel,
      onAccent: PALETTE.night,
      pressed: '#42b0bf',
      onPressed: PALETTE.night,
      panel: PALETTE.nightPanel,
      edge: '#647686',
      bar: '#081722',
      pill: '#66d0df',
      onPill: PALETTE.night,
      chosen: PALETTE.night,
      onChosen: '#ffffff',
      glass: `${PALETTE.nightPanel}d9`,
      onGlass: '#f3f5f9',
      onGlassMuted: '#cad3dc',
      glassChosen: '#66d0df',
      onGlassChosen: PALETTE.night,
    },
  });
});
