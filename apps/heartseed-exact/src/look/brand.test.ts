/* oxlint-disable effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a regex group that did not match is undefined. */

/**
 * The brand is the current Heartseed's palette (spec A2-A4): every role of
 * `theme` (`@manna/heartseed/theme`), light and dark, is a token of
 * `app.tamber` as `hs.<role>` with the same colour, and the file names no
 * colour the palette lacks; every text the port's Contract files draw reads
 * on every ground they draw at WCAG AA, the current app's own bar, in both
 * schemes; and no Contract file names a colour of its own.
 */

import { describe, expect, it } from 'bun:test';
import { theme, type Roles, type Scheme } from '@manna/heartseed/theme';

import { readBrand, readContracts } from '../../tools/look';
import { colourKey, colourLiterals, contrast, paintsOf } from './brand';

/** WCAG 2's AA bar for normal text, which the current app's `theme.test.ts` holds every text role on its grounds to. */
const AA = 4.5;
const SCHEMES: readonly Scheme[] = ['light', 'dark'];

const brand = readBrand();
const paints = paintsOf(brand);
const contracts = readContracts();

/** The brand's token for a palette role: `hs.` and the role's name in kebab case (`onInk` is `hs.on-ink`). */
const tokenOf = (role: string) =>
  `hs.${role.replace(/[A-Z]/gu, (upper) => `-${upper.toLowerCase()}`)}`;

const roles = Object.keys(theme.light) as (keyof Roles)[];

describe('the brand is the palette', () => {
  for (const role of roles)
    for (const scheme of SCHEMES)
      it(`${scheme}: ${role} is ${tokenOf(role)}`, () => {
        expect(colourKey(paints.get(tokenOf(role))?.[scheme] ?? 'none')).toBe(
          colourKey(theme[scheme][role]),
        );
      });

  it('names no colour the palette lacks', () => {
    const palette = new Set(
      SCHEMES.flatMap((scheme) => Object.values(theme[scheme])).map(colourKey),
    );
    const strays = colourLiterals(brand)
      .map(colourKey)
      .filter((colour) => !palette.has(colour));
    expect(strays).toEqual([]);
  });

  it('a role the palette adds fails until the brand carries it', () => {
    const grown = paintsOf(brand.replace(/^ {2}hs\.sun = .*$/mu, ''));
    expect(grown.has(tokenOf('sun'))).toBe(false);
  });
});

/** Every quoted name in `text` that `paints` holds, or that names a platform text role. */
const TEXT_ROLE = /^-exact-(?:(?:[a-z]+-)?label|link|placeholder|system-[a-z]+)$/u;

/** The names the Contract files draw text in, and the grounds they draw it on (the page's own ground among them). */
const drawn = () => {
  const texts = new Set<string>(['AccentColor', 'CanvasText']);
  const grounds = new Set<string>(['Canvas', '-exact-background']);
  for (const text of contracts.values())
    for (const [, before, name = ''] of text.matchAll(/(background-color=)?"([^"]+)"/gu)) {
      if (before !== undefined) grounds.add(name);
      else if (paints.has(name) || TEXT_ROLE.test(name)) texts.add(name);
    }
  return { texts: [...texts], grounds: [...grounds] };
};

describe('every text reads at AA on every ground it is drawn on', () => {
  const { texts, grounds } = drawn();
  it('the brand paints every text and ground the screens name', () => {
    expect([...texts, ...grounds].filter((name) => !paints.has(name))).toEqual([]);
  });
  for (const scheme of SCHEMES)
    for (const text of texts)
      for (const ground of grounds)
        it(`${scheme}: ${text} on ${ground}`, () => {
          const paint = (name: string) => paints.get(name)?.[scheme] ?? '#000000';
          expect(contrast(paint(text), paint(ground))).toBeGreaterThanOrEqual(AA);
        });
});

describe('no screen names a colour', () => {
  for (const [path, text] of contracts)
    it(`${path} holds no colour literal`, () => {
      expect(colourLiterals(text)).toEqual([]);
    });

  it('finds a colour planted in a screen', () => {
    expect([
      colourLiterals('column background-color="#f1f0e6"'),
      colourLiterals('text "x" color="rgb(44, 69, 66)"'),
      colourLiterals('row color="light-dark(#fff, #000)"'),
    ]).toEqual([['#f1f0e6'], ['rgb(44, 69, 66)'], ['#fff', '#000']]);
  });
});

it('the contrast is WCAG 2’s', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrast('#2c4542', '#f1f0e6')).toBeCloseTo(9.01, 2);
});
