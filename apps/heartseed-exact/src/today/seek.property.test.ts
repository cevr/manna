/* oxlint-disable effect/noNullish, effect/noTernary, effect/noNewError, effect/noThrowStatement, effect/noGlobals -- a property test: the generators branch plainly and read optional list items, and a broken rule throws naming its seed and its range as JSON. */

/**
 * The read on from a held word against the current Heartseed's reading
 * machine (`@manna/heartseed/voice/reading`), over 200 seeded KJV verses:
 * a hold on word `k` while the voice reads, lifted there, speaks the same
 * text as the current app's `Seek` (the verse from `k`'s start), lights the
 * same words before it, and each range the voice then reports, in the text
 * it speaks, lights as many words as the current app's `lit` does: ranges
 * on a word, across words, on spaces, at the text's end and past it. A
 * pause and a resume ask the same as the current app's and change no light.
 */

import { describe, expect, it } from 'bun:test';
import { readVerses } from '@manna/heartseed/passage';
import { initial as oneInitial, step as oneStep, wordSpans } from '@manna/heartseed/voice/reading';
import type { Reading } from '@manna/heartseed/voice/reading';
import { Option } from 'effect';

import { seeded, type Random } from '../test/random';
import type { Frame } from './hold';
import { initial, step, type TodayState } from './step';
import { view } from './view';

const VERSES = 200;

/** One row of boxes, word `i` at `i * 100`. */
const framesOf = (words: number): readonly Frame[] =>
  Array.from({ length: words }, (_, index) => ({
    x: index * 100,
    y: 0,
    width: 90,
    height: 20,
    unavailable: false,
  }));

const onWord = (word: number) => ({ x: word * 100 + 45, y: 10 });

/** Today reading `verse` under `u1`, the voice at `before` words, then a hold on `word` lifted there and its read on taken as `u2`. */
const heldAndLifted = (verse: string, before: number, word: number) => {
  const frames = framesOf(wordSpans(verse).length);
  let state: TodayState = step(initial({ reference: 'Test', text: verse }), {
    _tag: 'hear',
    utterance: 'u1',
  });
  const span = wordSpans(verse)[Math.max(0, before - 1)];
  if (span !== undefined && before > 0)
    state = step(state, {
      _tag: 'voice',
      utterance: 'u1',
      charIndex: span.start,
      charLength: span.end - span.start,
    });
  const asks: string[] = [];
  const contact = (input: Parameters<typeof step>[1]) => {
    const was = state.asks;
    state = step(state, input);
    if (state.asks !== was) asks.push(state.ask);
  };
  contact({ _tag: 'contact', contact: { _tag: 'down', pointer: 1, at: onWord(word) } });
  const pressed = view(state).holdKey;
  contact({ _tag: 'contact', contact: { _tag: 'elapsed', key: pressed, frames } });
  const held = view(state);
  contact({ _tag: 'contact', contact: { _tag: 'up', pointer: 1, at: onWord(word) } });
  const lifted = view(state);
  state = step(state, { _tag: 'sought', utterance: 'u2' });
  return { state, asks, held, lifted };
};

/** The current app's reading of `verse`, at `before` words, then its `Seek` to `word`. */
const oneSought = (verse: string, before: number, word: number) => {
  const read = oneStep(oneInitial('her'), { _tag: 'Read', verse });
  let reading: Reading = read.reading;
  const span = wordSpans(verse)[Math.max(0, before - 1)];
  if (span !== undefined && before > 0)
    reading = oneStep(reading, {
      _tag: 'Event',
      event: {
        utterance: reading.lastId,
        kind: 'range',
        location: span.start,
        length: span.end - span.start,
      },
    }).reading;
  reading = oneStep(reading, { _tag: 'Pause' }).reading;
  const sought = oneStep(reading, { _tag: 'Seek', word });
  return sought;
};

const aRange = (random: Random, spoken: string): { location: number; length: number } => {
  const spans = wordSpans(spoken);
  const span = spans.length > 0 ? random.pick([...spans]) : { start: 0, end: 1 };
  return random.pick([
    { location: span.start, length: span.end - span.start },
    { location: span.start, length: 1 },
    { location: Math.max(0, span.start - 1), length: span.end - span.start + 1 },
    { location: span.end, length: 1 },
    { location: random.below(spoken.length + 1), length: 1 + random.below(12) },
    { location: spoken.length, length: 1 },
    { location: random.pick([-1, 0.5]), length: random.pick([1, 0, 2.5]) },
  ]);
};

describe('a read on from a held word, against the current app', () => {
  it(`speaks and lights as the current app's Seek over ${VERSES} verses`, () => {
    const verses = readVerses();
    let ranges = 0;
    for (let seed = 1; seed <= VERSES; seed++) {
      const random = seeded(seed);
      const verse = random.pick(verses).text;
      const words = wordSpans(verse).length;
      const before = random.below(words);
      const word = random.below(words);
      const port = heldAndLifted(verse, before, word);
      const one = oneSought(verse, before, word);
      const at = `seed ${seed}, a hold on ${word} at ${before}`;
      if (port.asks.join('|') !== 'pause|seek')
        throw new Error(`${at}: asked ${port.asks.join('|')}`);
      if (port.held.heldWord !== word || port.held.words[word]?.held !== true)
        throw new Error(`${at}: held ${port.held.heldWord}`);
      if (port.held.words.some((each) => each.lit !== each.index < word))
        throw new Error(`${at}: the hold did not read to the held word`);
      const call = Option.getOrNull(one.call);
      if (call?._tag !== 'Speak' || call.text !== port.lifted.seekText)
        throw new Error(
          `${at}: speaks ${JSON.stringify(port.lifted.seekText)}, the current app ${JSON.stringify(call)}`,
        );
      let state = port.state;
      let reading = one.reading;
      if (view(state).lit !== reading.view.lit)
        throw new Error(`${at}: lit ${view(state).lit}, the current app ${reading.view.lit}`);
      for (let n = 0; n < 12; n++) {
        const range = aRange(random, call.text);
        state = step(state, {
          _tag: 'voice',
          utterance: 'u2',
          charIndex: range.location,
          charLength: range.length,
        });
        reading = oneStep(reading, {
          _tag: 'Event',
          event: { utterance: reading.lastId, kind: 'range', ...range },
        }).reading;
        ranges++;
        if (view(state).lit !== reading.view.lit)
          throw new Error(
            `${at}, range ${JSON.stringify(range)}: lit ${view(state).lit}, the current app ${reading.view.lit}`,
          );
      }
    }
    expect(ranges).toBe(VERSES * 12);
  });
});
