import { describe, expect, test } from 'bun:test';

import { Match } from 'effect';

import { theme as heartseed } from '../../heartseed/src/theme';
import { launch } from './icon-colours';
import { garden, onColor, type Roles, theme } from './theme';

const schemes = ['light', 'dark'] as const;

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
 * The palette is Heartseed's: each hex `garden` copies is the Heartseed
 * role of its name (`apps/heartseed/src/theme.ts`), so a change there shows
 * here (`turbo.json` hashes that file for this part).
 */
describe('the garden is Heartseed’s palette', () => {
  for (const scheme of schemes)
    test(`${scheme}: every role garden copies equals Heartseed’s`, () => {
      const { ground, card, ink, quiet, soft, sun, miss, shadow } = heartseed[scheme];
      const copied: Readonly<Record<string, string>> = garden[scheme];
      expect(copied).toEqual({ ground, card, ink, quiet, soft, sun, miss, shadow });
    });
});

/** The launch screen hands off to the hymn list with no step: one ground. */
test('the launch grounds are the theme’s grounds', () => {
  expect([launch.light.ground, launch.dark.ground]).toEqual([
    theme.light.ground,
    theme.dark.ground,
  ]);
});

/**
 * Every text role on every role it is drawn on, with WCAG AA's least ratio
 * for its smallest size there: all are body sizes (13 to 17 points), so 4.5.
 * The player draws on the ground: its title in ink, its caption and times
 * in muted, the hymn number in accent; the web's and Android's play button
 * is an accent fill under onAccent, and while pressed a pressed fill under
 * onPressed. A button's fill carries onButton, a chosen tab's fill the ink.
 * The chords stand on the page, the panel and the bar, the search field's
 * placeholder on soft, and Delete downloads (alert) on the page, a pressed
 * row and a panel.
 */
const pairs: ReadonlyArray<readonly [text: keyof Roles, on: keyof Roles]> = [
  ['ink', 'ground'],
  ['muted', 'ground'],
  ['accent', 'ground'],
  ['chord', 'ground'],
  ['alert', 'ground'],
  ['ink', 'soft'],
  ['accent', 'soft'],
  ['muted', 'soft'],
  ['alert', 'soft'],
  ['onAccent', 'accent'],
  ['onPressed', 'pressed'],
  ['onButton', 'button'],
  ['ink', 'selected'],
  ['chord', 'bar'],
  ['ink', 'panel'],
  ['muted', 'panel'],
  ['accent', 'panel'],
  ['chord', 'panel'],
  ['alert', 'panel'],
  ['onPill', 'pill'],
  ['onChosen', 'chosen'],
  ['onGlassChosen', 'glassChosen'],
  ['ink', 'bar'],
  ['muted', 'bar'],
  ['accent', 'bar'],
];

