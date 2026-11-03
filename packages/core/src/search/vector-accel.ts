/* oxlint-disable effect/noUnsafeDictionaryType, effect/noAs, effect/noRuntimeTypeof, effect/noDynamicImports, effect/noGlobals -- this file is the host boundary for two foreign module systems.
 *
 * `bun:ffi` and `WebAssembly.Instance` both hand back untyped symbol tables:
 * the shapes are fixed by the C sources next door, not by anything TypeScript
 * can see, and there is no schema to decode them from — a `dlopen` symbol is a
 * function pointer, not data. So the contract is *asserted* here, once, at the
 * one place the artifacts are loaded, and everything downstream of
 * `VectorAccel` is ordinary typed code.
 *
 * The dynamic import is load-bearing rather than stylistic: `bun:ffi` does not
 * exist in a browser or Electron renderer build, and a static import would be
 * followed by the bundler on exactly the hosts this file is designed to skip.
 * `fetch` is the artifact read for those same hosts, which have no filesystem.
 */

import { Data, Effect, Match, Option, Schema } from 'effect';

class AccelUnavailable extends Data.TaggedError('AccelUnavailable')<{
  readonly tier: string;
}> {}

const VectorAccelKind = Schema.Literals(['neon', 'avx2', 'wasm']);
type VectorAccelKind = typeof VectorAccelKind.Type;

const kindForIsa = (isa: number): Option.Option<VectorAccelKind> => {
  if (isa === 1) return Option.some('avx2');
  if (isa === 2) return Option.some('neon');
  if (isa === 3) return Option.some('wasm');
  return Option.none();
};

interface VectorAccel {
  readonly kind: VectorAccelKind;
  readonly scoreRange: (query: Int8Array, offset: number, count: number, out: Int32Array) => number;
}

interface AccelTarget {
  readonly vectors: Int8Array;
  readonly dimensions: number;
  readonly count: number;
}

interface FfiModule {
  readonly dlopen: (
    path: string,
    symbols: Record<string, { readonly args: readonly unknown[]; readonly returns: unknown }>,
  ) => { readonly symbols: Record<string, (...args: readonly number[]) => number> };
  readonly FFIType: Record<string, unknown>;
  readonly ptr: (view: ArrayBufferView) => number;
}

const artifactUrl = (file: string): URL => new URL(`../../dist-native/${file}`, import.meta.url);

const nativeFilenames = (): readonly string[] => {
  const runtime = Option.fromNullishOr(globalThis.process);
  const platform = Option.match(runtime, {
    onNone: () => 'linux',
    onSome: (process) => process.platform,
  });
  const arch = Option.match(runtime, {
    onNone: () => 'x64',
    onSome: (process) => process.arch,
  });
  if (platform === 'darwin') return ['vector-scan.dylib'];
  if (platform === 'win32') return ['vector-scan.dll'];
  const triple = Match.value(arch).pipe(
    Match.when('arm64', () => 'aarch64-linux-gnu'),
    Match.orElse(() => 'x86_64-linux-gnu'),
  );
  return ['vector-scan.so', `vector-scan-${triple}.so`];
};

const loadNative = (target: AccelTarget): Effect.Effect<Option.Option<VectorAccel>> =>
  Effect.gen(function* () {
    const moduleName = 'bun:ffi';
    const ffi = yield* Effect.tryPromise({
      try: () => import(moduleName) as Promise<FfiModule>,
      catch: () => new AccelUnavailable({ tier: 'ffi' }),
    });
    const type = (name: string): unknown => ffi.FFIType[name];
    const symbols = {
      vector_scan_range: {
        args: [type('ptr'), type('ptr'), type('i32'), type('i32'), type('i32'), type('ptr')],
        returns: type('i32'),
      },
      vector_scan_isa: { args: [], returns: type('i32') },
    };
    const lib = yield* Effect.firstSuccessOf(
      nativeFilenames().map((file) =>
        Effect.try({
          try: () => ffi.dlopen(artifactUrl(file).pathname, symbols),
          catch: () => new AccelUnavailable({ tier: 'ffi' }),
        }),
      ),
    );

    const isaSymbol = Option.fromNullishOr(lib.symbols['vector_scan_isa']);
    const rangeSymbol = Option.fromNullishOr(lib.symbols['vector_scan_range']);
    if (Option.isNone(isaSymbol) || Option.isNone(rangeSymbol)) return Option.none<VectorAccel>();

    const kind = kindForIsa(isaSymbol.value());
    if (Option.isNone(kind) || kind.value === 'wasm') return Option.none<VectorAccel>();

    const scoreRange = rangeSymbol.value;
    const vectorsPtr = ffi.ptr(target.vectors);
    return Option.some<VectorAccel>({
      kind: kind.value,
      scoreRange: (query, offset, count, out) =>
        scoreRange(vectorsPtr, ffi.ptr(query), target.dimensions, offset, count, ffi.ptr(out)),
    });
  }).pipe(Effect.catchCause(() => Effect.succeed(Option.none<VectorAccel>())));

