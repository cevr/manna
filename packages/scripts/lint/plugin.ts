import { Plugin } from 'oxlint-plugin-effect/rule-bindings';
import { chromeMockKeychain } from './chrome-mock-keychain.ts';
import { seedFromClock } from './seed-from-clock.ts';

export default Plugin.define({
  name: 'manna',
  rules: {
    'chrome-mock-keychain': chromeMockKeychain,
    'seed-from-clock': seedFromClock,
  },
});
