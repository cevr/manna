/** A reading face: its key, the words its tile shows, the kind under them, and the family `features/type.contract` declares for its files in `assets/fonts/<key>/` ('' for a face the system draws). */
export interface TypeFont {
  readonly key: string;
  readonly label: string;
  readonly kind: string;
  readonly bundled: string;
}

/** The eleven faces in the order the sheet offers them (the plan's "Fonts" table): the four the system draws, then the seven bundled under the OFL. */
export const TYPE_FONTS: readonly TypeFont[] = [
  { key: 'newyork', label: 'New York', kind: 'Serif', bundled: '' },
  { key: 'sf', label: 'San Francisco', kind: 'Sans', bundled: '' },
  { key: 'rounded', label: 'Rounded', kind: 'Sans', bundled: '' },
  { key: 'mono', label: 'SF Mono', kind: 'Mono', bundled: '' },
  { key: 'literata', label: 'Literata', kind: 'Serif', bundled: 'Literata' },
  { key: 'sourceserif', label: 'Source Serif', kind: 'Serif', bundled: 'Source Serif 4' },
  { key: 'merriweather', label: 'Merriweather', kind: 'Serif', bundled: 'Merriweather' },
  { key: 'lora', label: 'Lora', kind: 'Serif', bundled: 'Lora' },
  { key: 'inter', label: 'Inter', kind: 'Sans', bundled: 'Inter' },
  {
    key: 'atkinson',
    label: 'Atkinson Hyperlegible',
    kind: 'Low vision',
    bundled: 'Atkinson Hyperlegible',
  },
  { key: 'opendyslexic', label: 'OpenDyslexic', kind: 'Dyslexia', bundled: 'OpenDyslexic' },
];

/** The sizes offered, in points at the system's default text size: 14 to 38 in steps of 2. */
export const TYPE_SIZES: readonly number[] = Array.from({ length: 13 }, (_, step) => 14 + 2 * step);

/** The line spacings: a multiple of the size. */
export const TYPE_LINES = [
  { key: 'snug', label: 'Snug', height: 1.35 },
  { key: 'comfortable', label: 'Comfortable', height: 1.6 },
  { key: 'airy', label: 'Airy', height: 1.9 },
] as const;

/** The letter spacings: a share of the size (CSS's `em`). */
export const TYPE_LETTERS = [
  { key: 'normal', label: 'Normal', em: 0 },
  { key: 'wide', label: 'Wide', em: 0.03 },
  { key: 'wider', label: 'Wider', em: 0.06 },
] as const;

/** The line widths: the side room on a phone, in points, and the longest line on a wide window, in `rem`. */
export const TYPE_WIDTHS = [
  { key: 'narrow', label: 'Narrow', side: 44, measure: 28 },
  { key: 'medium', label: 'Medium', side: 20, measure: 36 },
  { key: 'wide', label: 'Wide', side: 12, measure: 44 },
] as const;

const [, COMFORTABLE] = TYPE_LINES;
const [NORMAL] = TYPE_LETTERS;
const [, MEDIUM] = TYPE_WIDTHS;

/** What each setting reads as while its kept text names none of its choices. */
export const TYPE_DEFAULTS = {
  font: 'newyork',
  size: 18,
  line: COMFORTABLE.key,
  letter: NORMAL.key,
  width: MEDIUM.key,
} as const;

/** The root text size, in points, the chosen size is drawn against: iOS's body at the default text size. A size is written in `rem` of it, so it follows the reader's system text size. */
export const TYPE_ROOT_POINTS = 17;

/** One choice as the sheet offers it: the text kept, the words shown, the kind under a font's name, and the name a screen reader says. */
export interface TypeOption {
  readonly value: string;
  readonly label: string;
  readonly kind: string;
  readonly spoken: string;
}

/** The settings as read, what they draw, and what the sheet offers. */
export interface TypeView {
  readonly font: string;
  readonly size: number;
  readonly line: string;
  readonly letter: string;
  readonly width: string;
  /** The size as drawn: `rem` of the root text size. */
  readonly fontSize: string;
  /** The line height, a multiple of the size. */
  readonly lineHeight: number;
  /** The letter spacing as drawn, in `rem`. */
  readonly letterSpacing: string;
  /** The room at each side of the text, in points. */
  readonly side: number;
  /** The longest line on a wide window, in `rem`. */
  readonly measure: string;
  /** The size's words between its buttons, and what a screen reader says of it. */
  readonly sizeLabel: string;
  readonly sizeSpoken: string;
  /** The kept text the smaller and the larger button write, and whether each is enabled. */
  readonly smaller: string;
  readonly larger: string;
  readonly smallerEnabled: boolean;
  readonly largerEnabled: boolean;
  /** Whether any setting reads other than its default: Reset is enabled exactly then. */
  readonly differs: boolean;
  readonly fonts: TypeOption[];
  readonly lines: TypeOption[];
  readonly letters: TypeOption[];
  readonly widths: TypeOption[];
}

