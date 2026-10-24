/**
 * A tap on a chord, as a reader taps it: hymn 373 with chords on, Simple,
 * the capo at 1. The tap opens the sheet of how to play the chord the page
 * shows, read as its name, each string and the capo, its dots carrying their
 * fingers; Advanced shows the Advanced chord. The tap is no hand scroll: the
 * page does not move and the follow hears nothing. The chord's target is 44
 * points tall by its hit slop alone, so its row keeps its height.
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

import { readerOn } from '../test/reader';
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

describe('a tap on a chord', () => {
  it('opens how to play the chord the page shows, under capo 1, by name, string and finger', () => {
    const reader = readerOn(new Map([['chords', 'true']]));
    using app = mount(
      <>
        <StylePicker style={reader.style} />
        <HymnPage hymn={Option.getOrThrow(hymnAt('373'))} reader={reader} />
      </>,
    );
    press('[aria-label="Capo up"]');
    expect(app.host.textContent).toContain('Capo 1');
    const scroll = Option.getOrThrow(find('[data-testid="hymn-scroll"]'));
    const heard: Array<string> = [];
    for (const kind of ['wheel', 'touchmove', 'touchstart', 'scroll'])
      scroll.addEventListener(kind, () => heard.push(kind));
    const before = scroll.scrollTop;

    const simple = firstChord(app.host);
    expect(find('[data-testid="chord-sheet"]')).toEqual(Option.none());
    press(`[data-testid="${simple.id}"]`);
    expect(Option.isSome(find('[data-testid="chord-sheet"]'))).toBe(true);
    const shown = boxes();
    // The sounding A-flat under capo 1 is played in G: the stanza's first chord, I, is a G.
    expect(simple).toEqual({ id: 'chord-1-1-1', text: 'G' });
    expect(shown.map((box) => box.label)).toEqual([
      'G. low E fret 3, finger 2; A fret 2, finger 1; D open; G open; B open; high E fret 3, finger 3. capo 1',
    ]);
    expect(namesShown()).toBe(simple.text);
    for (const box of shown) {
      for (const string of STRINGS)
        expect(box.label).toMatch(
          new RegExp(`(^|; |\\. )${string} (muted|open|fret \\d+, finger [1-4])`),
        );
      expect(box.label).toEndWith('capo 1');
      expect(box.fingers.length).toBeGreaterThan(0);
      for (const finger of box.fingers) expect(['1', '2', '3', '4']).toContain(finger);
    }
    expect(heard).toEqual([]);
    expect(scroll.scrollTop).toBe(before);

    press('[aria-label="Done"]');
    expect(find('[data-testid="chord-sheet"]')).toEqual(Option.none());

    // 373's Advanced chords are its Simple ones; the sheet shows Advanced's all the same.
    press('[aria-label="Pick Advanced"]');
    const advanced = firstChord(app.host);
    press(`[data-testid="${advanced.id}"]`);
    expect(namesShown()).toBe(advanced.text);
    expect(heard).toEqual([]);
    expect(scroll.scrollTop).toBe(before);
  });

  it('shows each Advanced chord a place shows where Simple shows fewer (hymn 3, Dsus4 Dsus2)', () => {
    const reader = readerOn(new Map([['chords', 'true']]));
    using app = mount(
      <>
        <StylePicker style={reader.style} />
        <HymnPage hymn={Option.getOrThrow(hymnAt('3'))} reader={reader} />
      </>,
    );
    press('[data-testid="chord-1-1-5"]');
    expect(namesShown()).toBe('D');
    press('[aria-label="Done"]');
    press('[aria-label="Pick Advanced"]');
    press('[data-testid="chord-1-1-5"]');
    expect(namesShown()).toBe('Dsus4 Dsus2');
    expect(app.host.textContent).toContain('Dsus4 Dsus2');
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
