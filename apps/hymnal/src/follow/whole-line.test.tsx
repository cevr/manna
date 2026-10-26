import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';

import { HangingLine } from '~/reader/HangingLine';
import { SyllableLine } from '~/reader/SyllableWords';

import { FollowProvider } from './follow';
import { marksOf, WHOLE } from './marks';

const syllables = (
  <SyllableLine
    words={[
      [
        { text: 'zo', chords: [] },
        { text: 'na', chords: [] },
      ],
      [{ text: 'vi', chords: [] }],
    ]}
    label="zona vi"
    at="1-1"
    index={0}
    style={{}}
    over={Option.none()}
  />
);

describe('visible whole-line follow', () => {
  for (const [name, line, selector] of [
    ['syllables without times', syllables, '[data-testid^="syllable-"]'],
    [
      'plain words',
      <HangingLine line="zona vi" index={0} style={{}} />,
      '[data-testid="line"] > *',
    ],
  ] as const)
    it(`highlights ${name} without inventing a sung syllable`, () => {
      const marks = marksOf();
      marks.set(0, WHOLE);
      const host = document.createElement('div');
      host.innerHTML = renderToStaticMarkup(
        <FollowProvider value={{ marks, keep: () => () => {}, intro: Option.none() }}>
          {line}
        </FollowProvider>,
      );
      expect(host.querySelector('[data-testid="line"]')?.getAttribute('aria-selected')).toBe(
        'true',
      );
      const words = [...host.querySelectorAll<HTMLElement>(selector)];
      expect(words.length).toBeGreaterThan(0);
      expect(words.map((word) => [word.style.color, word.style.backgroundColor])).toEqual(
        words.map(() => ['var(--accent)', 'var(--soft)']),
      );
    });

  it('keeps a timed syllable as a colour change with no whole-line tint', () => {
    const marks = marksOf();
    marks.set(0, 1);
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <FollowProvider value={{ marks, keep: () => () => {}, intro: Option.none() }}>
        {syllables}
      </FollowProvider>,
    );
    const words = [...host.querySelectorAll<HTMLElement>('[data-testid^="syllable-"]')];
    expect(words.map((word) => word.style.color)).toEqual([
      'var(--muted)',
      'var(--accent)',
      'var(--muted)',
    ]);
    expect(words.map((word) => word.style.backgroundColor)).toEqual(['', '', '']);
  });

  it('keeps a timed rest muted without a whole-line highlight', () => {
    const marks = marksOf();
    marks.set(0, -1);
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <FollowProvider value={{ marks, keep: () => () => {}, intro: Option.none() }}>
        {syllables}
      </FollowProvider>,
    );
    const words = [...host.querySelectorAll<HTMLElement>('[data-testid^="syllable-"]')];
    expect(words.map((word) => word.style.color)).toEqual([
      'var(--muted)',
      'var(--muted)',
      'var(--muted)',
    ]);
    expect(words.map((word) => word.style.backgroundColor)).toEqual(['', '', '']);
  });
});
