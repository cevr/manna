/**
 * Acceptance (tidyup A1): the find drums keep `Open` and lose `Play`, as the
 * owner asked (2026-11-02): "let's remove [Play] from here. It's kind of rare
 * that we'd want to play a song alone. Just keep it open." The drums as the
 * app's player layer draws them (`LivePlayer`), mounted in a browser's
 * document over a stand-in home screen (`src/test/setup.ts`).
 *
 * - Open, the drums' panel holds one button, `Open`, and no `Play`.
 * - `Open` opens the dialled hymn's page and closes the drums; no hymn starts.
 *
 * Hymn numbers only: no hymn's words are read or printed.
 *
 * Final path: `apps/hymnal/src/player/finddrums.open.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';

import { pathname, routed } from '~/test/one';

import { LivePlayer } from './LivePlayer';

/** The player layer over a stand-in home screen, mounted in the document; it unmounts when the test's `using` ends. */
const mount = () => {
  pathname.current = '/';
  routed.splice(0);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryProvider>
        <LivePlayer>
          <View testID="screen" />
        </LivePlayer>
      </RegistryProvider>,
    ),
  );
  const one = (selector: string) => Option.fromNullishOr(host.querySelector<HTMLElement>(selector));
  const get = (selector: string) => Option.getOrThrow(one(selector));
  return {
    one,
    get,
    /** One press, as a finger's tap reaches it on the web. */
    click: (selector: string) => act(() => get(selector).click()),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

describe('the find drums’ acts', () => {
  it('are `Open` alone: one button on the panel, and no `Play`', () => {
    using page = mount();
    page.click('[data-testid="find-number"]');
    const buttons = [
      ...page.get('[data-testid="find-drums"]').querySelectorAll('[role="button"]'),
    ].map((button) => button.getAttribute('aria-label'));
    expect({
      buttons,
      play: Option.isSome(page.one('[data-testid="find-play"]')),
    }).toEqual({ buttons: ['Open'], play: false });
  });

  it('`Open`, the only act, opens the dialled hymn and closes the drums', () => {
    using page = mount();
    page.click('[data-testid="find-number"]');
    const acts = [...page.get('[data-testid="find-drums"]').querySelectorAll('[role="button"]')]
      .length;
    page.click('[data-testid="find-open"]');
    expect({
      acts,
      routed: [...routed],
      open: Option.isSome(page.one('[data-testid="find-drums"]')),
    }).toEqual({ acts: 1, routed: ['push /hymns/1'], open: false });
  });
});
