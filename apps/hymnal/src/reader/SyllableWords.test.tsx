import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';
import { Text } from 'react-native';

import type { Box, Word } from '~/hymns/chords';

import { SyllableLine } from './SyllableWords';

/**
 * iOS's paragraph uses its explicit label, else the complete attributed
 * string: even an aria-hidden inline span contributes its characters.
 * The web stand-in exposes both inputs; this is not the DOM accessible name.
 */
const paragraphLabel = (paragraph: Element): string =>
  paragraph.getAttribute('aria-label') ?? paragraph.textContent ?? '';

const bare = (text: string): Box => ({ text, chords: [] });
const chorded = (text: string): Box => ({ text, chords: [{ root: 0, quality: '' }] });

describe('boxed syllable paragraph labels', () => {
  for (const example of [
    {
      name: 'reads an internal join as syllable text without its visual hyphen',
      word: [chorded('zo'), bare('na'), bare('vi')],
      visible: 'na-vi',
      spoken: ['Chord 1-1-1', 'zo', 'navi'],
    },
    {
      name: 'reads a trailing separator before a chorded box without its visual hyphen',
      word: [chorded('zo'), bare('na'), chorded('ku')],
      visible: 'na-',
      spoken: ['Chord 1-1-1', 'zo', 'na', 'Chord 1-1-3', 'ku'],
    },
  ] satisfies ReadonlyArray<{
    readonly name: string;
    readonly word: Word;
    readonly visible: string;
    readonly spoken: readonly [string, string, string, ...Array<string>];
  }>) {
    it(example.name, () => {
      const host = document.createElement('div');
      host.innerHTML = renderToStaticMarkup(
        <SyllableLine
          words={[example.word]}
          label="Synthetic line"
          at="1-1"
          index={1}
          style={{}}
          over={Option.some((box: Box, place: string) => {
            if (box.chords.length === 0) return <></>;
            return (
              <Text accessible role="button" aria-label={`Chord ${place}`}>
                C
              </Text>
            );
          })}
        />,
      );
      const line = host.querySelector('[data-testid="line"]');
      expect(line?.hasAttribute('aria-label')).toBe(false);
      const paragraph = Option.getOrThrow(
        Option.fromNullishOr(host.querySelector('[data-testid="syllable-1-1-2"]')),
      );
      expect(paragraph.textContent).toBe(example.visible);
      expect(paragraphLabel(paragraph)).toBe(example.spoken[2]);

      // Chords remain separate, between the runs they precede, rather than
      // disappearing into a label on the containing line or word.
      const reading = [...host.querySelectorAll('[role="button"], [data-testid^="syllable-"]')]
        .filter((node) => !node.parentElement?.closest('[data-testid^="syllable-"]'))
        .map(paragraphLabel);
      expect(reading).toEqual(example.spoken);
    });
  }
});
