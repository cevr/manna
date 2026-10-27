/** The Bun (CLI) query embedder: native ONNX CPU (§9.5).
 *
 *  A device choice and nothing else. Everything that decides what a query vector
 *  *is* — the model, the MRL truncation, the quantization — lives in
 *  `embedder-transformers.ts`, shared with the vector compiler in
 *  `packages/scripts`, so query vectors and indexed vectors cannot be spelled
 *  two ways.
 *
 *  `cpu` rather than any accelerator: §9.5 measures the native CPU path at tens
 *  of milliseconds with the model resident, which is well inside a CLI's budget,
 *  and a GPU provider would be a second execution path to reconcile.
 */

import { Config, Option, type Layer } from 'effect';

import type { QueryEmbedder } from './embedder.js';
import { bibleHomeModelsFallback, layerTransformersEmbedder } from './embedder-transformers.js';

export const layerBunEmbedder: Layer.Layer<QueryEmbedder> = layerTransformersEmbedder({
  adapter: 'bun',
  device: 'cpu',
  fallbackCacheDir: bibleHomeModelsFallback,
});

/** Build hosts select a workspace cache; BIBLE_MODEL_CACHE still wins in the loader. */
export const layerBunEmbedderWithCache = (cacheDirectory: string): Layer.Layer<QueryEmbedder> =>
  layerTransformersEmbedder({
    adapter: 'bun',
    device: 'cpu',
    fallbackCacheDir: Config.succeed(Option.some(cacheDirectory)),
  });
