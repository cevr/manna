/**
 * The reading settings' rules over generated kept texts (spec, acceptance
 * 1): every view reads one of each control's choices; a kept text that is
 * exactly a choice is read as it, anything else (empty, junk, a near miss,
 * a size out of range or odd) as the default; the size steps from 14 to 38
 * by 2 and each end disables its button; a step up then down returns the
 * size; and Reset's empty texts read as the defaults, `differs` false
 * exactly then. The choices are written out here, apart from the module.
 */

import { describe, expect, it } from 'bun:test';
import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { seeded, type Random } from '../test/random';
import { typeSources, typeView, type TypeView } from './choices';

const RUNS = 500;

const FONTS = [
  'newyork',
  'sf',
  'rounded',
  'mono',
  'literata',
  'sourceserif',
  'merriweather',
  'lora',
  'inter',
  'atkinson',
  'opendyslexic',
];
const SIZES = [14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38];
const LINES = { snug: 1.35, comfortable: 1.6, airy: 1.9 } as const;
const LETTERS = { normal: 0, wide: 0.03, wider: 0.06 } as const;
const WIDTHS = {
  narrow: [44, '28rem'],
  medium: [20, '36rem'],
  wide: [12, '44rem'],
} as const;
const DEFAULT = ['newyork', 18, 'comfortable', 'normal', 'medium'] as const;

/** The near misses of a choice's text: its case, its spaces, its quotes, a padded or a longer number, a part. */
const nearMisses = (text: string) => [
  text.toUpperCase(),
  ` ${text}`,
  `${text} `,
  `"${text}"`,
  `0${text}`,
  `${text}.0`,
  `${text}x`,
  text.slice(1),
];

/** Sizes no button reaches: odd, out of range, fractional, signed, written otherwise. */
const STRAY_SIZES = ['13', '15', '17', '39', '40', '12', '0', '-18', '18.5', '1e1', '+18', '0x12'];

/** Seeded arbitrary text: up to 10 characters from a wide alphabet, digits and letters of the choices among them. */
const arbitrary = (random: Random) =>
  Array.from({ length: random.below(11) }, () =>
    random.pick([...'0123489 abcdeilmnoprstwyAZ"é\u0000Ω-.']),
  ).join('');

const choices = [
  ...FONTS,
  ...SIZES.map(String),
  ...Object.keys(LINES),
  ...Object.keys(LETTERS),
  ...Object.keys(WIDTHS),
];
const random = seeded(119);
const texts = [
  '',
  ...choices,
  ...choices.flatMap(nearMisses),
  ...STRAY_SIZES,
  ...Array.from({ length: RUNS }, () => arbitrary(random)),
];

/** The value a kept text reads as among `valid`, by the rule written out: exactly one, else the default. */
const expected = <A>(
  valid: readonly string[],
  kept: string,
  read: (text: string) => A,
  fallback: A,
) => {
  if (valid.includes(kept)) return read(kept);
  return fallback;
};

/** Five kept texts drawn from `texts`. */
const draw = (from: Random) =>
  [
    from.pick(texts),
    from.pick(texts),
    from.pick(texts),
    from.pick(texts),
    from.pick(texts),
  ] as const;

const readOf = (view: TypeView) => [view.font, view.size, view.line, view.letter, view.width];

describe('every kept text reads as its choice or the default', () => {
  it('the font', () => {
    for (const text of texts)
      expect([text, typeView(text, '', '', '', '').font]).toEqual([
        text,
        expected(FONTS, text, (key) => key, 'newyork'),
      ]);
  });

  it('the size', () => {
    for (const text of texts)
      expect([text, typeView('', text, '', '', '').size]).toEqual([
        text,
        expected(SIZES.map(String), text, Number, 18),
      ]);
  });

  it('the line spacing, the letter spacing and the line width', () => {
    for (const text of texts) {
      const view = typeView('', '', text, text, text);
      expect([text, view.line, view.letter, view.width]).toEqual([
        text,
        expected(Object.keys(LINES), text, (key) => key, 'comfortable'),
        expected(Object.keys(LETTERS), text, (key) => key, 'normal'),
        expected(Object.keys(WIDTHS), text, (key) => key, 'medium'),
      ]);
    }
  });

  it('always reads one of each control’s choices, and offers them all', () => {
    const from = seeded(7);
    for (let run = 0; run < RUNS; run++) {
      const view = typeView(...draw(from));
      expect(FONTS).toContain(view.font);
      expect(SIZES).toContain(view.size);
      expect(Object.keys(LINES)).toContain(view.line);
      expect(Object.keys(LETTERS)).toContain(view.letter);
      expect(Object.keys(WIDTHS)).toContain(view.width);
      expect(view.fonts.map((option) => option.value)).toEqual(FONTS);
      expect(view.lines.map((option) => option.value)).toEqual(Object.keys(LINES));
      expect(view.letters.map((option) => option.value)).toEqual(Object.keys(LETTERS));
      expect(view.widths.map((option) => option.value)).toEqual(Object.keys(WIDTHS));
    }
  });
});

