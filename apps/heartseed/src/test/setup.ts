/* oxlint-disable effect/noGlobals -- Bun's loader takes each stand-in module as source text, so paths and the passage are written into it as JSON literals. */

/**
 * The app's tests run its screens under Bun, mounted in a browser's
 * document (happy-dom) as the web build renders them, with `__DEV__` false
 * as in a release build (Reanimated reads it as it loads). Three boundaries
 * stand in, as the bundler and the router would provide them:
 * - `react-native` is react-native-web, as on the web;
 * - `virtual:heartseed-passage` is the passage the bundler plugin derives,
 *   by the same script (`vite/passage.ts`), and `virtual:heartseed-kjv` the
 *   corpus, by `vite/kjv.ts`, and `virtual:heartseed-lexicon` the natural
 *   voice's list, by `vite/lexicon.ts`, each derived only when a test
 *   imports it;
 * - `one` is `src/test/one.tsx`: a phone's safe area with no insets, its
 *   haptics felt by nothing, and device info that reads a phone.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { plugin } from 'bun';

import { readChapters } from '../../vite/kjv';
import { readLexicon } from '../../vite/lexicon';
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
  },
});
