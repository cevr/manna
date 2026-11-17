/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a pack's strings written and read by plain splits. */

/** How many numbers a block holds. */
export const LEXICON_BLOCK = 500;

/** How many renderings an entry keeps: its top 6. */
export const RENDERS_KEPT = 6;

/** A rendering: a word as the KJV writes it, lower case, and how often the tags give it the number. */
export interface Render {
  word: string;
  count: number;
}

/** A lexicon entry as the pack keeps it. */
export interface LexiconLine {
  readonly lemma: string;
  readonly xlit: string;
  readonly pron: string;
  readonly def: string;
  readonly total: number;
  readonly renders: ReadonlyArray<Render>;
}

/** Where a number stands: its language's letter and its whole number. */
export interface NumberPlace {
  readonly letter: 'H' | 'G';
  readonly n: number;
}

/** `H25` or `G25` read as its letter and number; none for anything else. */
export const numberPlace = (number: string): NumberPlace | undefined => {
  const match = /^([HG])([1-9]\d{0,4})$/u.exec(number);
  if (match === null) return undefined;
  return { letter: match[1] === 'H' ? 'H' : 'G', n: Number(match[2]) };
};

const escaped = (field: string): string =>
  field.replace(/[\\\t\n]/gu, (ch) => (ch === '\\' ? '\\\\' : ch === '\t' ? '\\t' : '\\n'));

const unescaped = (field: string): string =>
  field.replace(/\\(.)/gu, (_, ch: string) => (ch === 't' ? '\t' : ch === 'n' ? '\n' : ch));

/** An entry's line. */
export const lexiconLineText = (line: LexiconLine): string =>
  [
    escaped(line.lemma),
    escaped(line.xlit),
    escaped(line.pron),
    escaped(line.def),
    String(line.total),
    line.renders.map((render) => `${render.word}:${render.count}`).join(','),
  ].join('\t');

/** A line read as its entry; none for an empty line. */
export const lexiconLineOf = (text: string): LexiconLine | undefined => {
  if (text === '') return undefined;
  const [lemma = '', xlit = '', pron = '', def = '', total = '0', renders = ''] = text.split('\t');
  return {
    lemma: unescaped(lemma),
    xlit: unescaped(xlit),
    pron: unescaped(pron),
    def: unescaped(def),
    total: Number(total),
    renders:
      renders === ''
        ? []
        : renders.split(',').map((pair) => {
            const at = pair.lastIndexOf(':');
            return { word: pair.slice(0, at), count: Number(pair.slice(at + 1)) };
          }),
  };
};

/** The lexicon's parts from each language's lines, by number from 1 (index 0 is H1 or G1). */
export const lexiconParts = (
  hebrew: ReadonlyArray<LexiconLine | undefined>,
  greek: ReadonlyArray<LexiconLine | undefined>,
): ReadonlyArray<string> => {
  const blocks = (lines: ReadonlyArray<LexiconLine | undefined>) => {
    const texts = lines.map((line) => (line === undefined ? '' : lexiconLineText(line)));
    return Array.from({ length: Math.ceil(texts.length / LEXICON_BLOCK) }, (_, index) =>
      texts.slice(index * LEXICON_BLOCK, (index + 1) * LEXICON_BLOCK).join('\n'),
    );
  };
  const first = blocks(hebrew);
  return [String(first.length), ...first, ...blocks(greek)];
};

/** Where `place`'s line is in the parts: the part's index and the line's within it; none outside them. */
export const linePlace = (
  parts: ReadonlyArray<string>,
  place: NumberPlace,
): readonly [number, number] | undefined => {
  const hebrew = Number(parts[0] ?? '0');
  const block = Math.floor((place.n - 1) / LEXICON_BLOCK);
  if (place.letter === 'H' && block >= hebrew) return undefined;
  const part = 1 + block + (place.letter === 'G' ? hebrew : 0);
  if (part >= parts.length) return undefined;
  return [part, (place.n - 1) % LEXICON_BLOCK];
};
