/**
 * A tap on a chord, as a reader taps it: chords on, Simple, the hymn under
 * a capo. The tap pushes the chord route, a native form sheet with a
 * grabber, and the route draws how to play the chord the page shows: read
 * as its name and each string, its dots carrying their fingers, its neck in
 * the sheet's middle, and no capo, so the same played chord draws the same
 * sheet at every capo. Advanced shows the Advanced chord. The tap is no hand
 * scroll: the page does not move and the follow hears nothing. The chord's
 * target is 44 points tall by its hit slop alone, so its row keeps its
 * height.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider, useAtomSet } from '@effect/atom-react';
import { Option } from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pressable } from 'react-native';

import { hymnAt } from '~/hymns/hymns';
import type { ChordStyle } from '~/hymns/simple';

import { params, routed } from '../test/one';
import { readerOn } from '../test/reader';
import { ChordScreen, chordSheetOptions } from './ChordSheet';
import { chordSlop, TAP_TARGET } from './Chords';
import { HymnPage } from './HymnPage';
import { pageTextOf } from './pageText';
import { readingStyle, SIZES, type Size } from './reading';

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

const find = (selector: string) =>
  Option.fromNullishOr(document.querySelector<HTMLElement>(selector));

const press = (selector: string) =>
  act(() => {
    Option.getOrThrow(find(selector)).click();
  });

function StylePicker({ style }: { readonly style: Atom.Writable<ChordStyle> }) {
  const set = useAtomSet(style);
  return <Pressable aria-label="Pick Advanced" onPress={() => set('advanced')} />;
}

/** The router as a test starts it: no step taken, no params. */
const freshRouter = () => {
  routed.splice(0);
  for (const key of Object.keys(params)) delete params[key];
};

const STRINGS = ['low E', 'A', 'D', 'G', 'B', 'high E'];

/** Each chord box the sheet shows: its label and the numbers its dots and barre carry. */
const boxes = () =>
  [...document.querySelectorAll<HTMLElement>('[data-testid^="chord-box-"][role="img"]')].map(
    (box) => ({
      label: box.getAttribute('aria-label') ?? '',
      fingers: [
        ...box.querySelectorAll<HTMLElement>('[data-testid*="-dot-"], [data-testid$="-barre"]'),
      ].map((dot) => dot.textContent),
    }),
  );

/** The chords the open sheet names, in order, as their boxes are read. */
const namesShown = () =>
  boxes()
    .map((box) => box.label.split('.')[0])
    .join(' ');

/** The first chord on the page a reader can tap, by its id and its text. */
const firstChord = (host: HTMLElement) => {
  const chord = Option.getOrThrow(
    Option.fromNullishOr(host.querySelector<HTMLElement>('[data-testid^="chord-"][role="button"]')),
  );
  return { id: chord.dataset['testid'] ?? '', text: chord.textContent };
};

/** The chord routes the page pushed, oldest first. */
const pushed = () =>
  routed.flatMap((step) => (step.startsWith('push /chord?') && [step.slice('push '.length)]) || []);

/** The chord route at `href`, drawn as the router draws it: its query as the route's params. */
const sheetAt = (href: string) => {
  for (const key of Object.keys(params)) delete params[key];
  for (const [key, value] of new URLSearchParams(href.slice(href.indexOf('?') + 1)))
    params[key] = value;
  return mount(<ChordScreen />);
};

/** A reader with chords on and hymn `n` moved: the sounding key turned and the capo set, as the dials keep them. */
const moved = (n: number, transpose: number, capo: number) =>
  readerOn(
    new Map([
      ['chords', 'true'],
      [`move.${n}`, `{"transpose":${transpose},"capo":${capo}}`],
    ]),
  );