describe('what a view draws follows what it reads', () => {
  it('the size in rem of the 17-point root, the line height, the letter spacing in rem, the side room and the measure', () => {
    const from = seeded(23);
    for (let run = 0; run < RUNS; run++) {
      const view = typeView(...draw(from));
      const line = new Map<string, number>(Object.entries(LINES)).get(view.line) ?? Number.NaN;
      const letter =
        new Map<string, number>(Object.entries(LETTERS)).get(view.letter) ?? Number.NaN;
      const width: readonly (number | string)[] =
        new Map<string, readonly (number | string)[]>(Object.entries(WIDTHS)).get(view.width) ?? [];
      expect(Number.parseFloat(view.fontSize) * 17).toBeCloseTo(view.size, 2);
      expect(view.fontSize.endsWith('rem')).toBe(true);
      expect(view.lineHeight).toBe(line);
      expect(Number.parseFloat(view.letterSpacing) * 17).toBeCloseTo(view.size * letter, 2);
      expect(view.letterSpacing.endsWith('rem')).toBe(true);
      expect([view.side, view.measure]).toEqual([...width]);
      expect([view.sizeLabel, view.sizeSpoken]).toEqual([`${view.size} pt`, `${view.size} points`]);
    }
  });

  it('names each font by its name and its kind, in words', () => {
    const view = typeView('', '', '', '', '');
    expect(view.fonts.find((option) => option.value === 'literata')?.spoken).toBe(
      'Literata, serif',
    );
    expect(view.fonts.find((option) => option.value === 'atkinson')?.spoken).toBe(
      'Atkinson Hyperlegible, low vision',
    );
    expect(view.fonts.find((option) => option.value === 'opendyslexic')?.kind).toBe('Dyslexia');
  });
});

describe('the size steps by its buttons', () => {
  it('from 14 to 38 by 2, each end disabling its button', () => {
    const walked: number[] = [];
    let kept = '14';
    for (let step = 0; step < 20; step++) {
      const view = typeView('', kept, '', '', '');
      walked.push(view.size);
      if (!view.largerEnabled) break;
      kept = view.larger;
    }
    expect(walked).toEqual(SIZES);
    const top = typeView('', '38', '', '', '');
    const bottom = typeView('', '14', '', '', '');
    expect([top.largerEnabled, top.smallerEnabled, top.larger]).toEqual([false, true, '38']);
    expect([bottom.smallerEnabled, bottom.largerEnabled, bottom.smaller]).toEqual([
      false,
      true,
      '14',
    ]);
  });

  it('a step up then down, or down then up, returns the size away from the ends', () => {
    const from = seeded(31);
    for (let run = 0; run < RUNS; run++) {
      const kept = draw(from);
      const view = typeView(...kept);
      const up = typeView(kept[0], view.larger, kept[2], kept[3], kept[4]);
      const down = typeView(kept[0], view.smaller, kept[2], kept[3], kept[4]);
      if (view.largerEnabled) expect(typeView('', up.smaller, '', '', '').size).toBe(view.size);
      if (view.smallerEnabled) expect(typeView('', down.larger, '', '', '').size).toBe(view.size);
      expect([up.size - view.size, view.largerEnabled]).toEqual([
        2 * Number(view.size < 38),
        view.size < 38,
      ]);
      expect([view.size - down.size, view.smallerEnabled]).toEqual([
        2 * Number(view.size > 14),
        view.size > 14,
      ]);
    }
  });
});

describe('Reset', () => {
  it("Reset's texts read as every default, and nothing differs", () => {
    const view = typeView('', '', '', '', '');
    expect(readOf(view)).toEqual([...DEFAULT]);
    expect(view.differs).toBe(false);
    expect(typeView('NEWYORK', '18', 'comfortable', ' wide', 'medium').differs).toBe(false);
    expect(typeView('newyork', '20', '', '', '').differs).toBe(true);
  });

  it('differs is false exactly when all five read as the defaults', () => {
    const from = seeded(43);
    for (let run = 0; run < RUNS; run++) {
      const view = typeView(...draw(from));
      const same = readOf(view).every((value, at) => value === DEFAULT[at]);
      expect(view.differs).toBe(!same);
    }
  });
});

it('answers inside the data host, at once', () => {
  const from = seeded(5);
  for (let run = 0; run < 50; run++) {
    const kept = draw(from);
    expect(withDataHost(() => typeSources.typeOf(kept))).toEqual(typeView(...kept));
  }
});
