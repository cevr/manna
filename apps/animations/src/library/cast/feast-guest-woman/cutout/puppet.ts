import { puppetLoader } from '../../../cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** Her puppet of `view` (poses-1), made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
