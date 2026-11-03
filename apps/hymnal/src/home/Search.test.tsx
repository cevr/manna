/**
 * The open search across the stack's screens, as the layout nests the
 * player layer (`LivePlayer`) over the stack's wrapper (`StackBottom`),
 * mounted in a browser's document over a registry of its own
 * (`src/test/setup.ts`), on the real home screen or a stand-in hymn page:
 *
 * - a hymn pushed from the home list's results and popped again brings back
 *   the same results, mounted once, so their scroll place and their hymns
 *   about the query are as the reader left them;
 * - the box takes focus, and the keyboard rises, only on the press of
 *   `Search` that opened its search: never on the way back from a result,
 *   and never on a later search the press did not open.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryContext } from '@effect/atom-react';
import { Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';

import { LivePlayer } from '~/player/LivePlayer';
import { useShowsPage } from '~/player/page';
import { StackBottom } from '~/player/StackBottom';
import { searchAt, searchOpen, searchQuery } from '~/reader/place';
import { pathname } from '~/test/one';

import { Home } from './Home.native';

/** A stand-in hymn page: the page shows, so the player's bar and its find bar stand over it. */
function Page({ n }: { readonly n: number }) {
  useShowsPage({ number: n, title: 'Stand-in' });
  return <View testID={`page-${n}`} />;
}

type Screen = { readonly path: string; readonly draw: () => ReactNode };

const home: Screen = { path: '/', draw: () => <Home key="home" /> };
const hymn = (n: number): Screen => ({ path: `/hymns/${n}`, draw: () => <Page key={n} n={n} /> });

/** The stack from `first` up, its last screen shown, mounted over a registry of its own; `show` pushes or pops to another stack. */
const mount = (first: Screen, ...rest: ReadonlyArray<Screen>) => {
  const registry = AtomRegistry.make();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const show = (bottom: Screen, ...above: ReadonlyArray<Screen>) => {
    pathname.current = [bottom, ...above].reduce((_, screen) => screen).path;
    act(() =>
      root.render(
        <RegistryContext value={registry}>
          <LivePlayer>
            <StackBottom>{[bottom, ...above].map((screen) => screen.draw())}</StackBottom>
          </LivePlayer>
        </RegistryContext>,
      ),
    );
  };
  show(first, ...rest);
  return {
    host,
    registry,
    show,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      pathname.current = '/';
    },
  };
};

const byId = (host: HTMLElement, id: string) =>
  Option.fromNullishOr(host.querySelector<HTMLElement>(`[data-testid="${id}"]`));
const button = (host: HTMLElement, label: string) =>
  Option.fromNullishOr(host.querySelector<HTMLElement>(`[role="button"][aria-label="${label}"]`));
const press = (element: Option.Option<HTMLElement>) =>
  act(() => Option.map(element, (found) => found.click()));
const box = (host: HTMLElement) => Option.fromNullishOr(host.querySelector('input'));
const boxFocused = (host: HTMLElement) =>
  Option.exists(box(host), (input) => document.activeElement === input);
const blur = (host: HTMLElement) => Option.map(box(host), (input) => input.blur());
/** Whether `element` lies hidden from assistive technology, itself or by an ancestor. */
const hidden = (element: Element) =>
  Option.isSome(Option.fromNullishOr(element.closest('[aria-hidden="true"]')));
/** Whether the search's results stand in reach. */
const resultsInReach = (host: HTMLElement) =>
  Option.exists(byId(host, 'search'), (found) => !hidden(found));

const type = (host: HTMLElement, words: string) =>
  act(() =>
    Option.map(box(host), (input) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, words);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }),
  );

describe('back from a result to search on the home list', () => {
  const base = home;
  it('returns to the same results, mounted once and in reach, with the keyboard down', () => {
    using phone = mount(base);
    press(button(phone.host, 'Search'));
    type(phone.host, '100');
    const opened = byId(phone.host, 'search');
    const focusedAtPress = boxFocused(phone.host);
    blur(phone.host);
    phone.show(base, hymn(100));
    const onPushed = { results: resultsInReach(phone.host), box: Option.isSome(box(phone.host)) };
    phone.show(base);
    const back = byId(phone.host, 'search');
    expect({
      focusedAtPress,
      onPushed,
      sameResults:
        Option.isSome(back) && Option.getOrUndefined(back) === Option.getOrUndefined(opened),
      inReach: resultsInReach(phone.host),
      query: phone.registry.get(searchQuery),
      box: Option.isSome(box(phone.host)),
      focused: boxFocused(phone.host),
    }).toEqual({
      focusedAtPress: true,
      onPushed: { results: false, box: false },
      sameResults: true,
      inReach: true,
      query: '100',
      box: true,
      focused: false,
    });
  });
});

describe('the search a press on Search did not open', () => {
  it('leaves the keyboard down: About this hymn opens the home list after Search and Cancel on a hymn page', () => {
    using phone = mount(home, hymn(8));
    press(button(phone.host, 'Search'));
    const focusedAtPress = boxFocused(phone.host);
    blur(phone.host);
    press(button(phone.host, 'Cancel'));
    act(() => {
      phone.registry.set(searchQuery, '1');
      phone.registry.set(searchOpen, searchAt('/', 'about'));
    });
    phone.show(home);
    expect({
      focusedAtPress,
      box: Option.isSome(box(phone.host)),
      focused: boxFocused(phone.host),
    }).toEqual({ focusedAtPress: true, box: true, focused: false });
  });

  it('starts empty: Search on a second screen moves the search there with an empty box', () => {
    using phone = mount(hymn(8));
    press(button(phone.host, 'Search'));
    type(phone.host, '100');
    blur(phone.host);
    phone.show(hymn(8), hymn(100));
    press(button(phone.host, 'Search'));
    expect({
      query: phone.registry.get(searchQuery),
      at: phone.registry.get(searchOpen),
      focused: boxFocused(phone.host),
    }).toEqual({ query: '', at: searchAt('/hymns/100', 'field'), focused: true });
  });
});
