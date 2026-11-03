import { BunFileSystem } from '@effect/platform-bun';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Effect, FileSystem, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { VectorsArtifact } from '../search/vector-artifact.js';
import { CorpusSupplyInput, corpusGeneration } from '../corpus-supply/model.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import { layerNativeFileArtifacts, type NativeFileArtifactSource } from './file-artifact.js';

const digestOf = (bytes: string): string =>
  `sha256:${bytesToHex(sha256(new TextEncoder().encode(bytes)))}`;

const generationPath = (destination: string, bytes: string): string =>
  `${destination}.g-${digestOf(bytes).slice('sha256:'.length, 'sha256:'.length + 12)}`;

const sidecarPath = (filename: string): string => `${filename}.provenance.json`;

const hostFor = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly bytesFor: (url: string) => string;
}): Layer.Layer<CorpusSupply> =>
  CorpusSupply.layer.pipe(
    Layer.provide(
      layerNativeFileArtifacts({
        artifact: VectorsArtifact,
        destination: input.destination,
        sources: input.sources,
        layout: 'flat',
        fetch: (url) => Effect.succeed(new Response(input.bytesFor(url))),
        verify: () => Effect.succeed(1),
      }),
    ),
  );

const releaseAt = (input: {
  readonly url: string;
  readonly bytes: string;
  readonly revision: string;
  readonly generation?: number;
}): NativeFileArtifactSource => ({
  kind: 'release',
  url: input.url,
  revision: input.revision,
  digest: digestOf(input.bytes),
  size: input.bytes.length,
  generation: Option.map(Option.fromUndefinedOr(input.generation), corpusGeneration),
});

const VECTORS_TARGET = { _tag: 'file', corpus: 'vectors' } satisfies {
  readonly _tag: 'file';
  readonly corpus: 'vectors';
};

const ensureVectors = (host: Layer.Layer<CorpusSupply>) =>
  Effect.flatMap(CorpusSupply, (supply) =>
    supply.ensure(CorpusSupplyInput.make({ target: VECTORS_TARGET })),
  ).pipe(Effect.provide(host));

const ensureThenActiveFile = (host: Layer.Layer<CorpusSupply>) =>
  Effect.gen(function* () {
    const supply = yield* CorpusSupply;
    yield* supply.ensure(CorpusSupplyInput.make({ target: VECTORS_TARGET }));
    return yield* supply.activeFile('vectors');
  }).pipe(Effect.provide(host));

const readPointer = (host: Layer.Layer<CorpusSupply>) =>
  Effect.gen(function* () {
    const supply = yield* CorpusSupply;
    return {
      provenance: yield* supply.installed('vectors'),
      file: yield* supply.activeFile('vectors'),
    };
  }).pipe(Effect.provide(host));

const readInstalled = (host: Layer.Layer<CorpusSupply>) =>
  Effect.flatMap(CorpusSupply, (supply) => supply.installed('vectors')).pipe(Effect.provide(host));

const ensureThenReadPointer = (host: Layer.Layer<CorpusSupply>) =>
  Effect.gen(function* () {
    const supply = yield* CorpusSupply;
    const receipt = yield* supply.ensure(CorpusSupplyInput.make({ target: VECTORS_TARGET }));
    return {
      receipt,
      provenance: yield* supply.installed('vectors'),
      file: yield* supply.activeFile('vectors'),
    };
  }).pipe(Effect.provide(host));

const ensureThenReadInstalled = (host: Layer.Layer<CorpusSupply>) =>
  Effect.gen(function* () {
    const supply = yield* CorpusSupply;
    yield* supply.ensure(CorpusSupplyInput.make({ target: VECTORS_TARGET }));
    return yield* supply.installed('vectors');
  }).pipe(Effect.provide(host));

const installRuntimeRelease = (
  host: Layer.Layer<CorpusSupply>,
  release: {
    readonly url: string;
    readonly revision: string;
    readonly digest: string;
    readonly size: number;
    readonly generation: Option.Option<ReturnType<typeof corpusGeneration>>;
  },
) =>
  Effect.flatMap(CorpusSupply, (supply) => supply.installFrom({ corpus: 'vectors', release })).pipe(
    Effect.provide(host),
  );

const RUNTIME_BYTES = 'the runtime generation four index';
const PIN_BYTES = 'the compiled pin generation three index';

