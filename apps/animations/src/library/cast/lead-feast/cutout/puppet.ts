// The series lead's puppet of a cut view, made in Bun by the shared loader
// (`library/cutout/load.ts`) from the paths `puppets.ts` imports, for the
// tools, the tests and a fitter that search his poses on the CPU raster.

import { puppetLoader } from '../../../cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** His puppet of `view` (front, threeQuarterLeft, heads-4, single-1), made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
