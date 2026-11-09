/* oxlint-disable effect/noGlobals, effect/noTestLifecycleHooks, effect/noThrowStatement, effect/noNewError -- Bun's loader takes each stand-in module as source text, so paths and the passage are written into it as JSON literals; every case passes through one check after it, which fails a case that left the host outside UTC by throwing to bun's runner. */

/**
 * The app's tests run its screens under Bun, mounted in a browser's
 * document (happy-dom) as the web build renders them, with `__DEV__` false
 * as in a release build (Reanimated reads it as it loads). Four boundaries
 * stand in, as the bundler and the router would provide them:
 * - `react-native` is react-native-web, as on the web;
 * - `react-native-gesture-handler` is `src/test/gesture.tsx`: a test plays
 *   a gesture's touch through its own callbacks (`gestureOf`);
 * - `virtual:heartseed-passage` is the passage the bundler plugin derives,
 *   by the same script (`vite/passage.ts`), and `virtual:heartseed-kjv` the
 *   corpus, by `vite/kjv.ts`, `virtual:heartseed-lexicon` the natural
 *   voice's list, by `vite/lexicon.ts`, and `virtual:heartseed-licence` the
 *   vendored licence, by `vite/licence.ts`, each derived only when a test
 *   imports it;
 * - `one` is `src/test/one.tsx`: a phone's safe area with no insets, its
 *   haptics felt by nothing, and device info that reads a phone.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { plugin } from 'bun';
import { afterEach } from 'bun:test';

import { readChapters } from '../../vite/kjv';
import { readLexicon } from '../../vite/lexicon';
import { readLicence } from '../../vite/licence';
import { readPassage } from '../../vite/passage';

GlobalRegistrator.register({ url: 'http://localhost/' });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, __DEV__: false });

plugin({
  name: 'heartseed-test-boundaries',
  setup(build) {
    const web = Bun.resolveSync('react-native-web', import.meta.dir);
    build.module('react-native', () => ({
      contents: `export * from ${JSON.stringify(web)};`,
      loader: 'js',
    }));
    const one = Bun.resolveSync('./one.tsx', import.meta.dir);
    build.module('one', () => ({
      contents: `export * from ${JSON.stringify(one)};`,
      loader: 'js',
    }));
    const gesture = Bun.resolveSync('./gesture.tsx', import.meta.dir);
    build.module('react-native-gesture-handler', () => ({
      contents: `export * from ${JSON.stringify(gesture)};`,
      loader: 'js',
    }));
    build.module('virtual:heartseed-passage', () => ({
      contents: `export default ${JSON.stringify(readPassage())};`,
      loader: 'js',
    }));
    build.module('virtual:heartseed-kjv', () => ({
      contents: `export default ${JSON.stringify(readChapters())};`,
      loader: 'js',
    }));
    build.module('virtual:heartseed-lexicon', () => ({
      contents: `export default ${JSON.stringify(readLexicon())};`,
      loader: 'js',
    }));
    build.module('virtual:heartseed-licence', () => ({
      contents: `export default ${JSON.stringify(readLicence())};`,
      loader: 'js',
    }));
  },
});

const UTC_AT = [Date.UTC(2026, 0, 15, 12), Date.UTC(2026, 6, 15, 12)];

/** Every case ends with the host in UTC, the zone bun test starts in: one that ends elsewhere fails, naming the zone, and UTC is put back first so the cases after it run where they expect. */
afterEach(() => {
  if (UTC_AT.every((at) => new Date(at).getTimezoneOffset() === 0)) return;
  const left = process.env.TZ ?? 'the host’s own zone';
  process.env.TZ = 'UTC';
  throw new Error(
    `the case ended in ${left}, not UTC: a zone it set was not put back, or a walk in it outlived it`,
  );
});
