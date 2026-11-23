/** `bun packages/pixel-match/src/sim/hymnal.ts <command>`: the hymnal on One, on `verify-hymnal-one`. */
import { hymnalOne } from './apps.ts';
import { launchOne } from './place.ts';

launchOne(hymnalOne, 'hymnal', import.meta.url);
