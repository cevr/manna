import { Config, Option, type Layer } from 'effect';

import type { QueryEmbedder } from './embedder.js';
import { bibleHomeModelsFallback, layerTransformersEmbedder } from './embedder-transformers.js';

export const layerBunEmbedder: Layer.Layer<QueryEmbedder> = layerTransformersEmbedder({
  adapter: 'bun',
  device: 'cpu',
  fallbackCacheDir: bibleHomeModelsFallback,
});

export const layerBunEmbedderWithCache = (cacheDirectory: string): Layer.Layer<QueryEmbedder> =>
  layerTransformersEmbedder({
    adapter: 'bun',
    device: 'cpu',
    fallbackCacheDir: Config.succeed(Option.some(cacheDirectory)),
  });
