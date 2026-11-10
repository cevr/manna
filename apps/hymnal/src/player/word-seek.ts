import { type Brand, Data, Option } from 'effect';

import { book } from '../follow/book';
import { type SeekTarget, type SeekTargets, targetsOf } from '../follow/seek-targets';
import { hymnAt } from '../hymns/hymns';
import type { Choice } from './stanzas';

export type HoldToken = Brand.Branded<symbol, 'HoldToken'>;
export type HoldCommand = Data.TaggedEnum<{
  Begin: { readonly targets: SeekTargets };
  Select: {
    readonly token: HoldToken;
    readonly line: number;
    readonly word: Option.Option<number>;
  };
  Release: { readonly token: HoldToken };
  Cancel: { readonly token: HoldToken };
  Invalidate: { readonly reason: 'route' | 'background' | 'unmount' | 'timeline' };
}>;
export const HoldCommand = Data.taggedEnum<HoldCommand>();

interface Selection {
  readonly token: HoldToken;
  readonly target: SeekTarget;
}

export type HoldState = Data.TaggedEnum<{
  Free: {};
  Acquiring: Selection;
  Held: Selection & { readonly origin: number };
  Landing: Selection & { readonly origin: number };
}>;
export const HoldState = Data.taggedEnum<HoldState>();

export type TargetsFor = (number: number, choice: Choice) => Option.Option<SeekTargets>;

/** The same uncut bundled score and sung sections used by the live score clock. */
export const bundledTargets: TargetsFor = (number, choice) =>
  Option.gen(function* () {
    return yield* targetsOf(yield* hymnAt(String(number)), yield* book.of(number), choice);
  });

/** Numeric topology and trusted onsets, independent of object identity and lyric strings. */
export const sameTargets = (a: SeekTargets, b: SeekTargets): boolean =>
  a.number === b.number &&
  a.choice.length === b.choice.length &&
  a.choice.every((n, k) => n === b.choice[k]) &&
  a.lines.length === b.lines.length &&
  a.lines.every((line, k) => {
    const other = b.lines[k];
    if (
      !other ||
      line.line !== other.line ||
      line.start !== other.start ||
      line.until !== other.until ||
      line._tag !== other._tag
    )
      return false;
    if (line._tag === 'LineOnly' || other._tag === 'LineOnly') return true;
    return (
      line.words.length === other.words.length &&
      line.words.every(
        (word, i) => word.word === other.words[i]?.word && word.ms === other.words[i]?.ms,
      )
    );
  });
