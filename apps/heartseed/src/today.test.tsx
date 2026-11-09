/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- the test mounts the route in happy-dom's document through React's promise-based `act`, hands each turn over until Today shows (at most 3 s), and reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * Today as its route renders it: the header, the reference and the KJV
 * text of the passage the bundler derives (`virtual:heartseed-passage`,
 * here the same derivation through the test preload). The app holds neither
 * the reference nor the words itself: they reach it from the corpus. The
 * device holds another verse's recall, so the launch opens Today, not the
 * first minute.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import Root from '../app/index';
import { device } from './test/one';

const REFERENCE = 'Isaiah 41:10';
const WORDS =
  'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.';

/** Another verse's recall, so the garden is not empty. */
const OTHER = {
  reference: 'Made 1:1',
  startedAt: Date.UTC(2026, 0, 5, 9),
  grade: 3,
  suggested: 3,
  words: 4,
  missed: 0,
  peeked: 0,
  extra: 0,
};

describe('Today', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const headings = () =>
    [...host.querySelectorAll('[role="heading"]')].map((node) => node.textContent);

  /** The launch, once its first heading shows (at most 3 s). */
  const shown = (async () => {
    device.launch([
      [`heartseed/recall/${OTHER.reference}/${OTHER.startedAt}`, JSON.stringify(OTHER)],
    ]);
    await act(async () => createRoot(host).render(<Root opening="today" />));
    const start = Date.now();
    while (headings().length === 0 && Date.now() - start < 3000)
      await act(() => new Promise((resolve) => setTimeout(resolve, 2)));
  })();

  it('shows the header Today', async () => {
    await shown;
    expect(headings()).toEqual(['Today']);
  });

  it('shows Isaiah 41:10 and its KJV text, word for word', async () => {
    await shown;
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
