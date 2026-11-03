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
