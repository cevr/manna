/** `bun packages/pixel-match/src/sim/heartseed.ts <command>`: Heartseed on One, on `verify-heartseed-one`. */
import { heartseedOne } from './apps.ts';
import { launchOne } from './place.ts';

launchOne(heartseedOne, 'heartseed', import.meta.url);
