/**
 * The list and the hymn page, rendered to HTML as the web build renders
 * them, over the real compiled hymnal (`src/test/setup.ts`).
 */

import { describe, expect, it } from 'bun:test';
import { type Hymn, sung } from '@bible/hymnal/hymn';
import { RegistryProvider, useAtomSet } from '@effect/atom-react';
import { Option } from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pressable, StyleSheet, View } from 'react-native';

import { hymnAt, hymns } from '~/hymns/hymns';
import type { ChordStyle } from '~/hymns/simple';

import { readerOn } from '../test/reader';
import { perform } from '../test/props';
import { ChordReaderContext, Dials, useThumb } from '~/player/Dials';
import { KeyButton } from '~/player/KeyButton';
import { HymnList } from './HymnList';
import { HymnPage } from './HymnPage';
import { hymnsOffset } from './place';
import { readHymns } from '../../vite/words';

let hymnsRead: ReadonlyArray<Hymn> = [];
/** The compiled hymns, read once. */
const compiled = () => {
  if (hymnsRead.length === 0) hymnsRead = readHymns();
  return hymnsRead;
};

/** The page's text, tags dropped, one space between pieces. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();

/** The page's text as it is read: each line as its accessible name, the words its syllables make. */
const readOf = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  for (const line of host.querySelectorAll('[data-testid="line"]'))
    line.textContent = line.getAttribute('aria-label');
  return textOf(host.innerHTML);
};

/** Each section's accessible name, in page order. */
const sectionsOf = (html: string) =>
  [...html.matchAll(/<div [^>]*role="group"[^>]*>/g)].map(
    ([tag]) => /aria-label="([^"]+)"/.exec(tag)?.[1],
  );

const hymn = (n: number) => Option.getOrThrow(hymnAt(String(n)));

const rowSheet = StyleSheet.create({ row: { flexDirection: 'row' } });

/** The class react-native-web draws a row (`flexDirection: 'row'`) with. */
const rowClass = Option.getOrThrow(
  Option.fromNullishOr(
    /r-flexDirection-\w+/.exec(renderToStaticMarkup(<View style={rowSheet.row} />))?.[0],
  ),
);

const page = (n: number) => renderToStaticMarkup(<HymnPage hymn={hymn(n)} reader={readerOn()} />);

describe('the hymn list', () => {
  it('holds every hymn of the 1985 hymnal, 1 to 695 in order', () => {
    expect(hymns).toHaveLength(695);
    expect(hymns.map((h) => h.number)).toEqual(Array.from({ length: 695 }, (_, k) => k + 1));
  });

  it('shows each row as its number and title, linking to the hymn', () => {
    const html = renderToStaticMarkup(
      <HymnList hymns={hymns} hrefOf={(n) => `/hymns/${n}`} offset={hymnsOffset} />,
    );
    expect(html).toContain('aria-label="1, Praise to the Lord"');
    expect(html).toContain('href="/hymns/1"');
    expect(textOf(html)).toContain('1 Praise to the Lord 2 All Creatures of Our God and King');
  });

  it('says so when it has no hymn to show', () => {
    const html = renderToStaticMarkup(
      <HymnList
        hymns={[]}
        hrefOf={(n) => `/hymns/${n}`}
        offset={hymnsOffset}
        empty="No hymn matches “zzq”."
      />,
    );
    expect(textOf(html)).toBe('No hymn matches “zzq”.');
  });
});

