/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- a drawing test: it mounts the tips through React's promise-based act in happy-dom and reads DOM absence as null. */

/**
 * Home's three tips (`./tips`), each mounted in both schemes: `id=tip-<n>`
 * holding its words exactly, drawn `onInk` on an `ink` fill at 4.5:1 or
 * more, after a numbered badge hidden from the screen reader; no control,
 * no image and no word of the passage.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import { AA, contrastOf } from '../test/contrast';
import { paintOf, setSystem } from '../test/look';
import { theme, type Scheme } from '../theme';
import { Tip, TIPS } from './tips';

const CONTROLS = '[role="button"],[role="radio"],[role="checkbox"],[role="link"]';
const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const WANT = {
  1: 'Come back each day and tap Start. It brings what is ready.',
  2: 'Add a psalm, a passage or a set of promises when you want more.',
  3: 'A list is a set of verses. Tap its name to open it.',
} as const;

describe('home’s tips', () => {
  for (const scheme of ['light', 'dark'] as const satisfies readonly Scheme[])
    for (const n of [1, 2, 3] as const)
      it(`draws tip ${n} in ${scheme}: its words onInk on ink after a hidden badge, and no control`, async () => {
        const host = document.createElement('div');
        document.body.append(host);
        const root = createRoot(host);
        await act(async () => {
          setSystem(scheme);
          root.render(<Tip n={n} />);
        });
        const tip = host.querySelector(`[data-testid="tip-${n}"]`);
        const badge = tip?.querySelector('[aria-hidden="true"]');
        const words = [...(tip?.querySelectorAll('*') ?? [])].filter(
          (node) => node.children.length === 0 && text(node) === WANT[n],
        );
        const word = words[0];
        expect({
          tips: host.querySelectorAll('[data-testid^="tip-"]').length,
          said: TIPS[n],
          badge: text(badge),
          words: words.length,
          ink: paintOf(getComputedStyle(word ?? host).color).hex,
          fill: paintOf(getComputedStyle(tip ?? host).backgroundColor).hex,
          aa: word !== undefined && contrastOf(word) >= AA,
          controls: host.querySelectorAll(CONTROLS).length,
          images: host.querySelectorAll('img').length,
          verse: passage.text.includes(WANT[n]),
        }).toEqual({
          tips: 1,
          said: WANT[n],
          badge: String(n),
          words: 1,
          ink: paintOf(theme[scheme].onInk).hex,
          fill: paintOf(theme[scheme].ink).hex,
          aa: true,
          controls: 0,
          images: 0,
          verse: false,
        });
        await act(async () => root.unmount());
        host.remove();
        setSystem('light');
      });
});
