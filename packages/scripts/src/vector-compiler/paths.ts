import { layerBunEmbedderWithCache } from '@manna/core/search/bun';
import { fileURLToPath } from 'node:url';

export const vectorBuildEmbedder = layerBunEmbedderWithCache(
  fileURLToPath(new URL('../../../core/node_modules/.cache/bible-models', import.meta.url)),
);
