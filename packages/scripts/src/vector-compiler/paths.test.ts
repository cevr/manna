import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Path } from 'effect';
import { expect, it } from 'effect-bun-test';

/* oxlint-disable effect/noGlobals -- Bundler and child-process boundary; JSON carries synthetic receipts only. */

// Replace only the external model package at the bundler boundary. All cache
// selection, lazy loading, quantization and layer composition remain production code.
const fakeTransformers = `
export const env = { cacheDir: 'library-default' };
export const AutoTokenizer = { from_pretrained: async () => async () => ({}) };
export const AutoModel = { from_pretrained: async () => async () => ({
  sentence_embedding: { dims: [1, 768], data: new Float32Array(768).fill(1) }
}) };
`;

const probeSource = (pathsModule: string) => `
import { ConfigProvider, Effect } from 'effect';
import { QueryEmbedder } from '@manna/core/search';
import { vectorBuildEmbedder } from ${JSON.stringify(pathsModule)};
import { env } from '@huggingface/transformers';
const receipts = [];
for (const home of [undefined, '/synthetic home Ω']) {
  for (const override of [undefined, '/chosen model cache Ω']) {
    const config = {};
    if (home !== undefined) config.HOME = home;
    if (override !== undefined) config.BIBLE_MODEL_CACHE = override;
    env.cacheDir = 'library-default';
    const vector = await Effect.runPromise(
      Effect.flatMap(QueryEmbedder, embedder => embedder.embedDocument('synthetic paragraph')).pipe(
        Effect.provide(vectorBuildEmbedder),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(config)))
      )
    );
    receipts.push({ cache: env.cacheDir, dimensions: vector.length });
  }
}
console.log(JSON.stringify(receipts));
`;

it.scopedLive(
  'vector build supplies a workspace cache independent of HOME and honors explicit model caches',
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'vector-cache-' });
      const home = path.join(root, 'empty home Ω');
      yield* fs.makeDirectory(home);
      // Keep the entry beside the real package for normal workspace resolution;
      // the bundler receives its bytes through a virtual module, never a repo file.
      const entry = path.join(import.meta.dir, 'cache-probe.ts');
      const bundle = path.join(root, 'probe.js');
      const result = yield* Effect.promise(() =>
        Bun.build({
          entrypoints: [entry],
          target: 'bun',
          // Preserve source-relative workspace paths when relocating the probe bundle.
          define: {
            'import.meta.url': JSON.stringify(new URL('./paths.ts', import.meta.url).href),
          },
          plugins: [
            {
              name: 'synthetic-model-boundary',
              setup(build) {
                build.onResolve({ filter: /cache-probe\.ts$/u }, () => ({
                  path: entry,
                  namespace: 'probe',
                }));
                build.onLoad({ filter: /.*/u, namespace: 'probe' }, () => ({
                  contents: probeSource(path.join(import.meta.dir, 'paths.ts')),
                  loader: 'ts',
                  resolveDir: import.meta.dir,
                }));
                build.onResolve({ filter: /^@huggingface\/transformers$/u }, () => ({
                  path: 'model',
                  namespace: 'synthetic',
                }));
                build.onLoad({ filter: /.*/u, namespace: 'synthetic' }, () => ({
                  contents: fakeTransformers,
                  loader: 'js',
                }));
              },
            },
          ],
        }),
      );
      expect(result.success).toBe(true);
      const output = result.outputs[0];
      expect(output).toBeDefined();
      if (!output) return;
      yield* fs.writeFileString(bundle, yield* Effect.promise(() => output.text()));
      const run = Bun.spawnSync([process.execPath, bundle], {
        env: { ...process.env, HOME: home },
      });
      expect(run.exitCode).toBe(0);
      expect(new TextDecoder().decode(run.stdout).trim()).toBe(
        JSON.stringify([
          {
            cache: path.resolve(import.meta.dir, '../../../core/node_modules/.cache/bible-models'),
            dimensions: 256,
          },
          { cache: '/chosen model cache Ω', dimensions: 256 },
          {
            cache: path.resolve(import.meta.dir, '../../../core/node_modules/.cache/bible-models'),
            dimensions: 256,
          },
          { cache: '/chosen model cache Ω', dimensions: 256 },
        ]),
      );
      expect(yield* fs.readDirectory(home)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
);