/** The key of `kept` among `keys`, else `fallback`. */
const keyOf = (keys: readonly string[], kept: string, fallback: string) =>
  keys.find((key) => key === kept) ?? fallback;

/** The size a kept text names: one of `TYPE_SIZES` when the text is exactly its digits, else 18. */
export const sizeOf = (kept: string): number =>
  TYPE_SIZES.find((size) => String(size) === kept) ?? TYPE_DEFAULTS.size;

/** A number written for Contract's lengths: at most four decimals, no trailing zeros. */
const decimal = (value: number) => String(Math.round(value * 10_000) / 10_000);

/** A choice with no kind, named as it is shown. */
const plain = (choice: { readonly key: string; readonly label: string }): TypeOption => ({
  value: choice.key,
  label: choice.label,
  kind: '',
  spoken: choice.label,
});

const fontOptions: TypeOption[] = TYPE_FONTS.map((font) => ({
  value: font.key,
  label: font.label,
  kind: font.kind,
  spoken: `${font.label}, ${font.kind.toLowerCase()}`,
}));
const lineOptions = TYPE_LINES.map(plain);
const letterOptions = TYPE_LETTERS.map(plain);
const widthOptions = TYPE_WIDTHS.map(plain);

/** The size's neighbour `by` steps away, or the size itself past an end. */
const stepped = (size: number, by: number) => {
  const at = TYPE_SIZES.indexOf(size) + by;
  return TYPE_SIZES[at] ?? size;
};

/**
 * The reader's text settings (q118, q121) as read from the five texts
 * Contract's `persist` keeps (`typeFontKept`, `typeSizeKept`, `typeLineKept`,
 * `typeLetterKept`, `typeWidthKept`, empty until chosen), by Settings' rule:
 * a text that is exactly one of the choices is read as it, any other as the
 * default. With what they draw, each control's options, the size buttons'
 * next texts and whether each is enabled, and whether anything differs from
 * the default.
 */
export const typeView = (
  fontKept: string,
  sizeKept: string,
  lineKept: string,
  letterKept: string,
  widthKept: string,
): TypeView => {
  const font = keyOf(
    TYPE_FONTS.map((each) => each.key),
    fontKept,
    TYPE_DEFAULTS.font,
  );
  const size = sizeOf(sizeKept);
  const line = TYPE_LINES.find((each) => each.key === lineKept) ?? COMFORTABLE;
  const letter = TYPE_LETTERS.find((each) => each.key === letterKept) ?? NORMAL;
  const width = TYPE_WIDTHS.find((each) => each.key === widthKept) ?? MEDIUM;
  const smaller = stepped(size, -1);
  const larger = stepped(size, 1);
  return {
    font,
    size,
    line: line.key,
    letter: letter.key,
    width: width.key,
    fontSize: `${decimal(size / TYPE_ROOT_POINTS)}rem`,
    lineHeight: line.height,
    letterSpacing: `${decimal((size * letter.em) / TYPE_ROOT_POINTS)}rem`,
    side: width.side,
    measure: `${width.measure}rem`,
    sizeLabel: `${size} pt`,
    sizeSpoken: `${size} points`,
    smaller: String(smaller),
    larger: String(larger),
    smallerEnabled: smaller !== size,
    largerEnabled: larger !== size,
    differs:
      font !== TYPE_DEFAULTS.font ||
      size !== TYPE_DEFAULTS.size ||
      line.key !== TYPE_DEFAULTS.line ||
      letter.key !== TYPE_DEFAULTS.letter ||
      width.key !== TYPE_DEFAULTS.width,
    fonts: fontOptions,
    lines: lineOptions,
    letters: letterOptions,
    widths: widthOptions,
  };
};

/** The reading settings' one data source, as `app.ts` registers it: the view of the kept texts, answered at once. */
export const typeSources = {
  typeOf: ([font, size, line, letter, width]: readonly [
    string,
    string,
    string,
    string,
    string,
  ]): TypeView => typeView(font, size, line, letter, width),
};
