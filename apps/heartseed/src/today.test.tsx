/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test mounts the route in happy-dom's document, and reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * Today as its route renders it: the header, the reference and the KJV
 * text of the passage the bundler derives (`virtual:heartseed-passage`,
 * here the same derivation through the test preload). The app holds neither
 * the reference nor the words itself: they reach it from the corpus.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import Today from '../app/index';

const REFERENCE = 'Isaiah 41:10';
const WORDS =
  'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.';

describe('Today', () => {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => createRoot(host).render(<Today />));

  it('shows the header Today', () => {
    const headings = [...host.querySelectorAll('[role="heading"]')].map((node) => node.textContent);
    expect(headings).toEqual(['Today']);
  });

  it('shows Isaiah 41:10 and its KJV text, word for word', () => {
    expect(host.querySelector('[data-testid="reference"]')?.textContent).toBe(REFERENCE);
    expect(host.querySelector('[data-testid="passage"]')?.textContent).toBe(WORDS);
  });

  it('holds neither the reference nor the words in the app’s own sources', () => {
    const root = `${import.meta.dir}/..`;
    const files = [...new Bun.Glob('{src,app}/**/*.{ts,tsx,js,jsx,mjs}').scanSync(root)].filter(
      (file) => !/\.test\.[a-z]+$/u.test(file) && file !== 'app/routes.d.ts',
    );
    expect(files).toContain('app/index.tsx');
    const found = files.filter((file) => {
      const source = readFileSync(`${root}/${file}`, 'utf8');
      return [REFERENCE, 'Isaiah', 'Fear thou not', 'righteousness'].some((words) =>
        source.includes(words),
      );
    });
    expect(found).toEqual([]);
  });
});