describe('§3.6 flat artifact activation', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  test('activates a versioned file behind one pointer', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;

      const active = yield* ensureThenActiveFile(
        hostFor({
          destination,
          sources: [
            releaseAt({
              url: 'https://example.test/vectors.bvi',
              bytes: RUNTIME_BYTES,
              revision: 'vectors-v4',
              generation: 4,
            }),
          ],
          bytesFor: () => RUNTIME_BYTES,
        }),
      );

      const versioned = generationPath(destination, RUNTIME_BYTES);
      expect(Option.getOrUndefined(active)).toBe(versioned);
      expect(yield* fs.readFileString(versioned)).toBe(RUNTIME_BYTES);
      expect(yield* fs.exists(sidecarPath(destination))).toBe(true);
      expect(yield* fs.exists(destination)).toBe(false);
    }));

  test('a torn install reports the generation the pointer still names', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;
      const pinned = releaseAt({
        url: 'https://example.test/pin.bvi',
        bytes: PIN_BYTES,
        revision: 'vectors-v3',
        generation: 3,
      });

      const host = hostFor({ destination, sources: [pinned], bytesFor: () => PIN_BYTES });
      yield* ensureVectors(host);

      yield* fs.writeFileString(generationPath(destination, RUNTIME_BYTES), RUNTIME_BYTES);

      const torn = yield* readPointer(host);

      expect(Option.getOrUndefined(Option.map(torn.provenance, (p) => String(p.revision)))).toBe(
        'vectors-v3',
      );
      expect(
        Option.getOrUndefined(
          Option.flatMap(torn.provenance, (p) => Option.map(p.generation, Number)),
        ),
      ).toBe(3);
      expect(Option.getOrUndefined(torn.file)).toBe(generationPath(destination, PIN_BYTES));
    }));

  test('a pointer whose file does not match its digest reports no generation', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;
      const pinned = releaseAt({
        url: 'https://example.test/pin.bvi',
        bytes: PIN_BYTES,
        revision: 'vectors-v3',
        generation: 3,
      });
      const host = hostFor({ destination, sources: [pinned], bytesFor: () => PIN_BYTES });

      yield* ensureVectors(host);

      yield* fs.writeFileString(generationPath(destination, PIN_BYTES), 'not that generation');

      const provenance = yield* readInstalled(host);

      expect(Option.isNone(provenance)).toBe(true);
    }));

  test('startup does not re-floor a runtime generation with an older pin', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;

      yield* installRuntimeRelease(
        hostFor({ destination, sources: [], bytesFor: () => RUNTIME_BYTES }),
        {
          url: 'https://example.test/runtime.bvi',
          revision: 'vectors-v4',
          digest: digestOf(RUNTIME_BYTES),
          size: RUNTIME_BYTES.length,
          generation: Option.some(corpusGeneration(4)),
        },
      );

      const restarted = hostFor({
        destination,
        sources: [
          releaseAt({
            url: 'https://example.test/pin.bvi',
            bytes: PIN_BYTES,
            revision: 'vectors-v3',
            generation: 3,
          }),
        ],
        bytesFor: () => PIN_BYTES,
      });
      const after = yield* ensureThenReadPointer(restarted);

      expect(after.receipt.activated).toEqual([]);
      expect(
        Option.getOrUndefined(
          Option.flatMap(after.provenance, (p) => Option.map(p.generation, Number)),
        ),
      ).toBe(4);
      expect(Option.getOrUndefined(after.file)).toBe(generationPath(destination, RUNTIME_BYTES));
      expect(yield* fs.readFileString(generationPath(destination, RUNTIME_BYTES))).toBe(
        RUNTIME_BYTES,
      );
      expect(yield* fs.exists(generationPath(destination, PIN_BYTES))).toBe(false);
    }));

  test('a local source does not replace a runtime generation', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;
      const packaged = `${directory}/packaged.bvi`;
      yield* fs.writeFileString(packaged, PIN_BYTES);

      yield* installRuntimeRelease(
        hostFor({ destination, sources: [], bytesFor: () => RUNTIME_BYTES }),
        {
          url: 'https://example.test/runtime.bvi',
          revision: 'vectors-v4',
          digest: digestOf(RUNTIME_BYTES),
          size: RUNTIME_BYTES.length,
          generation: Option.some(corpusGeneration(4)),
        },
      );

      const after = yield* ensureThenReadInstalled(
        hostFor({
          destination,
          sources: [{ kind: 'packaged', path: packaged, label: 'packaged' }],
          bytesFor: () => PIN_BYTES,
        }),
      );

      expect(Option.getOrUndefined(Option.map(after, (p) => String(p.revision)))).toBe(
        'vectors-v4',
      );
    }));

  test('a pin above the installed generation still installs', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;

      yield* installRuntimeRelease(
        hostFor({ destination, sources: [], bytesFor: () => PIN_BYTES }),
        {
          url: 'https://example.test/old.bvi',
          revision: 'vectors-v3',
          digest: digestOf(PIN_BYTES),
          size: PIN_BYTES.length,
          generation: Option.some(corpusGeneration(3)),
        },
      );

      const after = yield* ensureThenReadInstalled(
        hostFor({
          destination,
          sources: [
            releaseAt({
              url: 'https://example.test/new.bvi',
              bytes: RUNTIME_BYTES,
              revision: 'vectors-v5',
              generation: 5,
            }),
          ],
          bytesFor: () => RUNTIME_BYTES,
        }),
      );

      expect(Option.getOrUndefined(Option.map(after, (p) => String(p.revision)))).toBe(
        'vectors-v5',
      );
      expect(yield* fs.exists(generationPath(destination, PIN_BYTES))).toBe(false);
    }));
});
