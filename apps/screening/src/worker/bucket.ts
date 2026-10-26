/**
 * The site's files on Cloudflare: one private R2 bucket (no r2.dev URL, no
 * custom domain, so nothing lists it), read by the site's Worker
 * (`./Site.ts`) and written by the desk's (`./Desk.ts`), and the secret the
 * desk answers to.
 *
 * The bucket holds the pages, each film's manifest and every version's
 * files (`../manifest.ts`). On `prod` it is retained: `alchemy destroy` only
 * forgets it. A throwaway stage's bucket is emptied and deleted with it.
 *
 * The secret is 32 random bytes made once by the stack and kept in its state
 * (`Alchemy.Random`): bound to the desk as `DESK_TOKEN`, and written to the
 * publisher's `.env` by `../../scripts/keys.ts`.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Stage } from 'alchemy/Stage';
import { Effect, Option } from 'effect';

import { bucketName } from '../site.ts';

/** The stage deploying, when there is one: the running Worker has none. */
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
    // A throwaway stage's objects are test data; prod's never go with it.
    forceDestroy: name !== 'prod',
  })),
).pipe(Alchemy.RemovalPolicy.retain(isProd));

/** The desk's secret. */
export const DeskToken = Alchemy.Random('DeskToken');