const readArtifact = (url: URL): Effect.Effect<Option.Option<ArrayBuffer>> =>
  Effect.gen(function* () {
    const bun = Option.fromNullishOr(globalThis.Bun);
    if (Option.isSome(bun)) {
      const file = bun.value.file(url.pathname);
      const present = yield* Effect.promise(() => file.exists());
      if (!present) return Option.none<ArrayBuffer>();
      return Option.some(yield* Effect.promise(() => file.arrayBuffer()));
    }
    const response = yield* Effect.promise(() => fetch(url));
    if (!response.ok) return Option.none<ArrayBuffer>();
    return Option.some(yield* Effect.promise(() => response.arrayBuffer()));
  }).pipe(Effect.catchCause(() => Effect.succeed(Option.none<ArrayBuffer>())));

const WASM_PAGE_BYTES = 65_536;

const WASM_MINIMUM_PAGES = 16;

const loadWasm = (target: AccelTarget): Effect.Effect<Option.Option<VectorAccel>> =>
  Effect.gen(function* () {
    const bytes = yield* readArtifact(artifactUrl('vector-scan.wasm'));
    if (Option.isNone(bytes)) return Option.none<VectorAccel>();

    const vectorsAt = WASM_PAGE_BYTES;
    const queryAt = vectorsAt + target.vectors.byteLength;
    const scoresAt = queryAt + target.dimensions;
    const needed = scoresAt + target.count * 4;
    const pages = Math.max(WASM_MINIMUM_PAGES, Math.ceil(needed / WASM_PAGE_BYTES));
    const memory = new WebAssembly.Memory({ initial: pages });

    const instantiated = yield* Effect.promise(() =>
      WebAssembly.instantiate(bytes.value, { env: { memory } }),
    );
    const exports = instantiated.instance.exports;
    const range = Option.fromNullishOr(exports['vector_scan_range']);
    if (Option.isNone(range) || typeof range.value !== 'function') {
      return Option.none<VectorAccel>();
    }
    const call = range.value as (...args: readonly number[]) => number;

    const heap = new Uint8Array(memory.buffer);
    heap.set(target.vectors, vectorsAt);

    return Option.some<VectorAccel>({
      kind: 'wasm',
      scoreRange: (query, offset, count, out) => {
        heap.set(query, queryAt);
        const wrote = call(vectorsAt, queryAt, target.dimensions, offset, count, scoresAt);
        out.set(new Int32Array(memory.buffer, scoresAt, wrote), 0);
        return wrote;
      },
    });
  }).pipe(Effect.catchCause(() => Effect.succeed(Option.none<VectorAccel>())));

let resolved: Option.Option<{
  readonly vectors: Int8Array;
  readonly accel: Option.Option<VectorAccel>;
}> = Option.none();

let priming = false;

export const resolvedFor = (target: AccelTarget): Option.Option<Option.Option<VectorAccel>> =>
  Option.map(
    Option.filter(resolved, (entry) => entry.vectors === target.vectors),
    (entry) => entry.accel,
  );

export const readyVectorAccel = (target: AccelTarget): Option.Option<VectorAccel> =>
  Option.flatten(resolvedFor(target));

export const primeVectorAccel = (target: AccelTarget): void => {
  if (Option.isSome(resolvedFor(target)) || priming) return;
  priming = true;
  Effect.runPromise(
    vectorAccel(target).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          priming = false;
        }),
      ),
    ),
  );
};

export const vectorAccel = (target: AccelTarget): Effect.Effect<Option.Option<VectorAccel>> =>
  Effect.gen(function* () {
    const held = resolvedFor(target);
    if (Option.isSome(held)) return held.value;
    const native = yield* loadNative(target);
    const chosen = yield* Option.match(native, {
      onNone: () => loadWasm(target),
      onSome: (ready) => Effect.succeedSome(ready),
    });
    resolved = Option.some({ vectors: target.vectors, accel: chosen });
    return chosen;
  });

export const resetVectorAccel = (): void => {
  resolved = Option.none();
  priming = false;
};
