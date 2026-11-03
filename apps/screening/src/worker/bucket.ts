import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Stage } from 'alchemy/Stage';
import { Effect, Option } from 'effect';

import { bucketName } from '../site.ts';

const stage = Effect.map(
  Effect.serviceOption(Stage),
  Option.getOrElse(() => 'runtime'),
);

const isProd = Effect.map(stage, (name) => name === 'prod');

export const Shelf = Cloudflare.R2.Bucket(
  'Shelf',
  Effect.map(stage, (name) => ({
    name: bucketName(name),
    publicAccess: false,
    domains: [],
    forceDestroy: name !== 'prod',
  })),
).pipe(Alchemy.RemovalPolicy.retain(isProd));

export const DeskToken = Alchemy.Random('DeskToken');
