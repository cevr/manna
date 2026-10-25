/**
 * The reading settings as a reader meets them: in the player sheet (no
 * button in the hymn page's header), the page set as they say, the screen kept on while a page is shown, and each printed line
 * hanging under its first word when it wraps.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { hymnAt } from '~/hymns/hymns';

import { awake, params } from '../test/one';
import { readerOn } from '../test/reader';
import { StackHeader } from '../test/stack';
import { HymnPage } from './HymnPage';
import { HymnScreen } from './HymnScreen';
import { ReadingControls } from './ReadingSheet';
import { perform } from '../test/props';
import { DEFAULT_SIZE, pointsAt, SIZES } from './reading';

const hymn = (n: number) => Option.getOrThrow(hymnAt(String(n)));

/** `node` mounted in the document; it unmounts when the `using` ends. */
const mount = (node: ReactNode) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<RegistryProvider>{node}</RegistryProvider>));
  const find = (selector: string) =>
    Option.fromNullishOr(host.querySelector<HTMLElement>(selector));
  const get = (selector: string) => Option.getOrThrow(find(selector));
  return {
    host,
    find,
    get,
    press: (label: string) => act(() => get(`[aria-label="${label}"]`).click()),
    unmount: () => act(() => root.unmount()),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const checked = (app: ReturnType<typeof mount>, group: string) =>
  [...app.get(`[role="radiogroup"][aria-label="${group}"]`).querySelectorAll('[role="radio"]')]
    .filter((radio) => radio.getAttribute('aria-checked') === 'true')
    .map((radio) => radio.getAttribute('aria-label'));

/** The text-size dial, and its value as VoiceOver reads it. */
const sizeDial = (app: ReturnType<typeof mount>) =>
  app.get('[role="slider"][aria-label="Text size"]');
const share = (app: ReturnType<typeof mount>) => sizeDial(app).getAttribute('aria-valuetext');
/** The text-size dial turned one step, as VoiceOver turns it. */
const step = (app: ReturnType<typeof mount>, way: 'increment' | 'decrement') =>
  perform(sizeDial(app), way);

describe('the hymn page’s header', () => {
  it('holds no Aa button: the reading settings are in the player sheet', () => {
    params['number'] = '3';
    using app = mount(
      <>
        <StackHeader />
        <HymnScreen />
      </>,
    );
    const header = app.get('[data-testid="header"]');
    expect(header.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(app.find('[aria-label="Aa"]')).toEqual(Option.none());
  });
});

describe('the reading settings', () => {
  it('turn the text size on a dial held to its ends, and show the size it is at', () => {
    using app = mount(<ReadingControls reading={readerOn().reading} />);
    expect(share(app)).toBe('100%');
    for (let k = DEFAULT_SIZE; k < SIZES.length + 1; k++) step(app, 'increment');
    expect(share(app)).toBe(`${Math.round((pointsAt(SIZES.length - 1) / 17) * 100)}%`);
    for (let k = SIZES.length + 1; k > 0; k--) step(app, 'decrement');
    expect(share(app)).toBe(`${Math.round((pointsAt(0) / 17) * 100)}%`);
  });

  it('writes each choice under its reading key, and a fresh launch reads them back', () => {
    const device = new Map<string, string>();
    {
      using app = mount(<ReadingControls reading={readerOn(device).reading} />);
      expect(checked(app, 'Font')).toEqual(['System']);
      expect(checked(app, 'Line spacing')).toEqual(['Normal']);
      const radios = (group: string) =>
        [
          ...app
            .get(`[role="radiogroup"][aria-label="${group}"]`)
            .querySelectorAll('[role="radio"]'),
        ].map((radio) => radio.getAttribute('aria-label'));
      expect(radios('Font')).toEqual(['System', 'Serif']);
      expect(radios('Line spacing')).toEqual(['Compact', 'Normal', 'Roomy']);
      step(app, 'increment');
      app.press('Serif');
      app.press('Roomy');
      act(() => app.get('[aria-label="Keep screen on"]').click());
      expect(Object.fromEntries(device)).toEqual({
        'reading.size': String(DEFAULT_SIZE + 1),
        'reading.font': '"serif"',
        'reading.spacing': '"roomy"',
        'reading.awake': 'true',
      });
    }
    using again = mount(<ReadingControls reading={readerOn(device).reading} />);
    expect(share(again)).toBe(`${Math.round((pointsAt(DEFAULT_SIZE + 1) / 17) * 100)}%`);
    expect(checked(again, 'Font')).toEqual(['Serif']);
    expect(checked(again, 'Line spacing')).toEqual(['Roomy']);
    expect((again.get('[aria-label="Keep screen on"]') as HTMLInputElement).checked).toBe(true);
  });
});

/** A text's size, line height and family as drawn. */
const drawn = (text: HTMLElement) => {
  const style = getComputedStyle(text);
  return { size: style.fontSize, height: style.lineHeight, family: style.fontFamily };
};

/** The words' style on a page of words alone, and the chords' on the page under chords, over `device`'s reading. */
const pageStyle = (reading: ReadonlyArray<readonly [string, string]>) => {
  using words = mount(<HymnPage hymn={hymn(3)} reader={readerOn(new Map(reading))} />);
  using chords = mount(
    <HymnPage hymn={hymn(3)} reader={readerOn(new Map([...reading, ['chords', 'true']]))} />,
  );
  return {
    words: drawn(words.get('[data-testid="line"] [data-testid^="syllable-"]')),
    // A chord with a chord to show is a button over its text; the text is what is drawn.
    chords: drawn(chords.get('[data-testid^="chord-"][role="button"] > *')),
  };
};

describe('a hymn page as the reading settings set it', () => {
  it('renders the default as the page has always been: words 17 on 24, chords 15 on 20, the system face', () => {
    const style = pageStyle([]);
    expect(style.words).toMatchObject({ size: '17px', height: '24px' });
    expect(style.chords).toMatchObject({ size: '15px', height: '20px' });
    expect(style.words.family).not.toContain('Georgia');
    expect(style.chords.family).not.toContain('Georgia');
  });

  it('sets the words and chord rows in the chosen size, face and spacing', () => {
    const style = pageStyle([
      ['reading.size', String(SIZES.length - 1)],
      ['reading.font', '"serif"'],
      ['reading.spacing', '"roomy"'],
    ]);
    expect(style.words).toMatchObject({
      size: '32px',
      height: `${Math.round((32 * 29) / 17)}px`,
    });
    expect(style.chords).toMatchObject({
      size: `${Math.round((15 * 32) / 17)}px`,
      height: `${Math.round((20 * 32) / 17)}px`,
    });
    expect(style.words.family).toContain('Georgia');
    expect(style.chords.family).toContain('Georgia');
  });
});

describe('keeping the screen on', () => {
  it('holds only while a hymn page is shown with the switch on, and lets go when either ends', () => {
    awake.clear();
    const reader = readerOn();
    const app = mount(
      <>
        <ReadingControls reading={reader.reading} />
        <HymnPage hymn={hymn(1)} reader={reader} />
      </>,
    );
    expect(awake.size).toBe(0);
    act(() => app.get('[aria-label="Keep screen on"]').click());
    expect(awake.size).toBe(1);
    act(() => app.get('[aria-label="Keep screen on"]').click());
    expect(awake.size).toBe(0);
    act(() => app.get('[aria-label="Keep screen on"]').click());
    expect(awake.size).toBe(1);
    app[Symbol.dispose]();
    expect(awake.size).toBe(0);
  });
});

/** Each printed line's indent: its container's left padding and its first item's pull back. */
const indents = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[data-testid="line"]')].map((line) => ({
    padding: getComputedStyle(line).paddingLeft,
    first: getComputedStyle(Option.getOrThrow(Option.fromNullishOr(line.firstElementChild)))
      .marginLeft,
  }));

