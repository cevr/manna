/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- the test mounts the route in happy-dom's document through React's promise-based `act`, hands each turn over until Today shows (at most 3 s), and reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * Today as its route renders it: the header, the reference and the KJV
 * text of the passage the bundler derives (`virtual:heartseed-passage`,
 * here the same derivation through the test preload). The app holds neither
 * the reference nor the words itself: they reach it from the corpus. The
 * device holds another verse's recall, so the launch opens home, not the
 * first minute, and the passage, unplanted, is the plan's new piece: home
 * shows `Begin`, which leads to Today. Every frame holds to the root's
 * frame rule.
 */

import { RegistryProvider } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Layer } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import Root from '../app/index';
import { runtime } from './app';
import { clockOf, START } from './test/clock';
import { deadline } from './test/elapsed';
import { device } from './test/one';
import { watchRoot } from './test/root-rule';

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
  const rule = watchRoot(host, 'read');
  const headings = () =>
    [...host.querySelectorAll('[role="heading"]')].map((node) => node.textContent);
  /** The buttons named `Begin`, by label or text. */
  const begins = () =>
    [...host.querySelectorAll('[role="button"]')].filter(
      (node) => node.getAttribute('aria-label') === 'Begin' || node.textContent === 'Begin',
    );
  /** Waits until `holds`, at most 3 s. */
  const until = async (holds: () => boolean) => {
    const late = deadline(3000);
    while (!holds() && !late()) await act(() => new Promise((resolve) => setTimeout(resolve, 2)));
  };
  const home = { headings: [''], begins: 0 };

  /** The launch: home once it shows `Begin`, then `Begin`, then Today once its heading shows. */
  const shown = (async () => {
    device.launch([
      [`heartseed/recall/${OTHER.reference}/${OTHER.startedAt}`, JSON.stringify(OTHER)],
    ]);
    const layer = AtomRegistry.make()
      .get(runtime.layer)
      .pipe(Layer.provideMerge(clockOf({ now: START })));
    await act(async () =>
      createRoot(host).render(
        <RegistryProvider initialValues={[[runtime.layer, layer]]}>
          <Root />
        </RegistryProvider>,
      ),
    );
    await until(() => headings().join('|') === 'Your field' && begins().length > 0);
    home.headings = headings().map(String);
    const taps = begins();
    home.begins = taps.length;
    await act(async () => {
      for (const tap of taps.slice(0, 1))
        tap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    await until(() => headings().includes('Today'));
  })();

  it('opens on home with Begin, which shows the header Today', async () => {
    await shown;
    expect({ home, today: headings(), faults: rule.faults }).toEqual({
      home: { headings: ['Your field'], begins: 1 },
      today: ['Today'],
      faults: [],
    });
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
