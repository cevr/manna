// The series lead's puppet of a cut view, made in Bun (`puppetFor`): its
// part PNGs read and decoded from the paths `puppets.ts` imports, skinned on
// the view's skeleton (`puppetFrom`, the page's own loader's), for the tools,
// the tests and a fitter that search his poses on the CPU raster
// (`rasterOf`). The page loads the same puppet through its film's load.

import * as BunServices from '@effect/platform-bun/BunServices';
import { PuppetImagesBun, puppetFrom } from '@manna/film/tools';
import { Effect, Layer } from 'effect';
import { PUPPETS } from './puppets.ts';

/** His puppet of `view` (front, threeQuarterLeft, heads-4), made from its committed part sheet. */
export const puppetFor = (view: keyof typeof PUPPETS) =>
  puppetFrom(PUPPETS[view]).pipe(
    Effect.provide(PuppetImagesBun.pipe(Layer.provide(BunServices.layer))),
  );
