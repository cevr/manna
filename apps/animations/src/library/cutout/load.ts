// A member's puppet of a cut view, made in Bun: its part PNGs read and
// decoded from the paths his puppets' module imports, skinned on the view's
// skeleton (`puppetFrom`, the page's own loader's), for the tools, the tests
// and a fitter that search his poses on the CPU raster (`rasterOf`). The page
// loads the same puppet through its film's load. Bun only: a page never
// imports this module.

import * as BunServices from '@effect/platform-bun/BunServices';
import { type PuppetSpec } from '@manna/film/canvas';
import { PuppetImagesBun, puppetFrom } from '@manna/film/tools';
import { Effect, Layer } from 'effect';

/** A loader of a member's puppets: his puppet of `view`, made from its committed part sheet. */
export const puppetLoader =
  <V extends string>(puppets: Readonly<Record<V, PuppetSpec>>) =>
  (view: V) =>
    puppetFrom(puppets[view]).pipe(
      Effect.provide(PuppetImagesBun.pipe(Layer.provide(BunServices.layer))),
    );
