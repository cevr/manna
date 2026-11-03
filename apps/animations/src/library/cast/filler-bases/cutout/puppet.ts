import { puppetLoader } from '../../../cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** Their puppet of `view` (poses-1 to poses-4), made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
