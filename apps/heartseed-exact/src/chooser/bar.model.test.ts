/* oxlint-disable effect/noTernary -- a model written plainly beside the port's Option code: an oracle in a second style. */

/**
 * The chapter's bar, model-based (spec, acceptance 2): generated histories
 * of taps, clears, plants' answers (`Planted`, `Already`, `Full`, `Short`,
 * `Failed`, `Unread`), chapter changes (the range read as none on the
 * frame before `chooserMoved` clears it) and fields changed underneath,
 * run through `chapterTap` and `chapterShown` as the Contract's actions
 * compose them, beside a small model of what the reader should see. The
 * invariants: one filled button at most, ever; the study slot exactly
 * when one verse is chosen and nothing has landed; "Already in your
 * field." exactly when every chosen verse is planted; a chapter change
 * clears the selection; Practise it now names the first verse planted;
 * Plant exactly at 3 verses or more while something of the range is
 * unplanted; the chapter's marks exactly the field's verses there.
 */

import { expect, it } from 'bun:test';

import { MOST_SINGLES, verseReference } from '@manna/heartseed/passages';
import { slugOf } from '../garden/view';
import { seeded, type Random } from '../test/random';
import { chapterShown, chapterTap } from './bar';

/** The chapters a history moves between: book, chapter, verse count. */
const CHAPTERS = [
  [43, 3, 36],
  [19, 117, 2],
  [19, 23, 6],
  [19, 119, 176],
] as const;

const ANSWERS = ['Planted', 'Already', 'Full', 'Short', 'Failed', 'Unread'] as const;

/** The Contract's state the chapter reads, and the field beneath it. */
interface Run {
  at: number;
  place: string;
  first: number;
  last: number;
  answer: string;
  field: string[];
  singles: string[];
}

/** What the model says the reader sees: the verses chosen, and the first verse a landed plant planted (0 for none). */
interface Seen {
  chosen: readonly number[];
  landed: number;
}

const NOTHING: Seen = { chosen: [], landed: 0 };

const chapterOf = (run: Run) => {
  const [book, chapter, count] = CHAPTERS[run.at] ?? CHAPTERS[0];
  return { book, chapter, count, key: `${book}.${chapter}` };
};

const show = (run: Run) => {
  const { book, chapter } = chapterOf(run);
  return chapterShown(
    `${book}`,
    `${chapter}`,
    run.place,
    { first: run.first, last: run.last },
    run.answer,
    run.singles,
    run.field,
  );
};

const cleared = (run: Run) => {
  run.first = 0;
  run.last = 0;
  run.answer = '';
};

const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

/** The model's selection after a tap on `verse`: a second tap ends a range of at most 20 from the first, a tap on the one verse clears it, any other starts afresh. */
const tapped = (before: readonly number[], verse: number): readonly number[] => {
  if (before.length !== 1) return [verse];
  const anchor = before[0] ?? verse;
  if (anchor === verse) return [];
  if (verse < anchor) return span(Math.max(verse, anchor - 19), anchor);
  return span(anchor, Math.min(verse, anchor + 19));
};

/** A tap, as `chooserTapIt` and `chooserTook` compose it. */
const tap = (random: Random, run: Run, seen: Seen): Seen => {
  const { book, chapter, count, key } = chapterOf(run);
  const verse = 1 + random.below(count);
  const range = chapterTap(
    `${book}`,
    `${chapter}`,
    run.place,
    { first: run.first, last: run.last },
    run.answer,
    verse,
  );
  run.answer = '';
  run.first = range.first;
  run.last = range.last;
  run.place = key;
  return { chosen: tapped(seen.landed > 0 ? [] : seen.chosen, verse), landed: 0 };
};

/** A plant's answer landing for what the bar offers, as `chooserLanded` keeps it; a landed plant adds the range to the field. */
const plant = (random: Random, run: Run, seen: Seen): Seen => {
  const shown = show(run);
  if (!shown.plant && !shown.singles) return seen;
  run.answer = random.pick(ANSWERS);
  if (run.answer !== 'Planted') return seen;
  const { book, chapter } = chapterOf(run);
  for (const verse of span(shown.first, shown.last)) {
    const reference = verseReference(book, chapter, verse);
    if (!run.field.includes(reference)) run.field.push(reference);
    if (shown.singles && !run.singles.includes(reference)) run.singles.push(reference);
  }
  return { chosen: seen.chosen, landed: shown.first };
};

