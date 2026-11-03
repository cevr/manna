const isSoftPunctuation = (character: string): boolean => character === ',' || character === ';';

const WHITESPACE = /\s/u;

export const isWhitespace = (character: string): boolean => WHITESPACE.test(character);

const isSeparator = (character: string): boolean =>
  isWhitespace(character) || isSoftPunctuation(character);

const FINAL_SIGMA = 'ς';
const MEDIAL_SIGMA = 'σ';

const foldCodePoint = (codePoint: string): string => {
  const lowered = codePoint.toLowerCase();
  if (lowered === FINAL_SIGMA) return MEDIAL_SIGMA;
  return lowered;
};

export interface NormalizedText {
  readonly text: string;
  readonly starts: Int32Array;
  readonly ends: Int32Array;
}

export const normalizeScan = (source: string): NormalizedText => {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingFrom = -1;
  let index = 0;
  for (const codePoint of source) {
    const from = index;
    index += codePoint.length;
    if (isSeparator(codePoint)) {
      if (text.length > 0 && pendingFrom < 0) pendingFrom = from;
      continue;
    }
    if (pendingFrom >= 0) {
      text += ' ';
      starts.push(pendingFrom);
      ends.push(from);
      pendingFrom = -1;
    }
    const folded = foldCodePoint(codePoint);
    text += folded;
    for (let unit = 0; unit < folded.length; unit += 1) {
      starts.push(from);
      ends.push(index);
    }
  }
  return { text, starts: Int32Array.from(starts), ends: Int32Array.from(ends) };
};

export const normalizeAlias = (alias: string): string => normalizeScan(alias).text;

const WORD_CHARACTER = /^[\p{L}\p{N}\p{M}]/u;

const isWordCharacter = (character: string): boolean => WORD_CHARACTER.test(character);

export const normalizedWords = (normalized: string): readonly string[] => {
  const found: string[] = [];
  let current = '';
  for (const codePoint of normalized) {
    if (isWordCharacter(codePoint)) {
      current += codePoint;
      continue;
    }
    if (current.length > 0) {
      found.push(current);
      current = '';
    }
  }
  if (current.length > 0) found.push(current);
  return found;
};

export const isBoundaryAt = (text: string, index: number): boolean => {
  if (index < 0 || index >= text.length) return true;
  const from = index - Number(isLowSurrogate(text.charCodeAt(index)));
  return !isWordCharacter(text.slice(from, from + 2));
};

const isLowSurrogate = (unit: number): boolean => unit >= 0xdc00 && unit <= 0xdfff;
