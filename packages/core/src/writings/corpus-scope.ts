import { Schema } from 'effect';

export const CorpusScope = Schema.Literals(['egw', 'pioneer', 'all']);
export type CorpusScope = typeof CorpusScope.Type;

export const isCorpusScope = Schema.is(CorpusScope);

export const EGW_SCOPE_AUTHORS: readonly [string, string] = [
  'Ellen Gould White',
  'Ellen G. White Estate',
];
