import { describe, expect, it } from 'bun:test';

import { beyond, measureLiterals, styleIn } from './testing.ts';

const SHEET = `
const look = themed((color, face) =>
  StyleSheet.create({
    title: { fontFamily: face, fontSize: 34, fontWeight: '700', color: color.ink },
    button: {
      width: 132,
      height: 132,
      shadowOpacity: 0.3,
      shadowOffset: { width: 0, height: 10 },
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    pressedButton: { transform: [{ scale: 0.97 }] },
    subtitle: { fontSize: 15 },
  }),
);
`;

describe('a One style', () => {
  it('reads each property as written', () => {
    expect(Object.fromEntries(styleIn(SHEET, 'title') ?? [])).toEqual({
      fontFamily: 'face',
      fontSize: '34',
      fontWeight: "'700'",
      color: 'color.ink',
    });
  });

  it('names a nested property by its path, apart from the top one of the same name', () => {
    const button = styleIn(SHEET, 'button');
    expect(button?.get('width')).toBe('132');
    expect(button?.get('shadowOffset.width')).toBe('0');
    expect(button?.get('shadowOffset.height')).toBe('10');
    expect(button?.get('borderTopWidth')).toBe('StyleSheet.hairlineWidth');
    expect(styleIn(SHEET, 'pressedButton')?.get('transform.scale')).toBe('0.97');
  });

  it('finds a style by its whole name, and none the sheet lacks', () => {
    expect(styleIn(SHEET, 'subtitle')?.get('fontSize')).toBe('15');
    expect(styleIn(SHEET, 'itle')).toBeUndefined();
    expect(styleIn('const x = { title: { fontSize: 3 } }', 'title')).toBeUndefined();
  });
});

describe('a measure written as a literal', () => {
  it('finds each kind', () => {
    expect(
      measureLiterals(
        [
          '      column gap=16 padding="0px 20px 12px" max-width="40rem" testId="x-2"',
          '      text "x" font-size="0.9rem" font-weight=600 line-height="22px"',
          '      row border-radius=(on ? 12 : 0) box-shadow="0 10px 36px hs.shadow"',
          '      button -exact-press-scale=0.97 transition="opacity 150ms"',
        ].join('\n'),
      ),
    ).toEqual([
      'gap=16',
      'padding="0px 20px 12px"',
      'max-width="40rem"',
      'font-size="0.9rem"',
      'font-weight=600',
      'line-height="22px"',
      'border-radius=(on ? 12 : 0)',
      'box-shadow="0 10px 36px hs.shadow"',
      '-exact-press-scale=0.97',
      'transition="opacity 150ms"',
    ]);
  });

  it('passes tokens, zero, shares, factors, names with digits and comments', () => {
    expect(
      measureLiterals(
        [
          '      column gap="space.16" padding="calc(space.8 * 2)" inset=0 width="100%"',
          '      text "x" font="-exact-title2" font-size="type.title" margin-top="calc(space.8 / 2)"',
          '      // column gap=16',
          '      row padding-top="0px" testId=`row-${n + 1}` aria-level=2 flex=1',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('reads one attribute for one name: padding-top is not top', () => {
    expect(measureLiterals('      row padding-top=8 top=4')).toEqual(['padding-top=8', 'top=4']);
  });
});

describe('an allow list', () => {
  it('keeps what it allows, once a time, and names what it no longer needs', () => {
    expect(beyond(['gap=8', 'gap=8', 'gap=4'], { 'gap=8': 1, 'gap=4': 1, 'padding=2': 1 })).toEqual(
      {
        extra: ['gap=8'],
        stale: ['padding=2'],
      },
    );
  });
});