describe('the palette meets WCAG AA', () => {
  for (const scheme of schemes) {
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
 * with the margin the panel's shadow takes from the ground beside it). Its
 * fill is Heartseed's card, lighter than the page in both schemes and at
 * least 1.05:1 off it.
 */
describe('the dials’ panel stands off the page', () => {
  for (const scheme of schemes) {
    test(`${scheme}: the edge is at least 3.5:1 on the ground`, () => {
      const roles = theme[scheme];
      expect(contrast(roles.edge, roles.ground)).toBeGreaterThanOrEqual(3.5);
    });
    test(`${scheme}: the fill is lighter than the page and at least 1.05:1 off it`, () => {
      const roles = theme[scheme];
      expect(luminance(roles.panel)).toBeGreaterThan(luminance(roles.ground));
      expect(contrast(roles.panel, roles.ground)).toBeGreaterThanOrEqual(1.05);
    });
  }
});

/**
 * A checked chip's chosen mark is a state, not text: a fill that must read on
 * the pill at WCAG 1.4.11's 3:1. The accent where it does (by day, the
 * ink on Heartseed's soft), else the pill's ink (by night the pill is the
 * accent itself, so the ground). The find bar's glass is held in
 * `home/findglass.test.tsx`.
 */
describe('the chosen mark reads on the pill', () => {
  for (const scheme of schemes) {
    test(`${scheme}: chosen is at least 3:1 on the pill`, () => {
      const roles = theme[scheme];
      expect(contrast(roles.chosen, roles.pill)).toBeGreaterThanOrEqual(3);
    });
  }
  test('dark: the accent is the pill, so the chosen mark is the pill’s ink', () => {
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

/** Two colours' distance in OKLab. */
const apart = (a: string, b: string) => {
  const [one, other] = [oklab(a), oklab(b)];
  return Math.hypot(...one.map((value, k) => value - (other[k] ?? 0)));
};

/** Buttons are told from what they stand on: the play and Sound marks on the bar at WCAG 1.4.11's 3:1. */
describe('the button stands on the bar', () => {
  for (const scheme of schemes)
    test(`${scheme}: the button is at least 3:1 on the bar`, () => {
      const roles = theme[scheme];
      expect(contrast(roles.button, roles.bar)).toBeGreaterThanOrEqual(3);
    });
});

/**
 * By day and by night the chords part from the words they stand over
 * (owner, 2026-11-12: "no differentiation between chords and text"): at
 * least 0.17 from the ink in OKLab, at the same weight, and apart from the
 * sung syllable (`accent`, 0.12), the sung line (`muted`, 0.08) and a button
 * (0.06), so a sung word never reads as a chord, nor a chord as a button.
 */
describe('the chords stand apart from the words', () => {
  const least = [
    ['ink', 0.17],
    ['accent', 0.12],
    ['muted', 0.08],
    ['button', 0.06],
  ] as const;
  for (const scheme of schemes)
    for (const [role, distance] of least)
      test(`${scheme}: the chord is at least ${distance} from ${role} in OKLab`, () => {
        expect(apart(theme[scheme].chord, theme[scheme][role])).toBeGreaterThanOrEqual(distance);
      });
});

/** Every fill whose channels step by 17 (`#000` to `#fff`, 4096 of them), and the garden's own colours. */
const fills = (scheme: (typeof schemes)[number]) => [
  ...Array.from({ length: 4096 }, (_, index) =>
    [index >> 8, (index >> 4) & 15, index & 15]
      .map((digit) => digit.toString(16).repeat(2))
      .reduce((hex, pair) => `${hex}${pair}`, '#'),
  ),
  ...Object.values(garden[scheme]),
];

describe('text on any fill, as onColor picks it, meets WCAG AA', () => {
  for (const scheme of schemes)
    test(`${scheme}: every fill`, () => {
      const under = fills(scheme).filter(
        (fill) => contrast(onColor(fill, garden[scheme]), fill) < 4.5,
      );
      expect(under).toEqual([]);
    });
  test('the ground first, then the ink, then white, then black', () => {
    expect([
      onColor(garden.light.ink, garden.light),
      onColor(garden.dark.ink, garden.dark),
      onColor(garden.light.ground, garden.light),
      onColor('#707070', garden.light),
      onColor('#099197', garden.light),
    ]).toEqual([garden.light.ground, garden.dark.ground, garden.light.ink, '#ffffff', '#000000']);
  });
});

test('the contrast ratio is WCAG 2’s', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  expect(contrast('#2c4542', '#f1f0e6')).toBeCloseTo(9.01, 2);
});

/**
 * The roles as Heartseed's palette maps them (the owner, 2026-11-12, variant
 * A: gold chords, ink numbers): each is a garden role, or the stated rule
 * over garden roles drawn to its hex. A change to the garden, the mixing or
 * a channel's order shows here.
 */
test('the roles are Heartseed’s palette, as the mapping draws it', () => {
  expect(theme).toEqual({
    light: {
      ground: garden.light.ground,
      ink: garden.light.ink,
      muted: garden.light.quiet,
      line: '#cfdcc4',
      accent: garden.light.ink,
      button: garden.light.ink,
      onButton: garden.light.ground,
      selected: '#dde4d2',
      chord: garden.light.sun,
      soft: '#dde4d2',
      onAccent: garden.light.ground,
      pressed: '#536763',
      onPressed: garden.light.ground,
      panel: garden.light.card,
      edge: '#6d8474',
      bar: garden.light.ground,
      pill: garden.light.soft,
      onPill: garden.light.ink,
      chosen: garden.light.ink,
      onChosen: garden.light.ground,
      alert: garden.light.miss,
      shadow: garden.light.shadow,
      glass: '#dde4d2d9',
      onGlass: garden.light.ink,
      onGlassMuted: '#415853',
      glassChosen: garden.light.ink,
      onGlassChosen: garden.light.ground,
    },
    dark: {
      ground: garden.dark.ground,
      ink: garden.dark.ink,
      muted: garden.dark.quiet,
      line: '#2d463c',
      accent: garden.dark.ink,
      button: garden.dark.ink,
      onButton: garden.dark.ground,
      selected: garden.dark.soft,
      chord: garden.dark.sun,
      soft: '#263d35',
      onAccent: garden.dark.ground,
      pressed: '#bcc6b6',
      onPressed: garden.dark.ground,
      panel: garden.dark.card,
      edge: '#627c6e',
      bar: garden.dark.ground,
      pill: garden.dark.ink,
      onPill: garden.dark.ground,
      chosen: garden.dark.ground,
      onChosen: garden.dark.ink,
      alert: garden.dark.miss,
      shadow: garden.dark.shadow,
      glass: '#263d35d9',
      onGlass: garden.dark.ink,
      onGlassMuted: '#bec9b8',
      glassChosen: garden.dark.ink,
      onGlassChosen: garden.dark.ground,
    },
  });
});