describe('a hymn page', () => {
  it('shows hymn 1 as its title, then its three stanzas in order', () => {
    const html = page(1);
    expect(sectionsOf(html)).toEqual(['Stanza 1', 'Stanza 2', 'Stanza 3']);
    const text = readOf(html);
    // Each stanza's first and last line, as the 1985 hymnal prints them.
    const expected = [
      '1 Praise to the Lord',
      '1 Praise to the Lord, the Almighty, the King of creation!',
      'Join ye in glad adoration!',
      "2 Praise to the Lord, who o'er all things so wondrously reigneth,",
      'Granted in what He ordaineth?',
      '3 Praise to the Lord, who doth prosper thy work and defend thee;',
      'If with His love He befriend thee.',
    ];
    let from = 0;
    for (const piece of expected) {
      const at = text.indexOf(piece, from);
      expect({ piece, found: at >= from }).toEqual({ piece, found: true });
      from = at + piece.length;
    }
  });

  it('heads hymn 15 with its topic as a quiet line, above its number and title in one row', () => {
    const html = page(15);
    const { number, title, topic } = hymn(15);
    const head = html.slice(0, html.indexOf('role="group"'));
    const topicAt = head.lastIndexOf('<', head.indexOf('data-testid="hymn-topic"'));
    const nameAt = head.lastIndexOf('<', head.indexOf('data-testid="hymn-name"'));
    // The topic is its own line above the row, apart from the heading.
    expect(textOf(head.slice(0, topicAt))).toBe('');
    expect(textOf(head.slice(topicAt, nameAt))).toBe(topic);
    // The row lays its pieces side by side (the class a row View draws with): the number, then the title.
    const row = head.slice(nameAt);
    expect(row.slice(0, row.indexOf('>'))).toContain(rowClass);
    expect(textOf(row).startsWith(`${number} ${title}`)).toBe(true);
    expect(row.indexOf(`>${number}<`)).toBeLessThan(row.indexOf('role="heading"'));
  });

  it('writes the refrain out after each stanza where it is sung after each (100)', () => {
    const html = page(100);
    expect(sectionsOf(html)).toEqual([
      'Stanza 1',
      'Refrain',
      'Stanza 2',
      'Refrain',
      'Stanza 3',
      'Refrain',
    ]);
    const text = readOf(html);
    expect(text.split('Morning by morning new mercies I see;').length - 1).toBe(3);
  });

  it('puts the refrain before each stanza where it is sung first (349)', () => {
    expect(sectionsOf(page(349))).toEqual([
      'Refrain',
      'Stanza 1',
      'Refrain',
      'Stanza 2',
      'Refrain',
      'Stanza 3',
    ]);
  });
});

/** `node` mounted in the document, as a phone or the web shows it; it unmounts when the `using` ends. */
const mount = (node: ReactNode) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<RegistryProvider>{node}</RegistryProvider>));
  return {
    host,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const press = (host: HTMLElement, label: string) =>
  act(() => {
    const target = Option.getOrThrow(
      Option.fromNullishOr(host.querySelector<HTMLElement>(`[aria-label="${label}"]`)),
    );
    target.click();
  });

/** The text of the box with test id `id`, or none where the page has no such box. */
const chordAt = (host: HTMLElement, id: string) =>
  Option.map(
    Option.fromNullishOr(host.querySelector(`[data-testid="${id}"]`)),
    (box) => box.textContent,
  );

/** Each section's text, in page order. */
const sectionTexts = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="group"]')].map((group) => textOf(group.innerHTML));

/** A reader who has turned chords on. */
const chordsOn = () => new Map([['chords', 'true']]);

describe('a hymn page with chords off', () => {
  it('shows no chord and no key control, and decodes the hymn shown once', () => {
    const reader = readerOn();
    const html = renderToStaticMarkup(<HymnPage hymn={hymn(100)} reader={reader} />);
    expect(html).not.toContain('data-testid="chord');
    expect(html).not.toContain('Transpose');
    expect(html).not.toContain('Capo');
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('aria-label="Chords"');
    expect(reader.book.decodes()).toBe(1);
  });

  it('draws each sung line as its syllables, read as its whole words (F1c)', () => {
    const shown = hymn(100);
    const html = renderToStaticMarkup(<HymnPage hymn={shown} reader={readerOn()} />);
    const lines = linesOf(html);
    const words = shown.sections.flatMap((section) => section.lines);
    expect(lines.length).toBe(24);
    expect(lines.map((line) => line.label)).toEqual(words);
    expect(count(html, 'data-testid="syllable-')).toBe(syllableCount(100));
    expect(syllableCount(100)).toBeGreaterThan(24);
    // The hyphens sit inside the words and are not read.
    for (const line of lines) expect(line.hyphens).toBe(line.hidden);
  });
});

/** Every `line` element's accessible name, its hyphens and its hidden hyphens. */
const linesOf = (html: string) =>
  html
    .split(/(?=<div [^>]*data-testid="line")/)
    .slice(1)
    .map((piece) => ({
      label: textOf(/aria-label="([^"]*)"/.exec(piece)?.[1] ?? ''),
      hyphens: count(piece, '>-</'),
      hidden: [...piece.matchAll(/aria-hidden="true"[^>]*><div[^>]*>-</g)].length,
    }));

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** Hymn `n`'s sung syllables, page order, as compiled: its Sung parts' syllables each time sung. */
const syllableCount = (n: number) =>
  sung(Option.getOrThrow(Option.fromUndefinedOr(compiled().find((h) => h.number === n)))).reduce(
    (sum, line) => {
      if (line.part._tag !== 'Sung') return sum;
      return sum + (line.part.lines[line.line]?.length ?? 0);
    },
    0,
  );

