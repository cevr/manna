import { puppetLoader } from '../../../cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** The puppet of `view`, made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
