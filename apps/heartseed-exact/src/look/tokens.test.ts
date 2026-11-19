/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): an absent style or property is undefined. */

/**
 * The measures of `app.forma` are the current Heartseed's: each token of
 * `TOKENS` is read from every One style it names, those agree, and the
 * brand writes the token as `formaOf` makes it from them. The brand has no
 * measure `TOKENS` does not trace to One.
 */

import { describe, expect, it } from 'bun:test';
import { styleIn } from '@manna/exact-kit/look/testing';

import { readBrand, readOne } from '../../tools/look';
import { FAMILY, SHADOW_INK, TOKENS, type Source, type Token } from './tokens';

/** The body size a `rem` is on iOS at the default text size, in points. */
const BODY = 17;

/** The device pixels a point holds on the iPhones the port is matched on. */
const DEVICE = 3;

const MEASURE = /^(?:type|space|radius|size|line|opacity|scale|shadow)\./u;

/** A number to four places, as a token writes it. */
const short = (value: number) => String(Number(value.toFixed(4)));

const unquote = (value: string | undefined) => value?.replaceAll("'", '');

/** The token's value in `app.forma`'s terms, from one source's style; undefined when the style lacks what the token reads. */
const formaOf = (token: Token, props: ReadonlyMap<string, string>, source: Source) => {
  const number = (name: string) => {
    const value = props.get(name);
    return value === undefined ? undefined : Number(value);
  };
  if (token.kind === 'type') {
    const size = number('fontSize');
    if (size === undefined) return undefined;
    const line = number('lineHeight');
    const leading = line === undefined ? 'normal' : short(line / size);
    return `${unquote(props.get('fontWeight')) ?? '400'} ${short(size / BODY)}rem/${leading} ${FAMILY}`;
  }
  if (token.kind === 'shadow') {
    const [x, y, radius, opacity] = [
      number('shadowOffset.width'),
      number('shadowOffset.height'),
      number('shadowRadius'),
      number('shadowOpacity'),
    ];
    if (x === undefined || y === undefined || radius === undefined || opacity === undefined)
      return undefined;
    return `${x}px ${y}px ${radius * 2}px color-mix(in srgb, ${SHADOW_INK} ${short(opacity * 100)}%, transparent)`;
  }
  const value = props.get(source.prop ?? '');
  if (value === undefined) return undefined;
  if (token.kind === 'hairline')
    return value === 'StyleSheet.hairlineWidth' ? '-exact-hairline' : undefined;
  if (token.kind === 'length') return `${value}px`;
  if (token.kind === 'border') return `${short(Math.round(Number(value) * DEVICE) / DEVICE)}px`;
  return value;
};

/** Each `name = value` of the brand's theme, a kind written after the name (`: length`) left off. */
const brandValues = (forma: string) =>
  new Map(
    forma
      .split('\n')
      .map((line) => /^\s+([\w.-]+)(?::\s*[\w-]+)?\s*=\s*(.+?)\s*$/u.exec(line))
      .filter((found) => found !== null)
      .map((found) => [found[1] ?? '', found[2] ?? ''] as const),
  );

/** The value each source of `token` gives, in `app.forma`'s terms. */
const valuesOf = (token: Token, read: (file: string) => string) =>
  token.from.map((source) => {
    const props = styleIn(read(source.file), source.style);
    return props === undefined ? undefined : formaOf(token, props, source);
  });

const brand = brandValues(readBrand());
const files = new Map<string, string>();
const readCached = (file: string) => {
  const known = files.get(file);
  if (known !== undefined) return known;
  const text = readOne(file);
  files.set(file, text);
  return text;
};

describe('every measure of the brand is the current Heartseed’s', () => {
  for (const token of TOKENS)
    it(`${token.name} is ${token.from.map((s) => `${s.file} ${s.style}${s.prop === undefined ? '' : `.${s.prop}`}`).join(', ')}`, () => {
      const values = valuesOf(token, readCached);
      expect(values.every((value) => value !== undefined)).toBe(true);
      expect(new Set(values).size).toBe(1);
      expect(brand.get(token.name)).toBe(values[0]);
    });

  it('the brand writes no measure the list does not trace to One', () => {
    const traced = new Set(TOKENS.map((token) => token.name));
    expect([...brand.keys()].filter((name) => MEASURE.test(name) && !traced.has(name))).toEqual([]);
  });

  it('a One style that changes fails its token', () => {
    const titles = TOKENS.filter((token) => token.name === 'type.title');
    const moved = (file: string) => readCached(file).replace('fontSize: 34,', 'fontSize: 33,');
    expect(titles.map((title) => valuesOf(title, moved)[0] === brand.get(title.name))).toEqual([
      false,
    ]);
  });
});
