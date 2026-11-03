import { puppetLoader } from '../../../cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** His puppet of `view` (heads-1 to heads-6), made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
