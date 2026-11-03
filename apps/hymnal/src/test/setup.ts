/* oxlint-disable effect/noGlobals -- Bun's loader takes each stand-in module as source text, so paths and words are written into it as JSON literals. */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { plugin } from 'bun';

import { readChords } from '../../vite/chords';
import { readIndexes } from '../../vite/indexes';
import { readTiming } from '../../vite/timing';
import { readWords } from '../../vite/words';

GlobalRegistrator.register({
  url: 'http://localhost/',
  settings: { navigation: { disableMainFrameNavigation: true } },
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

plugin({
  name: 'hymnal-test-boundaries',
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
    const reanimated = Bun.resolveSync('./reanimated.tsx', import.meta.dir);
    build.module('react-native-reanimated', () => ({
      contents: `export * from ${JSON.stringify(reanimated)}; export { default } from ${JSON.stringify(reanimated)};`,
      loader: 'js',
    }));
    build.module('react-native-worklets', () => ({
      contents: `export { scheduleOnRN, runOnJS } from ${JSON.stringify(reanimated)};`,
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
  },
});
