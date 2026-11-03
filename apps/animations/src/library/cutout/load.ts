import * as BunServices from '@effect/platform-bun/BunServices';
import { type PuppetSpec } from '@manna/film/canvas';
import { PuppetImagesBun, puppetFrom } from '@manna/film/tools';
import { Effect, Layer } from 'effect';

export const puppetLoader =
  <V extends string>(puppets: Readonly<Record<V, PuppetSpec>>) =>
  (view: V) =>
    puppetFrom(puppets[view]).pipe(
      Effect.provide(PuppetImagesBun.pipe(Layer.provide(BunServices.layer))),
    );
