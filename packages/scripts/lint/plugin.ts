import { Plugin } from 'oxlint-plugin-effect/rule-bindings';
import { seedFromClock } from './seed-from-clock.ts';

export default Plugin.define({
  name: 'manna',
  rules: {
    'seed-from-clock': seedFromClock,
  },
});
