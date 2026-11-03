import { Option } from 'effect';

export const WORDY_WORD_THRESHOLD = 3;

const REFCODE = /^([A-Za-z0-9]{1,8})\s+(\d{1,4})(?:\.(\d{1,3}))?$/u;

const hasLetter = /[A-Za-z]/u;

const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ['“', '”'],
  ['‘', '’'],
  ["'", "'"],
];

export type RoutedQuery =
  | {
      readonly _tag: 'phrase';
      readonly phrase: string;
    }
  | {
      readonly _tag: 'locate';
      readonly refcode: string;
    }
  | {
      readonly _tag: 'hybrid';
      readonly text: string;
      readonly wordy: boolean;
      readonly words: number;
    };

const unquote = (text: string): Option.Option<string> => {
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.length > open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length).trim();
      if (inner.length > 0) return Option.some(inner);
    }
  }
  return Option.none();
};

export const countWords = (text: string): number =>
  text.split(/\s+/u).filter((word) => word.length > 0).length;

export const parseRefcode = (text: string): Option.Option<string> => {
  const match = Option.fromNullishOr(REFCODE.exec(text.trim()));
  if (Option.isNone(match)) return Option.none();
  const [, rawCode, rawNumber, rawParagraph] = match.value;
  const code = Option.fromNullishOr(rawCode);
  const number = Option.fromNullishOr(rawNumber);
  if (Option.isNone(code) || Option.isNone(number)) return Option.none();
  if (!hasLetter.test(code.value)) return Option.none();
  const tail = Option.match(Option.fromNullishOr(rawParagraph), {
    onNone: () => number.value,
    onSome: (part) => `${number.value}.${part}`,
  });
  return Option.some(`${code.value.toUpperCase()} ${tail}`);
};

export const route = (text: string): RoutedQuery => {
  const trimmed = text.trim();
  const quoted = unquote(trimmed);
  if (Option.isSome(quoted)) return { _tag: 'phrase', phrase: quoted.value };
  const refcode = parseRefcode(trimmed);
  if (Option.isSome(refcode)) return { _tag: 'locate', refcode: refcode.value };
  const words = countWords(trimmed);
  return { _tag: 'hybrid', text: trimmed, wordy: words >= WORDY_WORD_THRESHOLD, words };
};
