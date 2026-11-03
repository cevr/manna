import { Option } from 'effect';

import { DIMENSIONS } from './vector-index.js';

export const QUERY_PREFIX = 'task: search result | query: ';
export const DOCUMENT_PREFIX = 'title: none | text: ';

export const truncateToMrl = (
  values: readonly number[] | Float32Array,
): Option.Option<Float32Array> => {
  if (values.length < DIMENSIONS) return Option.none();
  const out = new Float32Array(DIMENSIONS);
  let sum = 0;
  for (let axis = 0; axis < DIMENSIONS; axis += 1) {
    const value = values[axis] ?? 0;
    if (!Number.isFinite(value)) return Option.none();
    out[axis] = value;
    sum += value * value;
  }
  const norm = Math.sqrt(sum);
  if (norm === 0 || !Number.isFinite(norm)) return Option.none();
  for (let axis = 0; axis < DIMENSIONS; axis += 1) out[axis] = (out[axis] ?? 0) / norm;
  return Option.some(out);
};
