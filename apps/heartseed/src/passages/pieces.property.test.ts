/* oxlint-disable effect/noGlobals, effect/noNullish -- the property tallies its kinds in plain maps, and names a wrong case by its JSON. */

/**
 * The pieces the session plans over (hskjv P6). Its seam: `piecesOf`,
 * judged against the model's `piecesRule` (`test/passages-model.ts`, over
 * the model's own corpus) for generated lists of the app's own pieces (the
 * promise, made-up ones, some naming a real verse, or none) and of held
 * passages (overlapping each other and the promise, the same one twice, a
 * stored one past 20 verses), or unread passages.
 *
 * It catches the app's own not first, a passage's verses out of order or one
 * off, a verse's group as its own reference, its words or its text from
 * another verse, a reference kept twice or kept at its later place,
 * unread passages giving any verse, and any verse, long or short, that
 * carries pieces of itself (hspiece W2: a `phrases` key, or any key but a
 * whole verse's). It misses when the session takes the
 * pieces: that is `session.test.ts`'s.
 */

import { describe, expect, it } from 'bun:test';

import { readPassage } from '../../vite/passage';
import { sourceWords } from '../matcher/words';
import { piecesOf, type PassagesView } from '../passages';
import { below, random } from '../test/garden-model';
import {
  piecesRule,
  spanRef,
  verseRef,
  type Held,
  type ModelTextPiece,
  type Span,
} from '../test/passages-model';
import { CORPUS, chapterOf, choosableOf, countIn } from '../test/passages-rig';

const PROMISE_TEXT = readPassage();

/** The promise as the app's own piece. */
const PROMISE: ModelTextPiece = {
  reference: PROMISE_TEXT.reference,
  text: PROMISE_TEXT.text,
  words: sourceWords(PROMISE_TEXT.text).length,
  group: PROMISE_TEXT.reference,
};

const words = (text: string) => sourceWords(text).length;

/** A made-up piece of the app's own: a name no verse has, or a real verse's reference with text of its own. */
const madeUpOf = (next: () => number, index: number): ModelTextPiece => {
  const text = `made up ${index}`;
  if (below(next, 2) === 0)
    return { reference: `Made ${index}:1`, text, words: words(text), group: `Made ${index}` };
  const { book, chapter, count } = chapterOf(next);
  const reference = verseRef(book, chapter, 1 + below(next, count));
  return { reference, text, words: words(text), group: `own ${index}` };
};

/** The app's own pieces and their kind, from `next`. */
const ownOf = (next: () => number): readonly [string, ModelTextPiece[]] => {
  const roll = below(next, 10);
  if (roll < 5) return ['the promise', [PROMISE]];
  if (roll < 6) return ['none', []];
  const made = Array.from({ length: 1 + below(next, 3) }, (_, index) => madeUpOf(next, index));
  if (roll < 8) return ['made up', made];
  return ['the promise, then made up', [PROMISE, ...made]];
};

/** Held passages from `next`, with the kinds they hold: 0-5 choosable ranges, a stored one past 20 verses in a fifth, the first again in a third. */
const heldOf = (next: () => number): readonly [Set<string>, Span[]] => {
  const kinds = new Set<string>();
  const list: Span[] = [];
  for (let n = below(next, 6); n > 0; n--) {
    const [kind, span] = choosableOf(next, list);
    kinds.add(kind);
    list.push(span);
  }
  if (below(next, 5) === 0) {
    const first = 1 + below(next, 100);
    list.push({ book: 19, chapter: 119, first, last: first + 20 + below(next, 56) });
    kinds.add('past 20 verses');
  }
  if (below(next, 3) === 0 && list[0] !== undefined) {
    list.splice(below(next, list.length + 1), 0, { ...list[0] });
    kinds.add('the same passage twice');
  }
  return [kinds, list];
};

const viewOf = (held: Held): PassagesView => {
  if (held.tag === 'Unread') return { _tag: 'Unread' };
  return { _tag: 'Read', passages: held.passages, lists: [] };
};

/** Tallies each passage verse as long (more than 12 words, which main kept in pieces) or short. */
const tallyLengths = (verses: readonly ModelTextPiece[], bump: (kind: string) => void) => {
  for (const piece of verses) {
    if (piece.words <= 12) bump('a short verse');
    else bump('a long verse');
  }
};

