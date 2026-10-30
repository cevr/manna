// The IDEA villagers' puppet of a cut view, made in Bun by the shared loader
// (`library/cutout/load.ts`) from the paths `puppets.ts` imports, for the
// tools, the tests and a fitter that search their poses on the CPU raster.

import { puppetLoader } from '../../../../../library/cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** Their puppet of `view` (poses-3, poses-4, poses-6), made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
