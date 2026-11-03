/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- a script at Bun's boundary: its loader takes the stand-in module as source text, and the colour module is imported only once the stand-in is registered. */

import { plugin } from 'bun';

plugin({
  name: 'react-native-android',
  setup(build) {
    build.module('react-native', () => ({
      contents: `
        export const Platform = {
          OS: 'android',
          select: (specifics) => ('android' in specifics ? specifics.android : specifics.default),
        };
        export const PlatformColor = (...names) => ({ resource_paths: names });
        export const DynamicColorIOS = () => {
          throw new Error('DynamicColorIOS is not available on this platform.');
        };
        export const useColorScheme = () => 'light';
      `,
      loader: 'js',
    }));
  },
});

const { color } = await import('../color.native');
process.stdout.write(Object.keys(color).join(' '));
