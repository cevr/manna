import { describe, expect, it } from 'bun:test';
import { RegistryContext } from '@effect/atom-react';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { find, Find } from '~/player/bar';
import { searchAt, searchOpen } from '~/reader/place';
import { gestureOf } from '~/test/gesture';
import { actionsOf, perform } from '~/test/props';

import { Home } from './Home.native';

const withHome = (
  run: (host: HTMLElement, registry: AtomRegistry.AtomRegistry) => void,
  registry = AtomRegistry.make(),
) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <Home />
      </RegistryContext>,
    ),
  );
  run(host, registry);
  act(() => root.unmount());
  host.remove();
};

const tilesShow = (host: HTMLElement) => (host.textContent ?? '').includes(', all at once');

const pinch = (testID: string, scales: ReadonlyArray<number>, velocity = 0) =>
  act(() => {
    const gesture = gestureOf(testID);
    gesture.onBegin?.({ x: 0 });
    for (const scale of scales) gesture.onUpdate?.({ x: 0, scale });
    const scale = scales.at(-1) ?? 1;
    gesture.onDeactivate?.({ x: 0, scale, velocity, canceled: false });
    gesture.onFinalize?.({ x: 0, canceled: false });
  });

const heading = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="heading"]')].find(
    (element) => element.textContent === 'Hymns',
  ) ?? document.body;

describe('the ways into All at once past the group headings', () => {
  it('opens on the Hymns heading action All at once, VoiceOver’s way in', () =>
    withHome((host) => {
      expect(actionsOf(heading(host))).toEqual([{ name: 'allAtOnce', label: 'All at once' }]);
      const before = tilesShow(host);
      perform(heading(host), 'allAtOnce');
      expect([before, tilesShow(host)]).toEqual([false, true]);
    }));

  it('opens on a pinch in on the list, and closes on a pinch out on the tiles', () =>
    withHome((host) => {
      pinch('list-pinch', [0.95, 0.85, 0.79]);
      const opened = tilesShow(host);
      pinch('tiles-pinch', [1.1, 1.3]);
      expect([opened, tilesShow(host)]).toEqual([true, false]);
    }));

  it('commits a quick short pinch as it lifts, and nothing for a slow one or a stray touch', () =>
    withHome((host) => {
      const seen = [];
      pinch('list-pinch', [0.97, 0.99]);
      seen.push(tilesShow(host));
      pinch('list-pinch', [0.9], -0.4);
      seen.push(tilesShow(host));
      pinch('list-pinch', [0.9], -0.8);
      seen.push(tilesShow(host));
      expect(seen).toEqual([false, false, true]);
    }));

  it('acts once per gesture: a pinch in that goes on closing past 0.8 zooms out once', () =>
    withHome((host) => {
      let zooms = 0;
      const gesture = gestureOf('list-pinch');
      act(() => gesture.onBegin?.({ x: 0 }));
      for (const scale of [0.7, 0.6, 0.5]) {
        const before = tilesShow(host);
        act(() => gesture.onUpdate?.({ x: 0, scale }));
        zooms += Number(tilesShow(host) !== before);
      }
      pinch('tiles-pinch', [1.3]);
      act(() => gesture.onDeactivate?.({ x: 0, scale: 0.5, velocity: -3, canceled: false }));
      expect({ zooms, shown: tilesShow(host) }).toEqual({ zooms: 1, shown: false });
    }));

  it('takes no pinch while search is open on the home list or the find drums are open', () =>
    withHome((_, registry) => {
      const enabled = () => gestureOf('list-pinch').enabled;
      const seen = [enabled()];
      act(() => registry.set(searchOpen, searchAt('/', 'field')));
      seen.push(enabled());
      act(() => registry.set(searchOpen, searchAt('/hymns/8', 'field')));
      seen.push(enabled());
      act(() => registry.set(find, Find.Open({ number: 1 })));
      seen.push(enabled());
      expect(seen).toEqual([true, false, true, false]);
    }));
});
