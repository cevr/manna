import { puppetLoader } from '../../../../../library/cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** Her puppet of `view` (front, threeQuarterLeft, back), made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
