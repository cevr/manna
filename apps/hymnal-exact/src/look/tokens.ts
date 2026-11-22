/** A style of a One file, the ramp its texts name (`none` when they name none), and the property read (none for a type token). */
export interface Source {
  readonly file: string;
  readonly style: string;
  readonly prop?: string;
  readonly ramp: string;
  /** The name the file's texts draw it through (`style={<via>}`), when they do not write `styles.<style>`: a style array held in a name. */
  readonly via?: string;
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
const LIST = 'src/reader/HymnList.native.tsx';
const CHORDS = 'src/reader/Chords.tsx';
const STAR = 'src/reader/StarMark.ios.tsx';
const BOX = 'src/reader/ChordBox.tsx';
const MARK = 'src/player/BarMark.ios.tsx';
const CHIP = 'src/player/Chip.tsx';
const STANZAS = 'src/player/StanzaChips.tsx';
const PLAY_PAGE = 'src/player/PlayPage.tsx';
const SCRUBBER = 'src/player/Scrubber.ios.tsx';
const FIND = 'src/home/FindBar.tsx';
const DRUMS = 'src/player/FindDrums.tsx';
const MAGNIFIER = 'src/home/Magnifier.ios.tsx';
const PANEL = 'src/player/DialPanel.tsx';
const TILES = 'src/home/AllAtOnce.tsx';
const KEY = 'src/player/KeyButton.tsx';
const DIALS = 'src/player/Dials.tsx';
const DIAL = 'src/player/DialView.tsx';

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
  type('type.strong', [SETTINGS, 'check'], [CHORD, 'done'], [LIVE, 'actText'], [DRUMS, 'digit']),
  type(
    'type.body',
    [SETTINGS, 'label', 'body'],
    [PLAYER, 'switchLabel', 'body'],
    [LIST, 'empty'],
    [FIND, 'cancelWords'],
  ),
  type('type.large-title', [HOME, 'titleWords']),
  type('type.topic', [TABS, 'name'], [LIST, 'topicName']),
  type('type.see-all', [LIST, 'seeAll']),
  type('type.row-number', [LIST, 'number']),
  type('type.row-title', [LIST, 'title'], [LIST, 'star']),
  type('type.line', [HYMN, 'line']),
  type('type.small', [ABOUT, 'credit', 'body'], [BAR, 'title']),
  type('type.label', [ACCENT, 'title'], [BAR, 'number'], [PLAY_PAGE, 'text']),
  type('type.caption', [PLAYER, 'caption', 'subheadline']),
  type(
    'type.footnote',
    [SETTINGS, 'heading', 'footnote'],
    [ABOUT, 'heading', 'footnote'],
    [PLAYER, 'time', 'footnote'],
  ),
  type('type.note', [CHORD, 'note']),
  type('type.part', [HYMN, 'label', 'footnote']),
  {
    name: 'type.chord',
    kind: 'type',
    from: [{ file: CHORDS, style: 'chord', ramp: 'subheadline', via: 'style' }],
  },
  type('type.mark', [BOX, 'mark']),
  type('type.first', [BOX, 'first']),
  type('type.finger', [BOX, 'finger']),
  type('type.chip', [CHIP, 'text'], [STANZAS, 'heading']),
  type('type.row-line', [LIST, 'found']),
  type('type.tile-name', [TILES, 'name']),
  type('type.tile-count', [TILES, 'count']),
  type('type.tiles-head', [TILES, 'heading']),
  length('size.strip', [TILES, 'strip', 'height']),
  length('line.tile', [TILES, 'tile', 'borderWidth']),
  type('type.key-over', [KEY, 'over']),
  type('type.key-face', [KEY, 'key'], [DIALS, 'fret']),
  type('type.dial-name', [DIAL, 'title']),
  type('type.dial-key', [DIALS, 'key']),
  type('type.dial-played', [DIALS, 'played']),

