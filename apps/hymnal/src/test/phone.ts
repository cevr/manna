/* oxlint-disable effect/noGlobals, effect/noUnsafeDictionaryType -- Bun's loader takes each stand-in module as source text, which reaches the script's device through the global object; the stand-in scroll view records its props as React Native hands them over. */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { plugin } from 'bun';

import { readChords } from '../../vite/chords';
import { readIndexes } from '../../vite/indexes';
import { readTiming } from '../../vite/timing';
import { readWords } from '../../vite/words';

export interface Scrolls {
  readonly sideways: Array<Record<string, unknown>>;
  readonly upright: Array<Record<string, unknown>>;
}

export const phone = ({ nativeList = false }: { readonly nativeList?: boolean } = {}) => {
  GlobalRegistrator.register({ url: 'http://localhost/' });

  const device = {
    scheme: 'light' as 'light' | 'dark',
    fontScale: 1,
    listeners: new Set<() => void>(),
    set(next: { readonly scheme?: 'light' | 'dark'; readonly fontScale?: number }) {
      Object.assign(device, next);
      for (const listener of device.listeners) listener();
    },
  };
  const scrolls: Scrolls = { sideways: [], upright: [] };
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    __DEV__: false,
    phoneDevice: device,
    phoneScrolls: scrolls,
  });

  HTMLElement.prototype.getBoundingClientRect = () => DOMRect.fromRect({ width: 390, height: 800 });
  class Observer {
    constructor(private readonly told: (entries: ReadonlyArray<{ target: Element }>) => void) {}
    observe(target: Element) {
      queueMicrotask(() => this.told([{ target }]));
    }
    unobserve() {}
    disconnect() {}
  }
  Object.assign(window, { ResizeObserver: Observer });
  if (nativeList)
    Object.defineProperties(HTMLElement.prototype, {
      offsetWidth: { get: () => 390, configurable: true },
      offsetHeight: { get: () => 800, configurable: true },
    });

  const web = Bun.resolveSync('react-native-web', import.meta.dir);
  const one = Bun.resolveSync('./one.tsx', import.meta.dir);
  const gesture = Bun.resolveSync('./gesture.tsx', import.meta.dir);
  const color = Bun.resolveSync('../color.native.ts', import.meta.dir);
  const phoneList = Bun.resolveSync('../reader/HymnList.native.tsx', import.meta.dir);
  const list = `${Bun.resolveSync('@legendapp/list/package.json', import.meta.dir).replace(/package\.json$/, '')}react-native.mjs`;

  plugin({
    name: 'hymnal-phone',
    setup(build) {
      build.module('react-native', () => ({
        contents: `
          import { createElement, forwardRef, useSyncExternalStore } from 'react';
          import { Animated as WebAnimated, Platform as WebPlatform } from ${JSON.stringify(web)};
          export * from ${JSON.stringify(web)};
          const device = globalThis.phoneDevice;
          const scrolls = globalThis.phoneScrolls;
          const subscribe = (listener) => {
            device.listeners.add(listener);
            return () => device.listeners.delete(listener);
          };
          export const Platform = {
            ...WebPlatform,
            OS: 'ios',
            select: (specifics) => ('ios' in specifics ? specifics.ios : specifics.default),
          };
          export const DynamicColorIOS = ({ light }) => light;
          export const PlatformColor = (name) => name;
          export const useColorScheme = () => useSyncExternalStore(subscribe, () => device.scheme);
          const windowOf = (fontScale) => ({ width: 390, height: 800, scale: 3, fontScale });
          let shown = windowOf(device.fontScale);
          export const useWindowDimensions = () =>
            useSyncExternalStore(subscribe, () => {
              if (shown.fontScale !== device.fontScale) shown = windowOf(device.fontScale);
              return shown;
            });
          const Told = forwardRef(function Told(props, ref) {
            scrolls[props.horizontal ? 'sideways' : 'upright'].push(props);
            return createElement(WebAnimated.ScrollView, { ...props, ref });
          });
          export const Animated = { ...WebAnimated, ScrollView: Told };
        `,
        loader: 'js',
      }));
      build.module('one', () => ({
        contents: `export * from ${JSON.stringify(one)};`,
        loader: 'js',
      }));
      build.module('react-native-gesture-handler', () => ({
        contents: `export * from ${JSON.stringify(gesture)};`,
        loader: 'js',
      }));
      build.module('~/color', () => ({
        contents: `export * from ${JSON.stringify(color)};`,
        loader: 'js',
      }));
      build.module('virtual:hymnal', () => ({
        contents: `export default ${JSON.stringify(readWords())};`,
        loader: 'js',
      }));
      build.module('virtual:hymnal-chords', () => ({
        contents: `export default ${JSON.stringify(readChords())};`,
        loader: 'js',
      }));
      build.module('virtual:hymnal-timing', () => ({
        contents: `export default ${JSON.stringify(readTiming())};`,
        loader: 'js',
      }));
      build.module('virtual:hymnal-indexes', () => ({
        contents: `export default ${JSON.stringify(readIndexes())};`,
        loader: 'js',
      }));
      if (nativeList) {
        build.module('@legendapp/list/react-native', () => ({
          contents: `export * from ${JSON.stringify(list)};`,
          loader: 'js',
        }));
        build.module('~/reader/HymnList', () => ({
          contents: `export * from ${JSON.stringify(phoneList)};`,
          loader: 'js',
        }));
      }
    },
  });
  return { device, scrolls };
};
