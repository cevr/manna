/** A style of a One file, the ramp its texts name (`none` when they name none), and the property read (none for a type token). */
export interface Source {
  readonly file: string;
  readonly style: string;
  readonly prop?: string;
  readonly ramp: string;
}

/** What a token holds, and so how its value is written. */
export type Kind = 'type' | 'length' | 'hairline' | 'number';

export interface Token {
  readonly name: string;
  readonly kind: Kind;
  readonly from: ReadonlyArray<Source>;
}

const SETTINGS = 'app/(hymnal)/settings.tsx';
const ABOUT = 'src/about.tsx';
const HYMN = 'src/reader/HymnPage.tsx';
const CHORD = 'src/reader/ChordSheet.tsx';
const PLAYER = 'src/player/FullPlayer.tsx';
const BAR = 'src/player/PlayerBar.tsx';
const LIVE = 'src/player/LivePlayer.tsx';
const ACCENT = 'src/player/AccentButton.tsx';
const HOME = 'src/home/Home.native.tsx';
const TABS = 'src/home/TabRow.tsx';

const type = (
  name: string,
  ...from: ReadonlyArray<readonly [string, string] | readonly [string, string, string]>
): Token => ({
  name,
  kind: 'type',
  from: from.map(([file, style, ramp = 'none']) => ({ file, style, ramp })),
});

const measure =
  (kind: Kind) =>
  (name: string, ...from: ReadonlyArray<readonly [string, string, string]>): Token => ({
    name,
    kind,
    from: from.map(([file, style, prop]) => ({ file, style, prop, ramp: 'none' })),
  });

const length = measure('length');

/**
 * The measures of `app.forma` taken from the current hymnal (One): each
 * token with the One files and styles it comes from. A type token is a
 * style's `fontSize`, `fontWeight` and `lineHeight`, and the
 * `dynamicTypeRamp` its texts name; any other token is one style property.
 * `tokens.test.ts` reads each style and its texts from the One file and
 * fails when they and the token differ, or when `app.forma` writes the
 * token other than its rule makes it.
 *
 * Every text follows Dynamic Type. A text on a ramp grows by its text
 * style's curve, so a size equal to the style's is written as the style
 * (`-exact-footnote`); a text on the body ramp, or on none, grows as the
 * body does, so its size is written in `rem` (the body size, 17 pt at the
 * default size on iOS). A line height is its share of the size. A space,
 * radius or size does not scale: it is written in px.
 */
export const TOKENS: ReadonlyArray<Token> = [
  type('type.sheet-title', [SETTINGS, 'title']),
  type('type.hymn-title', [HYMN, 'title', 'title2']),
  type('type.hymn-number', [HYMN, 'number', 'title2']),
  type('type.head', [PLAYER, 'head']),
  type('type.name', [CHORD, 'name'], [LIVE, 'hashText']),
  type('type.chevron', [SETTINGS, 'chevron']),
  type('type.strong', [SETTINGS, 'check'], [CHORD, 'done'], [LIVE, 'actText']),
  type('type.body', [SETTINGS, 'label', 'body'], [PLAYER, 'switchLabel', 'body']),
  type('type.line', [HYMN, 'line']),
  type('type.small', [ABOUT, 'credit', 'body'], [BAR, 'title']),
  type('type.label', [ACCENT, 'title'], [BAR, 'number']),
  type('type.caption', [PLAYER, 'caption', 'subheadline']),
  type(
    'type.footnote',
    [SETTINGS, 'heading', 'footnote'],
    [ABOUT, 'heading', 'footnote'],
    [PLAYER, 'time', 'footnote'],
  ),
  type('type.note', [CHORD, 'note']),

  length('space.s4', [PLAYER, 'position', 'gap']),
  length('space.s8', [SETTINGS, 'page', 'gap'], [ABOUT, 'group', 'gap']),
  length('space.s10', [HYMN, 'words', 'gap']),
  length('space.s11', [SETTINGS, 'row', 'paddingVertical'], [ABOUT, 'group', 'paddingVertical']),
  length('space.s12', [TABS, 'tab', 'paddingHorizontal']),
  length(
    'space.s16',
    [SETTINGS, 'page', 'padding'],
    [SETTINGS, 'row', 'paddingHorizontal'],
    [ABOUT, 'group', 'paddingHorizontal'],
    [SETTINGS, 'heading', 'marginLeft'],
    [SETTINGS, 'section', 'marginTop'],
  ),
  length('space.s20', [HYMN, 'page', 'paddingHorizontal']),
  length('space.s24', [SETTINGS, 'page', 'paddingTop'], [HYMN, 'sections', 'gap']),

  length('radius.r12', [SETTINGS, 'group', 'borderRadius'], [ABOUT, 'group', 'borderRadius']),
  length('radius.r16', [TABS, 'tab', 'borderRadius']),
  length('radius.r18', [ACCENT, 'button', 'borderRadius']),
  length('radius.pill', [HOME, 'settings', 'borderRadius']),

  length('size.target', [SETTINGS, 'row', 'minHeight'], [HOME, 'settings', 'width']),
  length('size.button', [ACCENT, 'button', 'minHeight']),

  measure('hairline')(
    'line.hair',
    [SETTINGS, 'group', 'borderWidth'],
    [ABOUT, 'group', 'borderWidth'],
  ),

  measure('number')(
    'opacity.pressed',
    [HOME, 'pressed', 'opacity'],
    [PLAYER, 'pressed', 'opacity'],
  ),
];