/** Each piece that carries pieces of itself, named. */
const carriers = (pieces: ReturnType<typeof piecesOf>) =>
  pieces
    .filter((piece) => 'phrases' in piece)
    .map((piece) => `${piece.reference} carries pieces of itself`);

/** Tallies whether a read run's pieces shared a reference (fewer than the verses held) or none. */
const tallyShared = (
  own: number,
  passages: readonly Span[],
  pieces: number,
  bump: (kind: string) => void,
) => {
  const all = own + passages.reduce((sum, span) => sum + span.last - span.first + 1, 0);
  if (pieces < all) bump('a reference shared');
  if (own > 0 && pieces === all) bump('nothing shared');
};

describe('the pieces over the reader’s passages', () => {
  it('are the app’s own, then each passage’s verses in order, each reference once at its first place, as the rule makes them', () => {
    const next = random(15_1);
    const tally = new Map<string, number>();
    const bump = (kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);
    const wrong: string[] = [];
    for (let run = 0; run < 1500; run++) {
      const [ownKind, own] = ownOf(next);
      bump(`own:${ownKind}`);
      const [kinds, passages] = heldOf(next);
      let held: Held = { tag: 'Read', passages };
      if (below(next, 10) === 0) held = { tag: 'Unread' };
      bump(`passages:${held.tag}`);
      if (held.tag === 'Read') for (const kind of kinds) bump(kind);
      const got = piecesOf(own, viewOf(held));
      const want = piecesRule(CORPUS, own, held, words);
      wrong.push(...carriers(got));
      tallyLengths(want.slice(own.length), bump);
      if (held.tag === 'Read') tallyShared(own.length, passages, want.length, bump);
      if (JSON.stringify(got) !== JSON.stringify(want))
        wrong.push(`${JSON.stringify(own.map((p) => p.reference))} ${JSON.stringify(held)}`);
    }
    expect(wrong.slice(0, 3)).toEqual([]);
    for (const kind of [
      'own:the promise',
      'own:none',
      'own:made up',
      'own:the promise, then made up',
      'passages:Unread',
      'over the promise',
      'an overlap',
      'a passage held',
      'the same passage twice',
      'past 20 verses',
      'a whole short chapter',
      'exactly 20',
      'one verse',
      'a reference shared',
      'nothing shared',
      'a short verse',
      'a long verse',
    ])
      expect(tally.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(20);
  });

  it('give John 15:1-5 after the promise, grouped as the passage, and share the promise’s plant inside Isaiah 41', () => {
    const john: Span = { book: 43, chapter: 15, first: 1, last: 5 };
    const isaiah: Span = { book: 23, chapter: 41, first: 9, last: 11 };
    const pieces = piecesOf([PROMISE], { _tag: 'Read', passages: [john, isaiah], lists: [] });
    expect(pieces.map((piece) => piece.reference)).toEqual([
      'Isaiah 41:10',
      'John 15:1',
      'John 15:2',
      'John 15:3',
      'John 15:4',
      'John 15:5',
      'Isaiah 41:9',
      'Isaiah 41:11',
    ]);
    expect(pieces.map((piece) => piece.group)).toEqual([
      'Isaiah 41:10',
      ...Array.from({ length: 5 }, () => spanRef(john)),
      'Isaiah 41:9-11',
      'Isaiah 41:9-11',
    ]);
    expect(pieces[0]).toEqual(PROMISE);
    expect(pieces[1]?.words).toBeGreaterThan(0);
    expect(pieces.filter((piece) => piece.words > 12).length).toBeGreaterThan(0);
    expect(pieces.filter((piece) => 'phrases' in piece).map((piece) => piece.reference)).toEqual(
      [],
    );
    expect(
      pieces.every(
        (piece) => JSON.stringify(Object.keys(piece)) === '["reference","text","words","group"]',
      ),
    ).toBe(true);
    expect(piecesOf([PROMISE], { _tag: 'Unread' })).toEqual([PROMISE]);
    expect(
      piecesOf([], { _tag: 'Read', passages: [{ ...john, first: 3, last: 3 }], lists: [] }),
    ).toHaveLength(1);
    expect(countIn(43, 15)).toBe(27);
  });
});