  length('space.s4', [PLAYER, 'position', 'gap'], [PLAY_PAGE, 'compact', 'paddingHorizontal']),
  length(
    'space.s6',
    [TABS, 'tab', 'paddingVertical'],
    [CHORDS, 'chord', 'paddingRight'],
    [CHORDS, 'noChord', 'width'],
    [CHIP, 'chip', 'gap'],
  ),
  length(
    'space.s8',
    [SETTINGS, 'page', 'gap'],
    [ABOUT, 'group', 'gap'],
    [TABS, 'row', 'gap'],
    [TABS, 'row', 'paddingVertical'],
    [HOME, 'title', 'paddingRight'],
    [STANZAS, 'section', 'gap'],
    [STANZAS, 'chips', 'gap'],
    [PLAYER, 'row', 'gap'],
    [BAR, 'open', 'gap'],
  ),
  length('space.s10', [HYMN, 'words', 'gap']),
  length('space.s11', [SETTINGS, 'row', 'paddingVertical'], [ABOUT, 'group', 'paddingVertical']),
  length(
    'space.s12',
    [TABS, 'tab', 'paddingHorizontal'],
    [LIST, 'row', 'gap'],
    [CHIP, 'chip', 'paddingHorizontal'],
  ),
  length(
    'space.s16',
    [SETTINGS, 'page', 'padding'],
    [SETTINGS, 'row', 'paddingHorizontal'],
    [ABOUT, 'group', 'paddingHorizontal'],
    [SETTINGS, 'heading', 'marginLeft'],
    [SETTINGS, 'section', 'marginTop'],
    [HOME, 'title', 'paddingLeft'],
    [TABS, 'row', 'paddingHorizontal'],
    [LIST, 'row', 'paddingHorizontal'],
    [LIST, 'topic', 'paddingHorizontal'],
    [LIST, 'empty', 'padding'],
    [PLAYER, 'page', 'gap'],
    [PLAYER, 'control', 'gap'],
    [STANZAS, 'section', 'paddingHorizontal'],
  ),
  length('space.s64', [LIST, 'separator', 'left']),
  length('space.s20', [HYMN, 'page', 'paddingHorizontal']),
  length(
    'space.s24',
    [SETTINGS, 'page', 'paddingTop'],
    [HYMN, 'sections', 'gap'],
    [PLAYER, 'page', 'padding'],
  ),
  length('space.s40', [CHORD, 'sheet', 'paddingBottom']),
  length('space.s48', [HYMN, 'page', 'paddingBottom']),

  length('radius.r12', [SETTINGS, 'group', 'borderRadius'], [ABOUT, 'group', 'borderRadius']),
  length('radius.r16', [TABS, 'tab', 'borderRadius'], [CHIP, 'chip', 'borderRadius']),
  length('radius.r18', [ACCENT, 'button', 'borderRadius']),
  length('radius.pill', [HOME, 'settings', 'borderRadius'], [BAR, 'mark', 'borderRadius']),
  length('radius.grabber', [BAR, 'grabber', 'borderRadius']),

  length(
    'size.target',
    [SETTINGS, 'row', 'minHeight'],
    [HOME, 'settings', 'width'],
    [BAR, 'mark', 'width'],
    [BAR, 'open', 'minHeight'],
    [PLAYER, 'row', 'minHeight'],
    [CHIP, 'chip', 'minWidth'],
    [PLAY_PAGE, 'compact', 'minHeight'],
  ),
  length('size.button', [ACCENT, 'button', 'minHeight'], [LIST, 'number', 'minWidth']),
  length('size.mark', [STAR, 'mark', 'width'], [STAR, 'mark', 'height']),
  length(
    'size.glyph',
    [MARK, 'mark', 'width'],
    [MARK, 'mark', 'height'],
    [MAGNIFIER, 'mark', 'width'],
    [MAGNIFIER, 'mark', 'height'],
  ),
  length('size.grabber', [BAR, 'grabber', 'width']),
  length('size.grabber-line', [BAR, 'grabber', 'height']),
  length('size.slider', [SCRUBBER, 'bar', 'height']),

  measure('hairline')(
    'line.hair',
    [SETTINGS, 'group', 'borderWidth'],
    [ABOUT, 'group', 'borderWidth'],
    [LIST, 'topic', 'borderBottomWidth'],
    [LIST, 'separator', 'height'],
  ),
  length('line.panel', [PANEL, 'panel', 'borderWidth']),

