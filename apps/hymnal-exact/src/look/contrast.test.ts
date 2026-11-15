/* oxlint-disable effect/noNullish, effect/noTernary -- a Bun test over the app's own Contract files and brand. */

/**
 * Every text the port's Contract files draw keeps the current hymnal's
 * contrast bar on the ground it is drawn on, light and dark (A3): WCAG AA,
 * 4.5:1, the bar `apps/hymnal/src/theme.test.ts` holds each text role to.
 * Each colour a file names is resolved through the brand (a role it sets,
 * or a brand role by name); a colour the brand does not set fails here,
 * since its shade would be the platform's, not the hymnal's. The tint is
 * the brand's too (`AccentColor` the accent, the label on a filled button
 * `AccentColorText` the label on it), as in the current app.
 */

import { describe, expect, it } from 'bun:test';

import { appFile, brandOf, contractFiles, drawnIn } from './design.testing.ts';

const AA = 4.5;

const brand = brandOf(appFile('app.forma'));

/** A name a file writes, as the brand role it is drawn in, or "" if the brand does not set it. */
const roleOf = (name: string): string => {
  if (brand.colours.has(name)) return name;
  const role = brand.names.get(name);
  return role !== undefined && brand.colours.has(role) ? role : '';
};

/** A `#rrggbb` colour's relative luminance (WCAG 2), 0 to 1. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const share = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};

const ratio = (one: string, other: string) => {
  const [high, low] = [luminance(one), luminance(other)].toSorted((a, b) => b - a);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

const drawn = contractFiles().flatMap((file) => drawnIn(file, appFile(file)));

describe('every text keeps the current hymnal’s contrast on its ground', () => {
  it('reads the Contract files’ texts, the tinted ones among them', () => {
    expect(drawn.length).toBeGreaterThan(15);
    expect(drawn.some((text) => text.ink === 'AccentColor')).toBe(true);
  });

  it('tints with the accent, its label the label on the accent', () => {
    expect([brand.names.get('AccentColor'), brand.names.get('AccentColorText')]).toEqual([
      'accent',
      'onAccent',
    ]);
  });

  for (const scheme of ['light', 'dark'] as const)
    it(`holds ${AA}:1 in ${scheme}`, () => {
      for (const text of drawn) {
        const [ink, ground] = [roleOf(text.ink), roleOf(text.ground)];
        const [inkColour, groundColour] = [brand.colours.get(ink), brand.colours.get(ground)];
        const got =
          inkColour && groundColour
            ? Math.round(ratio(inkColour[scheme], groundColour[scheme]) * 100) / 100
            : 0;
        expect({ ...text, ink, ground, holds: got >= AA }).toEqual({
          ...text,
          ink: ink || `${text.ink}, which the brand does not set`,
          ground: ground || `${text.ground}, which the brand does not set`,
          holds: true,
        });
      }
    });
});
