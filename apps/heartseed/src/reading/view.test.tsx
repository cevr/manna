/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noTernary, eslint/no-await-in-loop -- a view test: it mounts the reading view in happy-dom's document and draws it again frame after frame, one after another, through React's promise-based `act`, draws its views with plain branches, and reads nodes whose absent attributes are null. */

/**
 * The reading view alone (hslight L2, L6, L9), mounted in happy-dom
 * (react-native-web) and drawn again over generated readings of made-up
 * texts: each frame holds one `word-<i>` per word, each a direct child of
 * `reading` showing `shownWordsOf`'s text; the words before `lit` in `ink`
 * and the rest in `quiet`; the voice's current range alone selected, on the
 * `hearing` ground; no transition or animation on any node; and the view at
 * least 44 pt tall.
 *
 * It catches the ink off by one, a selection or ground left on a word out
 * of the range, a word nested in a wrapper, and a word's text cut at its
 * letters. Today's wiring (when the view shows) is the acceptance's and the
 * hold's tests'.
 */

import { describe, expect, it } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { random } from '../test/garden-model';
import { computed } from '../test/look';
import { theme } from '../theme';
import type { VoiceView } from '../voice';
import { wordSpans } from '../voice/reading';
import { ReadingView } from './view';
import { shownWordsOf } from './words';

const TEXTS = [
  'Alpha beta, gamma — delta... epsilon zeta eta theta iota kappa.',
  '— lead mark then words 12 and 𝒜dam’s end ...',
  'one',
  'a b c d e f g h i j k l m n o p q r s t u v w x y z',
];

const viewOf = (text: string, next: () => number): VoiceView => {
  const words = wordSpans(text).length;
  const lit = Math.floor(next() * (words + 1));
  const first = Math.floor(next() * words);
  const last = Math.min(words - 1, first + Math.floor(next() * 3));
  return {
    choice: 'her',
    enabled: true,
    status: next() < 0.3 ? 'paused' : 'reading',
    verse: text,
    words,
    lit,
    current: next() < 0.25 ? null : { first, last },
    ended: null,
  };
};

describe('the reading view', () => {
  it('lights each word to the read point and selects the current range, frame after frame', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const next = random(7);
    const roles = theme.light;
    const faults: string[] = [];
    for (let step = 0; step < 60; step++) {
      const text = TEXTS[step % TEXTS.length] as string;
      const view = viewOf(text, next);
      await act(async () => root.render(<ReadingView text={text} view={view} />));
      const reading = host.querySelector('[data-testid="reading"]');
      if (reading === null) {
        faults.push(`step ${step}: no reading view`);
        continue;
      }
      if (Number.parseFloat(getComputedStyle(reading).minHeight) < 44)
        faults.push(`step ${step}: the view under 44 pt`);
      const shown = shownWordsOf(text);
      const children = [...reading.children];
      if (children.length !== shown.length)
        faults.push(`step ${step}: ${children.length} children of ${shown.length} words`);
      children.forEach((node, index) => {
        const at = `step ${step} word-${index}`;
        if (node.getAttribute('data-testid') !== `word-${index}`)
          faults.push(`${at}: child is ${node.getAttribute('data-testid')}`);
        if (node.textContent !== shown[index]) faults.push(`${at}: text differs`);
        const range = view.current;
        const selected = range !== null && index >= range.first && index <= range.last;
        if ((node.getAttribute('aria-selected') === 'true') !== selected)
          faults.push(`${at}: selected ${node.getAttribute('aria-selected')} want ${selected}`);
        const style = getComputedStyle(node);
        const ink = index < view.lit ? roles.ink : roles.quiet;
        if (style.color !== computed(ink))
          faults.push(`${at}: ink ${style.color} want ${index < view.lit ? 'ink' : 'quiet'}`);
        const ground = style.backgroundColor === computed(roles.hearing);
        if (ground !== selected) faults.push(`${at}: hearing ground ${ground} want ${selected}`);
        for (const moving of [style.transitionProperty, style.animationName])
          if (moving !== '' && moving !== 'none') faults.push(`${at}: moves (${moving})`);
      });
    }
    await act(async () => root.unmount());
    host.remove();
    expect(faults).toEqual([]);
  });
});