/** Another chapter shown, or the same opened again: on the frame before `chooserMoved` the range already reads as none. */
const move = (random: Random, run: Run, seen: Seen): Seen => {
  const { key } = chapterOf(run);
  run.at = random.below(CHAPTERS.length);
  const moved = chapterOf(run).key !== key;
  if (moved) expect({ key, left: show(run).up }).toEqual({ key, left: false });
  if (!moved && random.chance(0.5)) return seen;
  cleared(run);
  return NOTHING;
};

/** A verse of the chapter planted or removed underneath, as a plant elsewhere or Remove would. */
const reseed = (random: Random, run: Run, seen: Seen): Seen => {
  const { book, chapter, count } = chapterOf(run);
  const reference = verseReference(book, chapter, 1 + random.below(count));
  if (run.field.includes(reference)) {
    run.field = run.field.filter((each) => each !== reference);
    run.singles = run.singles.filter((each) => each !== reference);
  } else {
    run.field.push(reference);
    if (random.chance(0.5) && run.singles.length < MOST_SINGLES) run.singles.push(reference);
  }
  return seen;
};

/** One step of a history. */
const step = (random: Random, run: Run, seen: Seen): Seen => {
  const roll = random.below(10);
  if (roll < 5) return tap(random, run, seen);
  if (roll === 5) {
    cleared(run);
    return NOTHING;
  }
  if (roll === 6) return plant(random, run, seen);
  if (roll === 7) return move(random, run, seen);
  return reseed(random, run, seen);
};

/** What the bar should offer, by the model, for what the reader sees and the field. */
const expected = (run: Run, seen: Seen) => {
  const { book, chapter, count } = chapterOf(run);
  const planted = new Set(run.field);
  const chosen = [...seen.chosen];
  const landed = seen.landed > 0 && chosen.length > 0;
  const every =
    chosen.length > 0 && chosen.every((verse) => planted.has(verseReference(book, chapter, verse)));
  return {
    chosen,
    up: chosen.length > 0,
    landed,
    study: chosen.length === 1 && !landed,
    already: every && !landed,
    plant: chosen.length >= 3 && !every && !landed,
    practise: landed ? slugOf(verseReference(book, chapter, seen.landed)) : '',
    planted: span(1, count).filter((verse) => planted.has(verseReference(book, chapter, verse))),
  };
};

it('holds the bar to the model over generated histories', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const random = seeded(seed);
    const run: Run = { at: 0, place: '', first: 0, last: 0, answer: '', field: [], singles: [] };
    let seen = NOTHING;
    for (let at = 0; at < 40; at++) {
      seen = step(random, run, seen);
      const shown = show(run);
      const where = `seed ${seed} step ${at}`;
      expect({ where, ...expected(run, seen) }).toEqual({
        where,
        chosen: shown.chosen ? span(shown.first, shown.last) : [],
        up: shown.up,
        landed: shown.landed,
        study: shown.study,
        already: shown.already,
        plant: shown.plant,
        practise: shown.practise,
        planted: shown.planted,
      });
      expect({ where, filled: Number(shown.plant) + Number(shown.singles) }).not.toEqual({
        where,
        filled: 2,
      });
      if (shown.already || shown.landed)
        expect({ where, singles: shown.singles }).toEqual({ where, singles: false });
    }
  }
});

it('counts the field in the chapter, and offers no button once every chosen verse is planted', () => {
  const field = ['John 3:16', 'John 3:17', 'John 3:18'];
  const shown = chapterShown('43', '3', '43.3', { first: 16, last: 16 }, '', [], field);
  expect([shown.fieldLine, shown.already, shown.study, shown.plant, shown.singles]).toEqual([
    '3 verses in your field',
    true,
    true,
    false,
    false,
  ]);
  expect(chapterShown('43', '3', '', { first: 0, last: 0 }, '', [], ['John 3:16']).fieldLine).toBe(
    '1 verse in your field',
  );
  expect(chapterShown('43', '3', '', { first: 0, last: 0 }, '', [], []).fieldLine).toBe('');
  expect(chapterShown('43', '3', '19.23', { first: 1, last: 3 }, '', [], []).chosen).toBe(false);
});
