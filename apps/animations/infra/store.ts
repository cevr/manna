import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Effect from 'effect/Effect';

const PROD_BUCKET = 'film-store';

const bucketName = (stage: string): string => {
  if (stage === 'prod') return PROD_BUCKET;
  return `${PROD_BUCKET}-${stage.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-')}`.slice(0, 63);
};

const bucketResource = (accountId: string, bucket: string) =>
  `com.cloudflare.edge.r2.bucket.${accountId}_default_${bucket}`;

export const FilmStore = Effect.gen(function* () {
  const { stage } = yield* Alchemy.Stack;
  const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
  const prod = stage === 'prod';
  const name = bucketName(stage);

  const bucket = yield* Cloudflare.R2.Bucket('FilmStore', {
    name,
    publicAccess: false,
    domains: [],
    forceDestroy: !prod,
  }).pipe(Alchemy.RemovalPolicy.retain(prod));

  const key = yield* Cloudflare.ApiToken.AccountApiToken('FilmStoreKey', {
    name: `${name} objects`,
    policies: [
      {
        effect: 'allow',
        permissionGroups: [
          'Workers R2 Storage Bucket Item Read',
          'Workers R2 Storage Bucket Item Write',
        ],
        resources: { [bucketResource(accountId, name)]: '*' },
      },
    ],
  });

  return { bucket, key, accountId };
});