describe('a printed line', () => {
  it('hangs under its first word, plain or under chords, by the indent at the reader’s size', () => {
    for (const [device, indent] of [
      [new Map<string, string>(), 21],
      [new Map([['chords', 'true']]), 21],
      [new Map([['reading.size', String(SIZES.length - 1)]]), 40],
    ] as const) {
      using app = mount(<HymnPage hymn={hymn(3)} reader={readerOn(new Map(device))} />);
      const lines = indents(app.host);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines)
        expect(line).toEqual({ padding: `${indent}px`, first: `-${indent}px` });
    }
  });

  it('stays one element that reads the whole line, drawn as its syllables', () => {
    using app = mount(<HymnPage hymn={hymn(3)} reader={readerOn()} />);
    const lines = [...app.host.querySelectorAll<HTMLElement>('[data-testid="line"]')];
    const sung = hymn(3).sections.flatMap((section) => section.lines);
    expect(lines.map((line) => line.getAttribute('aria-label'))).toEqual(sung);
    // The drawn text adds a hyphen between a word's syllables: without hyphens it is the line.
    const bare = (text: string) => text.replaceAll('-', '');
    expect(lines.map((line) => bare(line.textContent ?? '').replaceAll(' ', ' '))).toEqual(
      sung.map(bare),
    );
  });
});
