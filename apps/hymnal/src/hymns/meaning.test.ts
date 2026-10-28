/**
 * Meaning search over the shipped table: what it returns, never how well
 * (the acceptance's theme queries measure that). Queries are plain English
 * made here; each check compares hymn numbers or counts.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Fiber, Option } from 'effect';
import { it as itEffect } from 'effect-bun-test';
import { TestClock } from 'effect/testing';

import { meaning } from '../../assets/meaning/meaning.js';
import { hymns } from './hymns';
import { ABOUT, about, aboutQuery, aboutShown, afterPause, moreLike, PAUSE } from './meaning';
import { fold } from './search';

const numbers = new Set(hymns.map((hymn) => hymn.number));
const distinctHymns = (found: ReadonlyArray<number>) =>
  new Set(found).size === found.length && found.every((n) => numbers.has(n));

describe('the shipped table', () => {
  it('holds a vector for every hymn of the app, in number order', () => {
    expect(meaning().hymns.split(' ').map(Number)).toEqual(hymns.map((hymn) => hymn.number));
  });

  it('holds its words as search folds them, so a query folded by search finds them', () => {
    // The build folds with a copy of search's fold: every word is one the app's fold leaves as it is.
    const { words } = meaning();
    expect(fold(words) === words).toBe(true);
  });
});

describe('about', () => {
  it('lists distinct hymns, at most as many as asked, ten by default', () => {
    const found = about('comfort in sorrow');
    expect({ count: found.length, distinct: distinctHymns(found) }).toEqual({
      count: 10,
      distinct: true,
    });
    expect(about('comfort in sorrow', 3)).toEqual(found.slice(0, 3));
  });

  it('finds no hymn for a query of words the table lacks', () => {
    expect(about('qzxv vvqz')).toEqual([]);
    expect(about('')).toEqual([]);
  });

  it('reads past the words a reader adds to ask, and the case and accents of the rest', () => {
    expect(about('Hymns about PEACE')).toEqual(about('peace'));
    expect(about('songs about péace')).toEqual(about('peace'));
  });

  it('counts nothing for the words the hymns hold everywhere, and finds no hymn for those alone', () => {
    expect(about('the and peace', 5)).toEqual(about('peace', 5));
    expect([about('the'), about('and the'), about('of my')]).toEqual([[], [], []]);
  });
});

describe('search mode’s hymns about a query', () => {
  it('are about’s ten for a query of words', () => {
    expect(aboutQuery('comfort in sorrow')).toEqual(about('comfort in sorrow', ABOUT));
    expect(ABOUT).toBe(10);
  });

  it('are none for a number asked for, or a word still under three letters', () => {
    expect(['no 100', 'hymn #12', '100', 'pe', ' a b '].map((q) => aboutQuery(q).length)).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });

  itEffect.effect(
    'are asked for only once the query has stood a pause, and a keystroke before then asks for none',
    () =>
      Effect.gen(function* () {
        const typed = yield* Effect.forkChild(afterPause('pea'));
        yield* TestClock.adjust(PAUSE - 1);
        const early = Option.isSome(Option.fromUndefinedOr(typed.pollUnsafe()));
        // The next keystroke interrupts the pause before it ends; its own pause runs from there.
        yield* Fiber.interrupt(typed);
        const next = yield* Effect.forkChild(afterPause('peace'));
        yield* TestClock.adjust(PAUSE - 1);
        const nextEarly = Option.isSome(Option.fromUndefinedOr(next.pollUnsafe()));
        yield* TestClock.adjust(1);
        const asked = yield* Fiber.join(next);
        expect({ PAUSE, early, nextEarly, asked }).toEqual({
          PAUSE: 150,
          early: false,
          nextEarly: false,
          asked: 'peace',
        });
      }),
  );

  it('show under a query’s matches only the hymns about that query, none of an older one', () => {
    expect([aboutShown('peace', 'peace', [3, 4]), aboutShown('pea', 'peace', [3, 4])]).toEqual([
      [3, 4],
      [],
    ]);
  });
});

describe('the ranking', () => {
  /** The file decoded with Node's base64, apart from the module's own decoder. */
  const file = meaning();
  const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'base64'));
  const words = file.words.split(' ');
  const weights = new Float32Array(bytes(file.weights).buffer);
  const vectors = new Int8Array(bytes(file.vectors).buffer);
  const order = file.hymns.split(' ').map(Number);
  const D = file.dims;
  /** Each value of word `w`'s row, times its weight. */
  const rowOf = (w: number) => {
    // A row is its own run of base64, `D * 2 / 3` characters.
    const row = bytes(file.table.slice((w * D * 2) / 3, ((w + 1) * D * 2) / 3));
    return Array.from({ length: D }, (_, c) => {
      const byte = row[c >> 1] ?? 0;
      return (([byte >> 4, byte & 15][c % 2] ?? 0) - 8) * (weights[w] ?? 0);
    });
  };
  const vectorOf = (h: number) => Array.from({ length: D }, (_, c) => vectors[h * D + c] ?? 0);
  const cosineTop = (query: ReadonlyArray<number>, count: number, skip: number) => {
    const length = (v: ReadonlyArray<number>) => Math.hypot(...v);
    const scored = order.map((n, h) => {
      const v = vectorOf(h);
      return { n, score: v.reduce((s, x, c) => s + x * (query[c] ?? 0), 0) / length(v) };
    });
    return scored
      .filter(({ n }) => n !== skip)
      .toSorted((a, b) => b.score - a.score)
      .slice(0, count)
      .map(({ n }) => n);
  };

  it('ranks the hymns about a word as the cosine of its row and their vectors does', () => {
    const w = words.indexOf('peace');
    expect(about('peace', 10)).toEqual(cosineTop(rowOf(w), 10, 0));
  });

  it('ranks the hymns about several words as the cosine of their weighted rows’ sum does', () => {
    const query = ['comfort', 'sorrow', 'night'];
    const rows = query.map((word) => rowOf(words.indexOf(word)));
    const sum = Array.from({ length: D }, (_, c) => rows.reduce((s, row) => s + (row[c] ?? 0), 0));
    expect(about(query.join(' '), 10)).toEqual(cosineTop(sum, 10, 0));
  });

  it('ranks the hymns like a hymn as the cosine of their vectors does', () => {
    expect(moreLike(100, 10)).toEqual(cosineTop(vectorOf(order.indexOf(100)), 10, 100));
  });
});

describe('more like', () => {
  it('lists the hymns nearest a hymn, never the hymn itself', () => {
    const found = moreLike(100, 8);
    expect({
      count: found.length,
      distinct: distinctHymns(found),
      self: found.includes(100),
    }).toEqual({ count: 8, distinct: true, self: false });
  });

  it('finds none for a number the hymnal lacks', () => {
    expect(moreLike(0)).toEqual([]);
    expect(moreLike(9999)).toEqual([]);
  });
});