describe('a hymn page with chords on and a line-level part', () => {
  it('draws the chord row over the line’s syllables (F1c)', () => {
    const number = lineLevelHymn();
    using app = mount(<HymnPage hymn={hymn(number)} reader={readerOn(chordsOn())} />);
    const html = app.host.innerHTML;
    const row = /data-testid="chords-(\d+)-(\d+)"/.exec(html);
    expect(row).not.toBeNull();
    expect(html).toContain(`data-testid="syllable-${row?.[1]}-${row?.[2]}-1"`);
  });
});

/** The first of hymns 11, 14 and 25 with a line-level part. */
const lineLevelHymn = () =>
  Option.getOrThrow(
    Option.fromUndefinedOr(
      [11, 14, 25].find((n) =>
        compiled()
          .find((h) => h.number === n)
          ?.stanzas.some((part) => part._tag === 'Sung' && part.level === 'line'),
      ),
    ),
  );

/** The bar's key button and, while open, its dials, for `n`'s page, as the bar draws them. */
function KeyAt({ n }: { readonly n: number }) {
  const thumb = useThumb(n);
  return (
    <>
      <KeyButton thumb={thumb} />
      {Option.match(
        Option.filter(thumb.printed, () => thumb.state.open),
        {
          onNone: () => <></>,
          onSome: (printed) => <Dials thumb={thumb} printed={printed} />,
        },
      )}
    </>
  );
}

/** The bar's key button over `n`'s page, both over `reader`. */
const withKey = (n: number, reader: ReturnType<typeof readerOn>) => (
  <ChordReaderContext value={reader}>
    <KeyAt n={n} />
    <HymnPage hymn={hymn(n)} reader={reader} />
  </ChordReaderContext>
);

const found = (host: HTMLElement, selector: string) =>
  Option.getOrThrow(Option.fromNullishOr(host.querySelector(selector)));

/** The key button: its value, and whether it draws the guitar's head. */
const keyButton = (host: HTMLElement) =>
  Option.map(
    Option.fromNullishOr(host.querySelector('[role="button"][aria-label="Key"]')),
    (button) => ({
      value: button.getAttribute('aria-valuetext'),
      head: Option.isSome(
        Option.fromNullishOr(button.querySelector('[data-testid="guitar-head"]')),
      ),
    }),
  );

/** A hold of the key button, as VoiceOver's action makes it. */
const hold = (host: HTMLElement) => perform(found(host, '[aria-label="Key"]'), 'chords');

/** The dial named `label`, once open. */
const dial = (host: HTMLElement, label: string) =>
  found(host, `[role="slider"][aria-label="${label}"]`);

/** The dial named `label` turned one detent, up or down, as VoiceOver turns it. */
const turn = (host: HTMLElement, label: string, way: 'increment' | 'decrement' = 'increment') =>
  perform(dial(host, label), way);

const valueOf = (host: HTMLElement, label: string) =>
  dial(host, label).getAttribute('aria-valuetext');

const chordRows = (host: HTMLElement) => host.querySelectorAll('[data-testid^="chord-"]').length;

describe('the bar’s key button', () => {
  it('turns chords on for every hymn by a hold: hymn 3 and hymn 5 both show their chord rows', () => {
    const device = new Map<string, string>();
    {
      using app = mount(withKey(3, readerOn(device)));
      expect(keyButton(app.host)).toEqual(Option.some({ value: 'Chords off', head: true }));
      expect(chordRows(app.host)).toBe(0);
      hold(app.host);
      expect(keyButton(app.host)).toEqual(Option.some({ value: 'G', head: true }));
      expect(chordRows(app.host)).toBeGreaterThan(0);
    }
    using app = mount(withKey(5, readerOn(device)));
    expect(chordRows(app.host)).toBeGreaterThan(0);
  });

  it('opens the capo and key dials on a tap, and the key dial alone with chords off', () => {
    using app = mount(withKey(3, readerOn(chordsOn())));
    expect(textOf(app.host.innerHTML)).not.toContain('CAPO');
    press(app.host, 'Key');
    expect(valueOf(app.host, 'Key')).toBe('G');
    expect(valueOf(app.host, 'Capo')).toBe('No capo');
    hold(app.host);
    expect(keyButton(app.host)).toEqual(Option.some({ value: 'Chords off', head: true }));
    expect(app.host.querySelector('[role="slider"][aria-label="Capo"]')).toBeNull();
    expect(valueOf(app.host, 'Key')).toBe('G');
    expect(chordRows(app.host)).toBe(0);
  });

  it('opens with chords shown over a store that kept chords on', () => {
    using app = mount(withKey(3, readerOn(chordsOn())));
    expect(keyButton(app.host)).toEqual(Option.some({ value: 'G', head: true }));
    expect(chordRows(app.host)).toBeGreaterThan(0);
  });
});

