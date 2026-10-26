/**
 * The site's files on Cloudflare: one private R2 bucket (no r2.dev URL, no
 * custom domain, so nothing lists it), read by the Worker alone
 * (`./Site.ts`), and the key the publisher writes to it with.
 *
 * The bucket holds the pages, each film's manifest and every version's
 * files (`../manifest.ts`). On `prod` it is retained: `alchemy destroy` only
 * forgets it. A throwaway stage's bucket is emptied and deleted with it.
 *
 * The key is an account API token allowed to read and write objects in this
 * bucket only. R2's S3 API takes it as a key pair: the token's id is the
 * access key id and the sha256 of its value the secret
 * (developers.cloudflare.com/r2/api/tokens); `../../scripts/keys.ts` derives
 * the pair from the stack's outputs into the publisher's `.env`.
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

/** The API token policy resource for one bucket (`<account>_<jurisdiction>_<bucket>`). */
const bucketResource = (accountId: string, bucket: string) =>
  `com.cloudflare.edge.r2.bucket.${accountId}_default_${bucket}`;

/** The publisher's key to the bucket, and the account it is in. */
export const PublishKey = Effect.gen(function* () {
  const { stage: name } = yield* Alchemy.Stack;
  const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
  const bucket = bucketName(name);
  const key = yield* Cloudflare.ApiToken.AccountApiToken('PublishKey', {
    name: `${bucket} objects`,
    policies: [
      {
        effect: 'allow',
        permissionGroups: [
          'Workers R2 Storage Bucket Item Read',
          'Workers R2 Storage Bucket Item Write',
        ],
        resources: { [bucketResource(accountId, bucket)]: '*' },
      },
    ],
  });
  return { key, accountId };
});