  measure('number')(
    'opacity.pressed',
    [HOME, 'pressed', 'opacity'],
    [PLAYER, 'pressed', 'opacity'],
    [TABS, 'pressed', 'opacity'],
  ),
];

/**
 * A length no One style says, measured in device pixels at 3 px a point
 * from the One reference against the port's screen (`bun run pixel shot`).
 * Mostly a text's move off its line box, written as a `top` on the text:
 * React Native on iOS lays a `Text` with a `lineHeight` out other than CSS
 * does (it puts the line's extra leading elsewhere, and rounds the box up a
 * device pixel), so the same type token draws its glyphs a few pixels
 * apart. And the gear's box: One's `imageScale: large` symbol in its 28 pt
 * frame draws smaller than a symbol fitted to that frame.
 */
export interface Nudge {
  readonly name: string;
  /** The length in device pixels: for a move, down (up when negative). */
  readonly pixels: number;
  readonly why: string;
}

/**
 * A length a One rule says as a multiple of the words' size, not a style:
 * written in `rem`, the words' size at the reader's text size, so it grows
 * with the text as the rule's does.
 */
export interface Ruled {
  readonly name: string;
  readonly file: string;
  /** The rule's `const`, a multiple of the words' size. */
  readonly constant: string;
}

export const RULED: ReadonlyArray<Ruled> = [
  { name: 'space.hang', file: 'src/reader/reading.ts', constant: 'INDENT' },
];

/**
 * A length One writes inline as points times the text's scale
 * (`<prop>: <points> * fontScale`), not in a style: written as its points in
 * `px`, its size at the default text size and the size One draws on the web
 * at every size (React Native's web `fontScale` is always 1). On iOS One's
 * grows with the text; the port's would be `max(<points>px, <points / 17>rem)`,
 * which the kernel refuses until it takes `rem` inside `max()`.
 */
export interface Scaled {
  readonly name: string;
  readonly file: string;
  /** The style property One writes it to. */
  readonly prop: string;
}

export const SCALED: ReadonlyArray<Scaled> = [
  { name: 'space.word', file: 'src/reader/SyllableWords.tsx', prop: 'columnGap' },
];

export const NUDGES: ReadonlyArray<Nudge> = [
  {
    name: 'nudge.title',
    pixels: -1,
    why: 'home’s `Hymns` (Home.native.tsx titleWords) in its 49 pt row',
  },
  {
    name: 'nudge.topic',
    pixels: -3,
    why: 'a topic or shelf name (HymnList.native.tsx topicName) in its 36 pt row',
  },
  {
    name: 'nudge.tab',
    pixels: -2,
    why: 'a tab’s name (TabRow.tsx name) in its pill, the row scrolling with the list',
  },
  {
    name: 'nudge.row',
    pixels: 4,
    why: 'a hymn row’s title and star (HymnList.native.tsx title, star) in its 44 pt row',
  },
  {
    name: 'nudge.number',
    pixels: 3,
    why: 'a hymn row’s number (HymnList.native.tsx number) in its 44 pt row',
  },
  {
    name: 'nudge.gear',
    pixels: 78,
    why: 'the gear’s symbol box, so its mark is as large as Gear.ios.tsx’s `gearshape` at `imageScale: large`',
  },
  {
    name: 'nudge.gear-left',
    pixels: -2,
    why: 'the gear’s mark across its 44 pt button, where Gear.ios.tsx’s symbol sits',
  },
  {
    name: 'nudge.settings-heading',
    pixels: -2,
    why: 'what follows a Settings group heading (settings.tsx heading), whose footnote line box is two device pixels taller under its glyphs,',
  },
  {
    name: 'nudge.settings-title',
    pixels: 2,
    why: 'what follows the Settings title (settings.tsx title), whose line box is two device pixels shorter,',
  },
  {
    name: 'nudge.settings-body',
    pixels: -0.6667,
    why: 'a Settings row’s label (settings.tsx label), whose body line box is two thirds of a device pixel taller,',
  },
  {
    name: 'size.clear',
    pixels: 51,
    why: 'the find box’s clear disk to UIKit’s (FindBar.tsx clearButtonMode, which One sizes nowhere), measured across in find.none’s reference at',
  },
];