describe('a hymn page with chords on', () => {
  it('puts the chords over their syllables in the printed key, and follows the transpose and capo', () => {
    const reader = readerOn(chordsOn());
    using app = mount(withKey(100, reader));
    const { host } = app;
    expect(chordAt(host, 'chord-1-1-1')).toEqual(Option.some('Db'));
    press(host, 'Key');
    expect(valueOf(host, 'Key')).toBe('Db');
    expect(valueOf(host, 'Capo')).toBe('No capo');

    turn(host, 'Key');
    expect(chordAt(host, 'chord-1-1-1')).toEqual(Option.some('D'));
    turn(host, 'Capo');
    turn(host, 'Capo');
    expect(valueOf(host, 'Capo')).toBe('Capo 2, C shapes');
    expect(chordAt(host, 'chord-1-1-1')).toEqual(Option.some('C'));
    turn(host, 'Key');
    expect(valueOf(host, 'Key')).toBe('Eb');
    expect(chordAt(host, 'chord-1-1-1')).toEqual(Option.some('Db'));
    expect(reader.book.decodes()).toBe(1);
  });

  it('shows the words alone again once chords are turned off', () => {
    const words = (() => {
      using app = mount(<HymnPage hymn={hymn(100)} reader={readerOn()} />);
      return sectionTexts(app.host);
    })();
    using app = mount(withKey(100, readerOn(chordsOn())));
    const { host } = app;
    expect(keyButton(host)).toEqual(Option.some({ value: 'Db', head: true }));
    hold(host);
    expect(keyButton(host)).toEqual(Option.some({ value: 'Chords off', head: true }));
    expect(host.querySelector('[data-testid^="chord-"]')).toBeNull();
    expect(textOf(host.innerHTML)).not.toContain('Transpose');
    expect(sectionTexts(host)).toEqual(words);
  });

  it('shows each hymn with no chords as its words and a notice, with no key control', () => {
    const chordless = [
      126, 181, 212, 220, 225, 262, 292, 305, 403, 453, 481, 580, 663, 664, 687, 693,
    ];
    for (const n of chordless) {
      const words = (() => {
        using app = mount(<HymnPage hymn={hymn(n)} reader={readerOn()} />);
        return sectionTexts(app.host);
      })();
      using app = mount(<HymnPage hymn={hymn(n)} reader={readerOn(chordsOn())} />);
      const text = textOf(app.host.innerHTML);
      expect({ n, notice: text.includes('No chords for this hymn yet.') }).toEqual({
        n,
        notice: true,
      });
      expect({ n, keys: text.includes('Transpose') }).toEqual({ n, keys: false });
      expect({ n, words: sectionTexts(app.host) }).toEqual({ n, words });
    }
  });
});

/** The page head's `Favourite` button: a button in the number's row, and whether it is selected. */
const favouriteButton = (host: HTMLElement) =>
  Option.map(
    Option.fromNullishOr(host.querySelector('[data-testid="hymn-name"] [aria-label="Favourite"]')),
    (button) => ({
      role: button.getAttribute('role'),
      selected: button.getAttribute('aria-selected'),
    }),
  );

describe('the page head’s Favourite button', () => {
  it('sits in the number’s row; a press keeps the hymn under lists.favourites, a second press takes it out', () => {
    const device = new Map<string, string>();
    using app = mount(<HymnPage hymn={hymn(3)} reader={readerOn(device)} />);
    expect(favouriteButton(app.host)).toEqual(Option.some({ role: 'button', selected: 'false' }));
    press(app.host, 'Favourite');
    expect(favouriteButton(app.host)).toEqual(Option.some({ role: 'button', selected: 'true' }));
    expect(device.get('lists.favourites')).toBe('[3]');
    press(app.host, 'Favourite');
    expect(favouriteButton(app.host)).toEqual(Option.some({ role: 'button', selected: 'false' }));
    expect(device.get('lists.favourites')).toBe('[]');
  });

  it('keeps Favourites in number order, and shows a favourite selected when the app is opened again', () => {
    const device = new Map<string, string>();
    {
      using app = mount(<HymnPage hymn={hymn(30)} reader={readerOn(device)} />);
      press(app.host, 'Favourite');
    }
    {
      using app = mount(<HymnPage hymn={hymn(3)} reader={readerOn(device)} />);
      press(app.host, 'Favourite');
    }
    expect(device.get('lists.favourites')).toBe('[3,30]');
    using app = mount(<HymnPage hymn={hymn(30)} reader={readerOn(device)} />);
    expect(favouriteButton(app.host)).toEqual(Option.some({ role: 'button', selected: 'true' }));
  });
});

