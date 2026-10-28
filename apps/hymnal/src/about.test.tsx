/* oxlint-disable effect/noNodeBuiltinImport -- the folder test reads the meaning table's LICENSE and NOTICE text files from disk, synchronously; the app never reads them. */
/**
 * Settings as its route renders it: the About section credits the
 * instruments the recordings are played on, as their licences ask, and
 * gives the notice the Gemma Terms of Use ask of the meaning table, and a
 * copy of the Terms themselves, shipped beside the table and shown on a
 * press.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import Settings from '../app/(hymnal)/settings';
import { gemmaTerms } from '../assets/meaning/gemma-terms.js';
import { About } from './about';

const folder = new URL('../assets/meaning/', import.meta.url);

describe('Settings', () => {
  // One render serves the first two checks.
  const html = renderToStaticMarkup(<Settings />);

  it('credits the piano and the strings under About', () => {
    expect(html).toContain('About');
    for (const words of [
      'Salamander Grand Piano',
      'Alexander Holm',
      'CC BY 3.0',
      'VS Chamber Orchestra 2',
      'Versilian Studios',
      'CC0',
    ])
      expect(html).toContain(words);
  });

  it('gives the notice the Gemma Terms of Use ask of the meaning table', () => {
    for (const words of [
      'EmbeddingGemma',
      'modified',
      'Gemma is provided under and subject to the Gemma Terms of Use found at',
      'ai.google.dev/gemma/terms',
      'Gemma Prohibited Use Policy',
    ])
      expect(html).toContain(words);
  });

  it('shows the Gemma Terms of Use, word for word, on a press, and hides them on another', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<About />));
    const shown = () =>
      [...host.querySelectorAll('[data-testid="gemma-terms-text"]')].map(
        (node) => node.textContent,
      );
    const press = () =>
      act(
        () =>
          void host
            .querySelector('[data-testid="gemma-terms"]')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })),
      );
    const before = shown();
    press();
    const open = shown();
    press();
    const after = shown();
    act(() => root.unmount());
    host.remove();
    expect({ before, open, after }).toEqual({ before: [], open: [gemmaTerms], after: [] });
  });
});

describe('the meaning table’s folder', () => {
  it('holds the Gemma Terms of Use, as Google publishes them', () => {
    for (const words of [
      'Last modified: April 1, 2026',
      '"Agreement" or "Gemma Terms of Use" means',
      '3.1 Distribution and Redistribution',
      'You must provide all third party recipients of Gemma or Model Derivatives a copy of this Agreement.',
      '3.2 Use Restrictions',
      'https://ai.google.dev/gemma/prohibited_use_policy',
      '4.9 No Waiver',
      'EmbeddingGemma',
    ])
      expect(gemmaTerms).toContain(words);
  });

  it('says it is under the Gemma Terms, not the repository’s MIT, with their use restrictions as a condition', () => {
    const licence = readFileSync(new URL('LICENSE', folder), 'utf8');
    for (const words of [
      'not under the licence of the rest of this repository (MIT)',
      'under the Gemma Terms of Use',
      'gemma-terms.js',
      'As a condition of any use, reproduction or distribution of meaning.js',
      'https://ai.google.dev/gemma/prohibited_use_policy',
      'in violation of applicable laws and regulations',
    ])
      expect(licence).toContain(words);
    expect(readFileSync(new URL('NOTICE', folder), 'utf8')).toContain(
      'Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms',
    );
  });
});
