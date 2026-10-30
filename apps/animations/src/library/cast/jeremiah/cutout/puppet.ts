// Jeremiah's puppet of a cut view, made in Bun by the shared loader
// (`library/cutout/load.ts`) from the paths `puppets.ts` imports, for the
// tools, the tests and a fitter that search his poses on the CPU raster.

import { puppetLoader } from '../../../cutout/load.ts';
import { PUPPETS } from './puppets.ts';

/** His puppet of `view` (heads-1 to heads-6), made from its committed part sheet. */
export const puppetFor = puppetLoader(PUPPETS);