/** Two buttons that set the chord style, as the Settings sheet does. */
function StylePicker({ style }: { readonly style: Atom.Writable<ChordStyle> }) {
  const set = useAtomSet(style);
  return (
    <>
      <Pressable aria-label="Pick Simple" onPress={() => set('simple')} />
      <Pressable aria-label="Pick Advanced" onPress={() => set('advanced')} />
    </>
  );
}

/** Hymn 3's first line's chords over its 1st and 5th syllables, and whether its 6th has any. */
const lineOne = (host: HTMLElement) => ({
  first: chordAt(host, 'chord-1-1-1'),
  fifth: chordAt(host, 'chord-1-1-5'),
  sixth: chordAt(host, 'chord-1-1-6'),
});

const hasControl = (host: HTMLElement, label: string) =>
  Option.isSome(Option.fromNullishOr(host.querySelector(`[aria-label="${label}"]`)));

describe('the chord style', () => {
  it('shows Simple chords at first: one plain chord where the harmony changes, none over a sus’s resolution', () => {
    using app = mount(<HymnPage hymn={hymn(3)} reader={readerOn(chordsOn())} />);
    expect(lineOne(app.host)).toEqual({
      first: Option.some('G'),
      fifth: Option.some('D'),
      sixth: Option.none(),
    });
  });

  it('shows every chord as compiled once the reader picks Advanced', () => {
    const device = new Map([...chordsOn(), ['chords.style', '"advanced"']]);
    using app = mount(<HymnPage hymn={hymn(3)} reader={readerOn(device)} />);
    expect(lineOne(app.host)).toEqual({
      first: Option.some('G'),
      fifth: Option.some('Dsus4 Dsus2'),
      sixth: Option.some('D'),
    });
  });

  it('draws the open page again when the style changes, keeping its move', () => {
    const reader = readerOn(chordsOn());
    using app = mount(
      <>
        <StylePicker style={reader.style} />
        {withKey(3, reader)}
      </>,
    );
    const { host } = app;
    press(host, 'Key');
    turn(host, 'Key');
    expect(valueOf(host, 'Key')).toBe('Ab');
    expect(lineOne(host)).toEqual({
      first: Option.some('Ab'),
      fifth: Option.some('Eb'),
      sixth: Option.none(),
    });
    press(host, 'Pick Advanced');
    expect(valueOf(host, 'Key')).toBe('Ab');
    expect(lineOne(host)).toEqual({
      first: Option.some('Ab'),
      fifth: Option.some('Ebsus4 Ebsus2'),
      sixth: Option.some('Eb'),
    });
    press(host, 'Pick Simple');
    expect(lineOne(host)).toEqual({
      first: Option.some('Ab'),
      fifth: Option.some('Eb'),
      sixth: Option.none(),
    });
    expect(reader.book.decodes()).toBe(1);
  });

  for (const style of ['simple', 'advanced'] as const) {
    it(`keeps the key dials in ${style}: the key and the capo move the chords shown`, () => {
      const device = new Map([['chords.style', `"${style}"`]]);
      using app = mount(withKey(3, readerOn(device)));
      const { host } = app;
      hold(host);
      press(host, 'Key');
      expect(['Key', 'Capo'].filter((label) => !hasControl(host, label))).toEqual([]);
      expect(valueOf(host, 'Key')).toBe('G');
      expect(valueOf(host, 'Capo')).toBe('No capo');
      turn(host, 'Key');
      turn(host, 'Capo');
      expect(valueOf(host, 'Capo')).toBe('Capo 1, G shapes');
      const fifth = { simple: 'D', advanced: 'Dsus4 Dsus2' }[style];
      expect({
        style,
        first: chordAt(host, 'chord-1-1-1'),
        fifth: chordAt(host, 'chord-1-1-5'),
      }).toEqual({
        style,
        first: Option.some('G'),
        fifth: Option.some(fifth),
      });
    });
  }
});
