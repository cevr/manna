// The villager child's puppet of a cut view, made in Bun by the shared loader
// (`library/cutout/load.ts`) from the paths `puppets.ts` imports, for the
// tools, the tests and a fitter that search its poses on the CPU raster.

import { puppetLoader } from '../../../cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** The puppet of `view`, made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
