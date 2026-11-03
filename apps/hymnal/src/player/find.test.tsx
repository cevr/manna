/**
 * The find drums over the screens, as the app's player layer draws them
 * (`LivePlayer`), mounted in a browser's document over a stand-in home
 * screen (`src/test/setup.ts`): a tap outside the drums closes them and
 * reaches nothing behind, and the drums draw their digits and no names.
 *
 * React Native's hit test lets a later sibling lie over an earlier one, so
 * the layer that takes the outside tap is drawn after the screens and before
 * the drums' panel and the `#`.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text, View } from 'react-native';

import { pathname, routed } from '../test/one';

import { LivePlayer } from './LivePlayer';

/** What the reader pressed behind the drums, oldest first. */
const behind: Array<string> = [];

/** A stand-in home screen: a hymn row and a button of the bar. */
function Screen() {
  return (
    <View testID="screen">
      <Pressable testID="behind-row" role="link" onPress={() => void behind.push('row')}>
        <Text>1</Text>
      </Pressable>
      <Pressable testID="behind-play" role="button" onPress={() => void behind.push('play')} />
    </View>
  );
}

/** The player layer over the stand-in screen, mounted in the document; it unmounts when the test's `using` ends. */
const mount = () => {
  pathname.current = '/';
  behind.splice(0);
  routed.splice(0);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryProvider>
        <LivePlayer>
          <Screen />
        </LivePlayer>
      </RegistryProvider>,
    ),
  );
  return {
    host,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const byId = (host: HTMLElement, id: string) =>
  Option.fromNullishOr(host.querySelector<HTMLElement>(`[data-testid="${id}"]`));
const get = (host: HTMLElement, id: string) => Option.getOrThrow(byId(host, id));
const click = (element: HTMLElement) => act(() => element.click());
const open = (host: HTMLElement) => Option.isSome(byId(host, 'find-drums'));

/** Where `element` is drawn among the window's elements: a later one lies over an earlier one. */
const order = (host: HTMLElement, element: Element) =>
  [...host.querySelectorAll('*')].indexOf(element);

describe('a tap outside the find drums', () => {
  it('meets a layer over the screens, under the panel and the `#`, only while the drums are open', () => {
    using page = mount();
    const { host } = page;
    expect(Option.isNone(byId(host, 'find-outside'))).toBe(true);
    click(get(host, 'find-number'));
    const layer = get(host, 'find-outside');
    expect([
      order(host, get(host, 'behind-play')) < order(host, layer),
      order(host, layer) < order(host, get(host, 'find-drums')),
      order(host, layer) < order(host, get(host, 'find-number')),
    ]).toEqual([true, true, true]);
    click(get(host, 'find-number'));
    expect([open(host), Option.isNone(byId(host, 'find-outside'))]).toEqual([false, true]);
  });

  it('closes the drums, routes nowhere and fires nothing behind', () => {
    using page = mount();
    const { host } = page;
    click(get(host, 'find-number'));
    click(get(host, 'find-outside'));
    expect({ open: open(host), routed: [...routed], behind: [...behind] }).toEqual({
      open: false,
      routed: [],
      behind: [],
    });
    click(get(host, 'behind-row'));
    expect(behind).toEqual(['row']);
  });

  it('leaves a press on the panel itself to the panel: the drums stay open', () => {
    using page = mount();
    const { host } = page;
    click(get(host, 'find-number'));
    click(get(host, 'find-drums'));
    expect(open(host)).toBe(true);
  });
});

describe('the find drums', () => {
  it('draw their digits and no names', () => {
    using page = mount();
    const { host } = page;
    click(get(host, 'find-number'));
    const texts = ['hundreds', 'tens', 'ones'].flatMap((drum) =>
      [...get(host, `drum-${drum}`).querySelectorAll('*')]
        .filter((element) => element.children.length === 0)
        .map((element) => element.textContent ?? '')
        .filter((text) => text !== ''),
    );
    expect(texts.filter((text) => !/^\d$/.test(text))).toEqual([]);
    expect(texts.length).toBeGreaterThan(0);
  });
});
