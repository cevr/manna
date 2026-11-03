import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';

import { HYMNS_HOST } from '../src/remote.ts';

export const Hymns = Cloudflare.R2.Bucket('Hymns', {
  name: 'cvr-hymns',
  domains: [{ name: HYMNS_HOST }],
  publicAccess: false,
  cors: [
    {
      allowedMethods: ['GET', 'HEAD'],
      allowedOrigins: ['*'],
      allowedHeaders: ['range'],
      exposeHeaders: ['content-length', 'content-range', 'etag', 'accept-ranges'],
    },
  ],
}).pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());
