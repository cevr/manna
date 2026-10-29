// The feast mother's puppet of a cut view, made in Bun by the shared loader
// (`library/cutout/load.ts`) from the paths `puppets.ts` imports, for the
// tools, the tests and a fitter that search her poses on the CPU raster.

import { puppetLoader } from '../../../../../library/cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** Her puppet of `view` (front, threeQuarterLeft, back), made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
