export type Citation =
  | {
      readonly _tag: 'scripture';
      readonly line: number;
      readonly reference: string;
      readonly quote: string;
    }
  | {
      readonly _tag: 'witness';
      readonly line: number;
      readonly kind: 'SOP' | 'PIONEER';
      readonly refcodes: readonly string[];
      readonly quote: string;
    };

export const WITNESS_WORD_LIMIT = 30;

const SCRIPTURE_LINE = /^\s*-\s+_([^_]+?)\._\s+"(.+?)"\s*(?:—|$)/;
const WITNESS_LINE = /^\s*\[(SOP|PIONEER)\s+([^\]]+)\]\s*"(.+?)"\s*(?:—|$)/;

const scriptureReference = (written: string): string =>
  written.trim().replace(/:(\d+),\s*(\d+)$/, ':$1-$2');

const witnessRefcodes = (kind: 'SOP' | 'PIONEER', body: string): readonly string[] => {
  if (kind === 'SOP') return [body.trim()];
  const parts = body.split(',');
  return parts.slice(1).map((_, index) =>
    parts
      .slice(index + 1)
      .join(',')
      .trim(),
  );
};

export const citationsIn = (markdown: string): readonly Citation[] =>
  markdown.split('\n').flatMap((text, index): Citation[] => {
    const line = index + 1;
    const scripture = text.match(SCRIPTURE_LINE);
    if (scripture?.[1] && scripture[2]) {
      return [
        {
          _tag: 'scripture',
          line,
          reference: scriptureReference(scripture[1]),
          quote: scripture[2],
        },
      ];
    }
    const witness = text.match(WITNESS_LINE);
    if (witness?.[1] && witness[2] && witness[3]) {
      let kind: 'SOP' | 'PIONEER' = 'PIONEER';
      if (witness[1] === 'SOP') kind = 'SOP';
      return [
        {
          _tag: 'witness',
          line,
          kind,
          refcodes: witnessRefcodes(kind, witness[2]),
          quote: witness[3],
        },
      ];
    }
    return [];
  });

const normalizeQuotation = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[[\]‹›¶]/g, '')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const quotationAppearsIn = (source: string, quote: string): boolean => {
  const haystack = normalizeQuotation(source);
  const pieces = quote
    .split(/\[[^\]]*\]/)
    .map(normalizeQuotation)
    .filter((piece) => piece.length > 0);
  let from = 0;
  for (const piece of pieces) {
    const at = haystack.indexOf(piece, from);
    if (at < 0) return false;
    from = at + piece.length;
  }
  return pieces.length > 0;
};

export const isSpliced = (quote: string): boolean => /\.\.\.|…/.test(quote);

export const quotedWordCount = (quote: string): number =>
  normalizeQuotation(quote.replace(/\[[^\]]*\]/g, ' '))
    .split(' ')
    .filter((word) => word.length > 0).length;
