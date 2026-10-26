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

describe('line-level chord anchors', () => {
  for (const [style, first] of [
    ['simple', 'Cm'],
    ['advanced', 'Cm7'],
  ] as const)
    it(`keeps each ${style} chord at its compiled syllable, including a held chord`, () => {
      const move = Atom.make(still);
      const reader = {
        ...readerOn(),
        chords: Atom.make(true),
        style: Atom.make(style),
        move: () => move,
        book: chordBook([[1, '[1,"C",false,[["line",["zo~0m7|+na|vi~7","ku|la~0"]]],0]']]),
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
      const held = host.querySelector('[data-testid="held-1-2-1"]');
      expect(held?.getAttribute('aria-label')).toBe('G, held over');
      expect(held?.innerHTML).toContain('var(--muted)');
    });
});
