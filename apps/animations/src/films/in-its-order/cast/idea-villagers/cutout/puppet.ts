import { puppetLoader } from '../../../../../library/cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** Their puppet of `view` (poses-3, poses-4, poses-6), made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
