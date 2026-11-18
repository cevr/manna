/* oxlint-disable effect/noNullish, effect/noTernary -- an absent style, property or ramp is undefined. */

/**
 * The measures of `app.forma` are the current hymnal's: each token of
 * `TOKENS` is read from every One style it names, those agree, each of the
 * style's texts names the ramp the source says (or none), and the brand
 * writes the token as `formaOf` makes it from them. The brand has no
 * measure `TOKENS` does not trace to One.
 */

import { describe, expect, it } from 'bun:test';
import { styleIn } from '@manna/exact-kit/look/testing';

import { appFile, brandOf, oneFile } from './design.testing.ts';
import { TOKENS, type Source, type Token } from './tokens.ts';

/** The body size a `rem` is on iOS at the default text size, in points. */
const BODY = 17;

/** Each text style a ramp names, with its size at the default text size in points and its name in Exact: a text on its ramp at this size is the style. */
const STYLES = new Map([
  ['largeTitle', { size: 34, name: 'large-title' }],
  ['title1', { size: 28, name: 'title1' }],
  ['title2', { size: 22, name: 'title2' }],
  ['title3', { size: 20, name: 'title3' }],
  ['headline', { size: 17, name: 'headline' }],
  ['callout', { size: 16, name: 'callout' }],
  ['subheadline', { size: 15, name: 'subheadline' }],
  ['footnote', { size: 13, name: 'footnote' }],
  ['caption1', { size: 12, name: 'caption1' }],
  ['caption2', { size: 11, name: 'caption2' }],
]);

/** A number to four places, as a token writes it. */
const short = (value: number) => String(Number(value.toFixed(4)));

/** A size on `ramp` (`none` for none) as `app.forma` writes it; undefined for one this rule cannot say. */
const sizeOf = (size: number, ramp: string) => {
  if (ramp === 'none' || ramp === 'body') return `${short(size / BODY)}rem`;
  const style = STYLES.get(ramp);
  if (style?.size === size) return `-exact-${style.name}`;
  return undefined;
};

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
    const written = sizeOf(size, source.ramp);
    if (written === undefined || Number.isNaN(size) || leading === 'NaN') return undefined;
    return `${props.get('fontWeight')?.replaceAll("'", '') ?? '400'} ${written}/${leading}`;
  }
  const value = props.get(source.prop ?? '');
  if (value === undefined) return undefined;
  if (token.kind === 'hairline')
    return value === 'StyleSheet.hairlineWidth' ? '-exact-hairline' : undefined;
  if (token.kind === 'length') return `${value}px`;
  return value;
};

/** The ramps the texts drawn in `style` name, `none` for a text that names none. */
const rampsOf = (text: string, style: string) =>
  new Set(
    [...text.matchAll(/<Text\b[^>]*>/gu)]
      .map(([tag]) => tag)
      .filter((tag) => new RegExp(`styles\\.${style}\\b`, 'u').test(tag))
      .map((tag) => /dynamicTypeRamp="(\w+)"/u.exec(tag)?.[1] ?? 'none'),
  );

const files = new Map<string, string>();
const read = (file: string) => {
  const known = files.get(file);
  if (known !== undefined) return known;
  const text = oneFile(file);
  files.set(file, text);
  return text;
};

/** The value each source of `token` gives, in `app.forma`'s terms. */
const valuesOf = (token: Token, reader: (file: string) => string) =>
  token.from.map((source) => {
    const props = styleIn(reader(source.file), source.style);
    return props === undefined ? undefined : formaOf(token, props, source);
  });

const brand = brandOf(appFile('app.forma'));

describe('every measure of the brand is the current hymnal’s', () => {
  for (const token of TOKENS)
    it(`${token.name} is ${token.from.map((s) => `${s.file} ${s.style}${s.prop === undefined ? '' : `.${s.prop}`}`).join(', ')}`, () => {
      const values = valuesOf(token, read);
      expect(values.every((value) => value !== undefined)).toBe(true);
      expect(new Set(values).size).toBe(1);
      expect(brand.measures.get(token.name)).toBe(values[0]);
      if (token.kind === 'type')
        for (const source of token.from)
          expect({ source, ramps: [...rampsOf(read(source.file), source.style)] }).toEqual({
            source,
            ramps: [source.ramp],
          });
    });

  it('the brand writes no measure the list does not trace to One', () => {
    const traced = new Set(TOKENS.map((token) => token.name));
    expect([...brand.measures.keys()].filter((name) => !traced.has(name))).toEqual([]);
  });

  it('a One style or ramp that changes fails its token', () => {
    const unramped = read('src/about.tsx').replaceAll('dynamicTypeRamp="footnote"', '');
    expect([...rampsOf(read('src/about.tsx'), 'heading')]).toEqual(['footnote']);
    expect([...rampsOf(unramped, 'heading')]).toEqual(['none']);
    const resized = (file: string) => read(file).replace('fontSize: 28,', 'fontSize: 27,');
    const titles = TOKENS.filter((token) => token.name === 'type.sheet-title');
    expect(
      titles.map((title) => valuesOf(title, resized)[0] === brand.measures.get(title.name)),
    ).toEqual([false]);
  });
});
