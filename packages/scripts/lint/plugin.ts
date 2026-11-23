import { Plugin } from 'oxlint-plugin-effect/rule-bindings';
import { chromeMockKeychain } from './chrome-mock-keychain.ts';
import { noBrowserSpawn } from './no-browser-spawn.ts';
import { seedFromClock } from './seed-from-clock.ts';

export default Plugin.define({
  name: 'manna',
  rules: {
    'chrome-mock-keychain': chromeMockKeychain,
    'no-browser-spawn': noBrowserSpawn,
    'seed-from-clock': seedFromClock,
  },
});
