import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import * as Atom from 'effect/reactivity/Atom';
import { renderToStaticMarkup } from 'react-dom/server';

import { chordBook, still } from '~/hymns/chords';
import type { HymnText } from '~/hymns/text';
import { readerOn } from '~/test/reader';

import { HymnPage } from './HymnPage';

const hymn: HymnText = {
  number: 1,
  title: 'Synthetic',
  firstLine: 'zona vi',
  topic: 'Synthetic',
  sections: [{ kind: 'stanza', n: 1, lines: ['zona vi', 'ku la'] }],
};

describe('chord change anchors', () => {
  for (const level of ['line', 'syllable'] as const)
    for (const [style, first] of [
      ['simple', 'Cm'],
      ['advanced', 'Cm7'],
    ] as const)
      it(`keeps each ${level}, ${style} change at its syllable and leaves a chordless opening empty`, () => {
        const move = Atom.make(still);
        const reader = {
          ...readerOn(),
          chords: Atom.make(true),
          style: Atom.make(style),
          move: () => move,
          book: chordBook([[1, `[1,"C",false,[["${level}",["zo~0m7|+na|vi~7","ku|la~0"]]],0]`]]),
        };
        const host = document.createElement('div');
        host.innerHTML = renderToStaticMarkup(
          <RegistryProvider>
            <HymnPage hymn={hymn} reader={reader} />
          </RegistryProvider>,
        );
        const changes = [...host.querySelectorAll('[data-testid^="chord-"]')].map((node) => [
          node.getAttribute('data-testid'),
          node.getAttribute('aria-label'),
        ]);
        expect(changes).toEqual([
          ['chord-1-1-1', first],
          ['chord-1-1-3', 'G'],
          ['chord-1-2-2', 'C'],
        ]);
        expect(
          [...host.querySelectorAll('[data-testid^="chord-"]')].every((node) =>
            node.innerHTML.includes('var(--chord)'),
          ),
        ).toBe(true);
        expect(host.querySelector('[data-testid="syllable-1-2-1"]')).not.toBeNull();
        expect(host.querySelector('[data-testid="chord-1-2-1"]')).toBeNull();
        expect(host.querySelectorAll('[data-testid^="held-"]').length).toBe(0);
        expect(host.querySelectorAll('[aria-label$=", held over"]').length).toBe(0);
      });
});
