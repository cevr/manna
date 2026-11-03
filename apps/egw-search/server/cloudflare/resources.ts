import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Effect } from 'effect';

const FILTERED_PROPERTIES = ['book', 'section', 'type', 'subtype'] as const;

const shared = <A, R>(resource: Effect.Effect<A, never, R>) =>
  resource.pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());

export const Corpus = Cloudflare.D1.Database('Corpus', { name: 'egw-corpus' }).pipe(shared);

export const Vectors = Cloudflare.Vectorize.Index('Vectors', {
  name: 'egw-paragraphs',
  dimensions: 256,
  metric: 'cosine',
  description: 'EGW paragraphs, embeddinggemma-300m first 256 dims',
}).pipe(shared);

export const VectorFilters = Effect.forEach(FILTERED_PROPERTIES, (property) =>
  Cloudflare.Vectorize.MetadataIndex(`VectorFilter-${property}`, {
    indexName: 'egw-paragraphs',
    propertyName: property,
    indexType: 'string',
  }).pipe(shared),
);

export const SyncReports = Cloudflare.R2.Bucket('SyncReports', { name: 'egw-sync-reports' }).pipe(
  shared,
);
