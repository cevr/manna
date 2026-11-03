import { Array as Arr, Option, Schema } from 'effect';

export const MODEL_FINGERPRINT =
  'EmbeddingGemma-300M/sentence-embedding/retrieval/256d-mrl/int8-fixed';

export const DIMENSIONS = 256;

const FORMAT_MAJOR = 1;

const MAGIC = 'BVI1';
const MAGIC_BYTES = 4;
const HEADER_BYTES = MAGIC_BYTES + 2 + 2 + 4 + 2 + 4;

export class VectorBookRange extends Schema.Class<VectorBookRange>('Search/VectorBookRange')({
  bookCode: Schema.NonEmptyString,
  offset: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  count: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
}) {}

export class VectorManifest extends Schema.Class<VectorManifest>('Search/VectorManifest')({
  books: Schema.Array(VectorBookRange),
  paragraphIds: Schema.Array(Schema.NonEmptyString),
}) {}

type VectorIndexFault =
  | { readonly _tag: 'malformed'; readonly detail: string }
  | { readonly _tag: 'fingerprint'; readonly found: string };

export interface VectorIndex {
  readonly fingerprint: string;
  readonly dimensions: number;
  readonly count: number;
  readonly manifest: VectorManifest;
  readonly vectors: Int8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const malformed = (detail: string): VectorIndexFault => ({ _tag: 'malformed', detail });

const decodeManifest = Schema.decodeUnknownOption(Schema.fromJsonString(VectorManifest));
const encodeManifest = Schema.encodeSync(Schema.fromJsonString(VectorManifest));

const quoted = Schema.encodeSync(Schema.fromJsonString(Schema.String));

const relationAt = (offset: number, cursor: number): string => {
  if (offset > cursor) return 'gap';
  return 'overlap';
};

const validateManifest = (
  manifest: VectorManifest,
  count: number,
): Option.Option<VectorIndexFault> => {
  if (manifest.paragraphIds.length !== count) {
    return Option.some(
      malformed(`manifest names ${manifest.paragraphIds.length} ids for ${count} vectors`),
    );
  }
  const unique = new Set(manifest.paragraphIds);
  if (unique.size !== manifest.paragraphIds.length) {
    return Option.some(
      malformed(`manifest repeats ids: ${manifest.paragraphIds.length - unique.size} duplicates`),
    );
  }
  const sorted = [...manifest.books].sort((left, right) => left.offset - right.offset);
  let cursor = 0;
  for (const book of sorted) {
    if (book.offset !== cursor) {
      const relation = relationAt(book.offset, cursor);
      return Option.some(
        malformed(
          `${relation} at vector ${cursor}: ${quoted(book.bookCode)} starts at ${book.offset}`,
        ),
      );
    }
    cursor += book.count;
    if (cursor > count) {
      return Option.some(
        malformed(`${quoted(book.bookCode)} ends at ${cursor}, past the ${count} vectors`),
      );
    }
  }
  if (cursor !== count) {
    return Option.some(malformed(`books cover ${cursor} of ${count} vectors`));
  }
  return Option.none();
};

export const parseVectorIndex = (
  buffer: ArrayBuffer,
): { readonly _tag: 'ok'; readonly index: VectorIndex } | (VectorIndexFault & { _tag: string }) => {
  if (buffer.byteLength < HEADER_BYTES) return malformed('shorter than the header');
  const view = new DataView(buffer);
  const magic = decoder.decode(new Uint8Array(buffer, 0, MAGIC_BYTES));
  if (magic !== MAGIC) return malformed(`magic ${quoted(magic)}`);

  const formatMajor = view.getUint16(MAGIC_BYTES, true);
  if (formatMajor !== FORMAT_MAJOR) return malformed(`format major ${formatMajor}`);

  const dimensions = view.getUint16(MAGIC_BYTES + 2, true);
  if (dimensions !== DIMENSIONS) return malformed(`dimensions ${dimensions}`);

  const count = view.getUint32(MAGIC_BYTES + 4, true);
  const fingerprintLen = view.getUint16(MAGIC_BYTES + 8, true);
  const manifestLen = view.getUint32(MAGIC_BYTES + 10, true);

  const fingerprintAt = HEADER_BYTES;
  const manifestAt = fingerprintAt + fingerprintLen;
  const vectorsAt = manifestAt + manifestLen;
  const vectorBytes = count * dimensions;
  const expected = vectorsAt + vectorBytes;
  if (buffer.byteLength !== expected) {
    return malformed(`length ${buffer.byteLength} bytes, ${expected} expected`);
  }

  const fingerprint = decoder.decode(new Uint8Array(buffer, fingerprintAt, fingerprintLen));
  if (fingerprint !== MODEL_FINGERPRINT) return { _tag: 'fingerprint', found: fingerprint };

  const manifest = decodeManifest(decoder.decode(new Uint8Array(buffer, manifestAt, manifestLen)));
  if (Option.isNone(manifest)) return malformed('manifest is not a VectorManifest');
  const fault = validateManifest(manifest.value, count);
  if (Option.isSome(fault)) return fault.value;

  return {
    _tag: 'ok',
    index: {
      fingerprint,
      dimensions,
      count,
      manifest: manifest.value,
      vectors: new Int8Array(buffer.slice(vectorsAt, vectorsAt + vectorBytes)),
    },
  };
};

export const encodeVectorIndex = (input: {
  readonly fingerprint: string;
  readonly manifest: VectorManifest;
  readonly vectors: Int8Array;
}): ArrayBuffer => {
  const fingerprint = encoder.encode(input.fingerprint);
  const manifest = encoder.encode(encodeManifest(input.manifest));
  const count = input.manifest.paragraphIds.length;
  const total = HEADER_BYTES + fingerprint.byteLength + manifest.byteLength + count * DIMENSIONS;
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  bytes.set(encoder.encode(MAGIC), 0);
  view.setUint16(MAGIC_BYTES, FORMAT_MAJOR, true);
  view.setUint16(MAGIC_BYTES + 2, DIMENSIONS, true);
  view.setUint32(MAGIC_BYTES + 4, count, true);
  view.setUint16(MAGIC_BYTES + 8, fingerprint.byteLength, true);
  view.setUint32(MAGIC_BYTES + 10, manifest.byteLength, true);

  const fingerprintAt = HEADER_BYTES;
  const manifestAt = fingerprintAt + fingerprint.byteLength;
  bytes.set(fingerprint, fingerprintAt);
  bytes.set(manifest, manifestAt);
  bytes.set(
    new Uint8Array(input.vectors.buffer, input.vectors.byteOffset, count * DIMENSIONS),
    manifestAt + manifest.byteLength,
  );
  return buffer;
};

interface VectorNeighbor {
  readonly paragraphId: string;
  readonly similarity: number;
}

interface VectorScan {
  readonly neighbors: readonly VectorNeighbor[];
  readonly scanned: number;
}

export const scanVectorIndex = (
  index: VectorIndex,
  query: Int8Array,
  options: {
    readonly topK: number;
    readonly allow?: ReadonlySet<string>;
    readonly scoreRange?: ScoreRange;
  },
): VectorScan => {
  if (query.length !== index.dimensions) return { neighbors: [], scanned: 0 };
  const ranges = rangesFor(index, Option.fromNullishOr(options.allow));
  const selection: Selection = {
    best: [],
    topK: options.topK,
    floor: Number.NEGATIVE_INFINITY,
    scanned: 0,
  };

  const accelerate = Option.fromNullishOr(options.scoreRange);
  if (Option.isSome(accelerate)) {
    scanAccelerated(index, query, ranges, accelerate.value, selection);
    if (selection.scanned > 0) return { neighbors: selection.best, scanned: selection.scanned };
  }

  scanPure(index, query, ranges, selection);
  return { neighbors: selection.best, scanned: selection.scanned };
};

interface ScanRange {
  readonly offset: number;
  readonly count: number;
}

type ScoreRange = (query: Int8Array, offset: number, count: number, out: Int32Array) => number;

interface Selection {
  readonly best: VectorNeighbor[];
  readonly topK: number;
  floor: number;
  scanned: number;
}

const admit = (
  best: VectorNeighbor[],
  ids: readonly string[],
  row: number,
  similarity: number,
  topK: number,
  floor: number,
): number => {
  const paragraphId = Arr.get(ids, row);
  if (Option.isNone(paragraphId)) return floor;
  insert(best, { paragraphId: paragraphId.value, similarity }, topK);
  if (best.length !== topK) return floor;
  return Option.match(Arr.last(best), {
    onNone: () => floor,
    onSome: (worst) => worst.similarity,
  });
};

const scanAccelerated = (
  index: VectorIndex,
  query: Int8Array,
  ranges: readonly ScanRange[],
  scoreRange: ScoreRange,
  selection: Selection,
): void => {
  const ids = index.manifest.paragraphIds;
  const { best, topK } = selection;
  let floor = selection.floor;
  let scanned = selection.scanned;
  const widest = ranges.reduce((most, range) => Math.max(most, range.count), 0);
  const scores = new Int32Array(widest);
  for (const range of ranges) {
    const wrote = scoreRange(query, range.offset, range.count, scores);
    if (wrote !== range.count) break;
    for (let offset = 0; offset < range.count; offset += 1) {
      scanned += 1;
      const sum = scores[offset] ?? 0;
      if (best.length === topK && sum <= floor) continue;
      floor = admit(best, ids, range.offset + offset, sum, topK, floor);
    }
  }
  selection.floor = floor;
  selection.scanned = scanned;
};

const scanPure = (
  index: VectorIndex,
  query: Int8Array,
  ranges: readonly ScanRange[],
  selection: Selection,
): void => {
  for (const range of ranges) scanPureRange(index, query, range, selection);
};

const scanPureRange = (
  index: VectorIndex,
  query: Int8Array,
  range: ScanRange,
  selection: Selection,
): void => {
  const dimensions = index.dimensions;
  const vectors = index.vectors;
  const ids = index.manifest.paragraphIds;
  const { best, topK } = selection;
  let floor = selection.floor;
  let scanned = selection.scanned;
  const end = range.offset + range.count;
  for (let row = range.offset; row < end; row += 1) {
    scanned += 1;
    const base = row * dimensions;
    let sum0 = 0;
    let sum1 = 0;
    let sum2 = 0;
    let sum3 = 0;
    const unrolled = dimensions - (dimensions % 4);
    for (let axis = 0; axis < unrolled; axis += 4) {
      sum0 += (vectors[base + axis] ?? 0) * (query[axis] ?? 0);
      sum1 += (vectors[base + axis + 1] ?? 0) * (query[axis + 1] ?? 0);
      sum2 += (vectors[base + axis + 2] ?? 0) * (query[axis + 2] ?? 0);
      sum3 += (vectors[base + axis + 3] ?? 0) * (query[axis + 3] ?? 0);
    }
    let sum = sum0 + sum1 + sum2 + sum3;
    for (let axis = unrolled; axis < dimensions; axis += 1) {
      sum += (vectors[base + axis] ?? 0) * (query[axis] ?? 0);
    }
    if (best.length === topK && sum <= floor) continue;
    floor = admit(best, ids, row, sum, topK, floor);
  }
  selection.floor = floor;
  selection.scanned = scanned;
};

const rangesFor = (
  index: VectorIndex,
  allow: Option.Option<ReadonlySet<string>>,
): readonly ScanRange[] =>
  Option.match(allow, {
    onNone: () => [{ offset: 0, count: index.count }],
    onSome: (codes) => index.manifest.books.filter((book) => codes.has(book.bookCode)),
  });

const insert = (best: VectorNeighbor[], candidate: VectorNeighbor, topK: number): void => {
  let at = best.length;
  while (at > 0 && (best[at - 1]?.similarity ?? 0) < candidate.similarity) at -= 1;
  best.splice(at, 0, candidate);
  if (best.length > topK) best.length = topK;
};

export const QUANTIZATION_SCALE = 127;

export const quantize = (values: readonly number[] | Float32Array): Int8Array => {
  const out = new Int8Array(values.length);
  for (let axis = 0; axis < values.length; axis += 1) {
    const scaled = Math.round((values[axis] ?? 0) * QUANTIZATION_SCALE);
    out[axis] = Math.max(-127, Math.min(127, scaled));
  }
  return out;
};
