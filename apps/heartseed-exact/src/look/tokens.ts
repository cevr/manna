/** A style of a One file: the style's name in its `StyleSheet.create`, and the property read (none for a type token). */
export interface Source {
  readonly file: string;
  readonly style: string;
  readonly prop?: string;
}

/** What a token holds, and so how its value is written. */
export type Kind = 'type' | 'length' | 'hairline' | 'number' | 'shadow';

export interface Token {
  readonly name: string;
  readonly kind: Kind;
  readonly from: ReadonlyArray<Source>;
}

/** The family every text is drawn in (`theme.ts`'s `face`). */
export const FAMILY = 'family.hs';

/** The colour a shadow is drawn in. */
export const SHADOW_INK = 'hs.shadow';

const DRAW = 'src/sayit/draw.tsx';
const INDEX = 'app/index.tsx';
const ABOUT = 'src/about/screen.tsx';
const SETTINGS = 'src/settings/sheet.tsx';
const CHOICES = 'src/settings/choices.tsx';
const SHELVES = 'src/shelves/sheet.tsx';
const FIELD = 'src/field/screen.tsx';
const PLOT = 'src/field/plot.tsx';
const SINGLES = 'src/field/singles.tsx';
const CARD = 'src/field/card.tsx';
const TIPS = 'src/field/tips.tsx';
const LIST = 'src/list/screen.tsx';
const TENDED = 'src/run/tended.tsx';
const BACK = 'src/garden/back.tsx';

const type = (name: string, ...from: ReadonlyArray<readonly [string, string]>): Token => ({
  name,
  kind: 'type',
  from: from.map(([file, style]) => ({ file, style })),
});

const measure =
  (kind: Kind) =>
  (name: string, ...from: ReadonlyArray<readonly [string, string, string]>): Token => ({
    name,
    kind,
    from: from.map(([file, style, prop]) => ({ file, style, prop })),
  });

const length = measure('length');
const number = measure('number');

/**
 * The measures of `app.forma` taken from the current Heartseed (One): each
 * token with the One files and styles it comes from. A type token is a
 * style's `fontSize`, `fontWeight` and `lineHeight`; any other token is one
 * style property. `tokens.test.ts` reads each style from its One file and
 * fails when a source's value and the token's differ, or when `app.forma`
 * writes the token other than its rule makes it from that value.
 *
 * Every text of One is `ui-rounded` and follows Dynamic Type as React
 * Native's `fontSize` does, so a size is written in `rem` (the body size,
 * 17 pt at the default size on iOS) and a line height as its share of the
 * size. A space, radius or size does not scale, so it is written in px.
 */
export const TOKENS: ReadonlyArray<Token> = [
  type('type.title', [DRAW, 'title']),
  type('type.sheet-title', [SETTINGS, 'title'], [SHELVES, 'title']),
  type('type.word', [DRAW, 'word'], [INDEX, 'words']),
  type('type.chevron', [PLOT, 'chevron'], [LIST, 'chevron']),
  type('type.name', [ABOUT, 'name']),
  type(
    'type.strong',
    [DRAW, 'reference'],
    [DRAW, 'summary'],
    [DRAW, 'buttonText'],
    [CARD, 'headline'],
    [PLOT, 'title'],
    [FIELD, 'endText'],
    [ABOUT, 'backText'],
    [TENDED, 'line'],
  ),
  type('type.body', [ABOUT, 'rowText'], [TENDED, 'reference']),
  type(
    'type.label',
    [PLOT, 'pillText'],
    [FIELD, 'greetingText'],
    [CHOICES, 'line'],
    [CHOICES, 'word'],
    [SETTINGS, 'line'],
    [SETTINGS, 'buttonText'],
    [SHELVES, 'buttonText'],
    [LIST, 'backText'],
    [BACK, 'controlText'],
    [INDEX, 'gradeName'],
  ),
  type('type.small', [CARD, 'parts'], [DRAW, 'stage'], [LIST, 'caption'], [SHELVES, 'note']),
  type('type.note', [DRAW, 'alert'], [FIELD, 'limit'], [CHOICES, 'naturalText']),
  type('type.note-strong', [SINGLES, 'words'], [LIST, 'line'], [SHELVES, 'line'], [BACK, 'line']),
  type('type.credits', [ABOUT, 'credits']),
  type('type.plant', [SHELVES, 'plantText']),
  type('type.caption', [PLOT, 'furrowCaption']),
  type('type.caption-strong', [FIELD, 'label'], [SINGLES, 'label']),
  type('type.badge', [TIPS, 'badgeText']),
  type('type.licence', [ABOUT, 'licence']),

  length('space.page', [DRAW, 'content', 'paddingHorizontal'], [ABOUT, 'bar', 'paddingHorizontal']),
  length('space.section', [DRAW, 'content', 'gap']),
  length('space.s2', [PLOT, 'names', 'gap']),
  length('space.s4', [PLOT, 'plots', 'gap']),
  length('space.s6', [PLOT, 'pill', 'gap']),
  length('space.s7', [DRAW, 'verse', 'columnGap']),
  length('space.s8', [ABOUT, 'content', 'paddingTop'], [ABOUT, 'bar', 'paddingBottom']),
  length('space.s10', [INDEX, 'passage', 'gap']),
  length('space.s12', [FIELD, 'top', 'gap']),
  length('space.s14', [SHELVES, 'head', 'gap']),
  length('space.s16', [ABOUT, 'content', 'gap']),
  length('space.s18', [PLOT, 'pill', 'paddingHorizontal']),
  length('space.s20', [INDEX, 'toField', 'paddingHorizontal']),
  length('space.s24', [FIELD, 'top', 'paddingHorizontal']),

  length('radius.r4', [DRAW, 'hearing', 'borderRadius']),
  length('radius.r12', [PLOT, 'open', 'borderRadius']),
  length('radius.r16', [FIELD, 'endRow', 'borderRadius']),
  length('radius.r20', [INDEX, 'result', 'borderRadius']),
  length('radius.pill', [PLOT, 'pill', 'borderRadius'], [INDEX, 'grade', 'borderRadius']),
  length('radius.button', [DRAW, 'button', 'borderRadius']),

  length('size.target', [ABOUT, 'row', 'minHeight'], [PLOT, 'pill', 'minHeight']),
  length('size.row', [FIELD, 'endRow', 'minHeight']),
  length('size.row-tall', [LIST, 'row', 'minHeight']),
  length('size.button', [DRAW, 'button', 'width'], [DRAW, 'button', 'height']),
  length('size.dot', [DRAW, 'dot', 'width'], [DRAW, 'dot', 'height']),
  length('size.mark', [DRAW, 'mark', 'width'], [DRAW, 'stageRow', 'minHeight']),
  length('size.slot', [DRAW, 'slot', 'height'], [DRAW, 'unsaid', 'lineHeight']),
  length('size.mark-tall', [DRAW, 'mark', 'height']),

  measure('hairline')('line.hair', [ABOUT, 'row', 'borderTopWidth']),
  length('line.edge', [PLOT, 'pill', 'borderWidth'], [SETTINGS, 'button', 'borderWidth']),
  length('line.slot', [DRAW, 'slot', 'borderBottomWidth']),

  number('opacity.pressed', [DRAW, 'pressed', 'opacity']),
  number('opacity.disabled', [DRAW, 'disabled', 'opacity']),
  {
    name: 'scale.pressed',
    kind: 'number',
    from: [{ file: DRAW, style: 'pressedButton', prop: 'transform.scale' }],
  },
  { name: 'shadow.button', kind: 'shadow', from: [{ file: DRAW, style: 'button' }] },
];