/** Every word the sheet shows or a screen reader reads in it. */
const sheetWords = () => {
  const sheet = Option.getOrThrow(find('[data-testid="chord-sheet"]'));
  return [
    sheet.textContent,
    ...[...sheet.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label')),
  ].join(' ');
};

/** A pixel length read from a computed style. */
const px = (length: string) => Number.parseFloat(length) || 0;

/** The page's first chord tapped on hymn 3 at `transpose` and `capo`: the route it pushed. */
const tapHymn3 = (transpose: number, capo: number) => {
  freshRouter();
  using app = mount(
    <HymnPage hymn={Option.getOrThrow(hymnAt('3'))} reader={moved(3, transpose, capo)} />,
  );
  const chord = firstChord(app.host);
  press(`[data-testid="${chord.id}"]`);
  return { chord, href: pushed().at(-1) ?? '' };
};

describe('a tap on a chord', () => {
  it('pushes the chord sheet, a form sheet with a grabber, drawing the chord the page shows and no capo (hymn 3, capo 1)', () => {
    freshRouter();
    using app = mount(<HymnPage hymn={Option.getOrThrow(hymnAt('3'))} reader={moved(3, 1, 1)} />);
    const scroll = Option.getOrThrow(find('[data-testid="hymn-scroll"]'));
    const heard: Array<string> = [];
    for (const kind of ['wheel', 'touchmove', 'touchstart', 'scroll'])
      scroll.addEventListener(kind, () => heard.push(kind));
    const before = scroll.scrollTop;

    const simple = firstChord(app.host);
    // The sounding A-flat under capo 1 is played in G: the stanza's first chord, I, is a G.
    expect(simple).toEqual({ id: 'chord-1-1-1', text: 'G' });
    press(`[data-testid="${simple.id}"]`);
    expect(pushed().length).toBe(1);
    // The sheet is a route the stack presents, not a modal drawn over the page.
    expect(Option.isSome(find('[aria-modal]'))).toBe(false);
    expect(chordSheetOptions.presentation).toBe('formSheet');
    expect(chordSheetOptions.sheetGrabberVisible).toBe(true);
    expect(heard).toEqual([]);
    expect(scroll.scrollTop).toBe(before);

    using _sheet = sheetAt(pushed()[0] ?? '');
    const shown = boxes();
    expect(shown.map((box) => box.label)).toEqual([
      'G. low E fret 3, finger 2; A fret 2, finger 1; D open; G open; B open; high E fret 3, finger 3',
    ]);
    expect(namesShown()).toBe(simple.text);
    for (const box of shown) {
      for (const string of STRINGS)
        expect(box.label).toMatch(
          new RegExp(`(^|; |\\. )${string} (muted|open|fret \\d+, finger [1-4])`),
        );
      expect(box.fingers.length).toBeGreaterThan(0);
      for (const finger of box.fingers) expect(['1', '2', '3', '4']).toContain(finger);
    }
    expect(/capo/i.test(sheetWords())).toBe(false);

    press('[aria-label="Done"]');
    expect(routed.at(-1)).toBe('back');
  });

  it('draws the neck in the middle of its box, and the box in the middle of the sheet', () => {
    using _sheet = sheetAt(tapHymn3(1, 1).href);
    const box = Option.getOrThrow(find('[data-testid="chord-box-0"]'));
    const strings = [
      ...Option.getOrThrow(Option.fromNullishOr(box.firstElementChild)).children,
    ].slice(0, 6);
    const middleOf = (string: Element) => {
      const style = getComputedStyle(string);
      return px(style.left) + px(style.width) / 2;
    };
    const [low, high] = [middleOf(strings[0] ?? box), middleOf(strings[5] ?? box)];
    // Five gaps of 22 points lie between the low E and the high E.
    expect(high - low).toBe(110);
    const neck = (low + high) / 2;
    expect(Math.abs(neck - px(getComputedStyle(box).width) / 2)).toBeLessThanOrEqual(1);
    const row = Option.getOrThrow(find('[data-testid="chord-boxes"]'));
    expect(getComputedStyle(row).justifyContent).toBe('center');
    expect(
      getComputedStyle(Option.getOrThrow(Option.fromNullishOr(box.parentElement))).alignItems,
    ).toBe('center');
  });

  it('draws the same sheet for the same played chord at capo 0 and at capo 3', () => {
    const open = tapHymn3(0, 0);
    const third = tapHymn3(3, 3);
    expect([open.chord.text, third.chord.text]).toEqual(['G', 'G']);
    expect(third.href).toBe(open.href);
    const drawn = (href: string) => {
      using _sheet = sheetAt(href);
      return {
        labels: boxes().map((box) => box.label),
        tree: Option.getOrThrow(find('[data-testid="chord-sheet"]')).outerHTML,
      };
    };
    expect(drawn(third.href)).toEqual(drawn(open.href));
  });

  it('says it names no chord when its route names none', () => {
    freshRouter();
    params['chords'] = 'not chords';
    using sheet = mount(<ChordScreen />);
    expect(sheet.host.textContent).toContain('No chord');
    expect(boxes()).toEqual([]);
  });

  it('shows each Advanced chord a place shows where Simple shows fewer (hymn 3, Dsus4 Dsus2)', () => {
    freshRouter();
    const reader = readerOn(new Map([['chords', 'true']]));
    using app = mount(
      <>
        <StylePicker style={reader.style} />
        <HymnPage hymn={Option.getOrThrow(hymnAt('3'))} reader={reader} />
      </>,
    );
    press('[data-testid="chord-1-1-5"]');
    {
      using _sheet = sheetAt(pushed().at(-1) ?? '');
      expect(namesShown()).toBe('D');
    }
    press('[aria-label="Pick Advanced"]');
    press('[data-testid="chord-1-1-5"]');
    {
      using _sheet = sheetAt(pushed().at(-1) ?? '');
      expect(namesShown()).toBe('Dsus4 Dsus2');
    }
    expect(app.host.textContent).toContain('Dsus4 Dsus2');
  });

  it('shows the chord held over a moved line’s first syllable, muted, under capo 1, Simple and Advanced (hymn 373’s refrain)', () => {
    const reader = moved(373, 0, 1);
    using _app = mount(
      <>
        <StylePicker style={reader.style} />
        <HymnPage hymn={Option.getOrThrow(hymnAt('373'))} reader={reader} />
      </>,
    );
    const held = () => {
      const chord = Option.getOrThrow(find('[data-testid="held-2-1-1"]'));
      return {
        text: chord.textContent,
        label: chord.getAttribute('aria-label'),
        muted: (
          chord.querySelector<HTMLElement>('div, span')?.getAttribute('style') ?? ''
        ).includes('var(--muted)'),
        own: Option.isSome(find('[data-testid="chord-2-1-1"]')),
      };
    };
    // R1 moves the refrain's first change to its third syllable: the stanza's last chord, I, is held there.
    expect(held()).toEqual({ text: 'G', label: 'G, held over', muted: true, own: false });
    press('[aria-label="Pick Advanced"]');
    expect(held()).toEqual({ text: 'G', label: 'G, held over', muted: true, own: false });
  });

  it('reads the chord as a button named by its symbol alone, as the page shows it', () => {
    using app = mount(
      <HymnPage
        hymn={Option.getOrThrow(hymnAt('373'))}
        reader={readerOn(new Map([['chords', 'true']]))}
      />,
    );
    const chord = Option.getOrThrow(
      Option.fromNullishOr(
        app.host.querySelector<HTMLElement>('[data-testid^="chord-"][role="button"]'),
      ),
    );
    expect(chord.getAttribute('aria-label')).toBe(chord.textContent);
  });
});

describe('the chord’s tap target', () => {
  it('is 44 points tall at every reading size and system text size, by its hit slop', () => {
    const short = SIZES.flatMap((_, size) =>
      [0.8, 1, 1.5, 2, 3].flatMap((fontScale) => {
        const text = pageTextOf(
          readingStyle({ size: size as Size, font: 'system', spacing: 'normal' }, fontScale),
        );
        const line = text.chords.lineHeight ?? 0;
        const slop = chordSlop(line);
        return (line + slop.top + slop.bottom < TAP_TARGET && [{ size, fontScale, line }]) || [];
      }),
    );
    expect(short).toEqual([]);
  });

  it('takes a press in its slop under the chord, over the syllable: the syllable takes no touch', () => {
    freshRouter();
    using app = mount(<HymnPage hymn={Option.getOrThrow(hymnAt('3'))} reader={moved(3, 0, 0)} />);
    const chord = firstChord(app.host);
    expect(chord.id).toBe('chord-1-1-1');
    const syllable = Option.getOrThrow(find('[data-testid="syllable-1-1-1"]'));
    // The syllable's box holds the chord over its syllable; nothing between the box and the syllable takes a touch.
    const box = Option.getOrThrow(
      Option.fromNullishOr(
        app.host.querySelector<HTMLElement>(`[data-testid="${chord.id}"]`)?.parentElement,
      ),
    );
    expect(box.contains(syllable)).toBe(true);
    const between = [] as Array<HTMLElement>;
    for (let at = syllable; at !== box; at = at.parentElement ?? box) between.push(at);
    expect(between.some((element) => getComputedStyle(element).pointerEvents === 'none')).toBe(
      true,
    );
    // The chord's target reaches 12 points under its 20-point row at the default size: a press there, over
    // the syllable, lands on the chord and opens its sheet.
    expect(chordSlop(20).bottom).toBe(12);
    press(`[data-testid="${chord.id}"]`);
    expect(pushed()).toHaveLength(1);
  });

  it('adds no padding or margin to the chord’s row: the button draws as a bare one', () => {
    const bare = renderToStaticMarkup(<Pressable testID="x" />);
    const classOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1] ?? '';
    using app = mount(
      <HymnPage
        hymn={Option.getOrThrow(hymnAt('373'))}
        reader={readerOn(new Map([['chords', 'true']]))}
      />,
    );
    const chord = Option.getOrThrow(
      Option.fromNullishOr(
        app.host.querySelector<HTMLElement>('[data-testid^="chord-"][role="button"]'),
      ),
    );
    expect(chord.getAttribute('class')).toBe(classOf(bare));
    expect(chord.hasAttribute('style')).toBe(false);
  });
});
