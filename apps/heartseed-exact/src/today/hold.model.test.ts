/* oxlint-disable effect/noNullish, effect/noTernary, effect/noNodeBuiltinImport, effect/noAsyncFunction, effect/noGlobals, effect/noNewError, effect/noThrowStatement, eslint/complexity, effect/maxCognitiveComplexity, effect/preferMatchTagsExhaustive -- a model test: the recognizer's model is one plain switch as a reader checks it against react-native-gesture-handler's pan, it reads two tracked files beside it as the gate's other source checks do, and a broken rule throws naming its seed and history as JSON. */

/**
 * The port's hold (`holdStep`) against the current Heartseed's, over seeded
 * touch histories on generated layouts of KJV verses: a finger down on the
 * words while a reading is under way or not, still for less or more than
 * the hold's time, moves within and past the slop, across words, into gaps,
 * between lines and off the words, a lift where it last moved, a cancel (as
 * the web ends one, at 0, 0), a second finger, the reading ending or a new
 * one starting at any step, and the timer of an older press firing late.
 *
 * The current app's side is its own rule (`activate`, `update`,
 * `finalize`, `drop` and `wordAt`, imported) driven by a model of its pan
 * written here, as react-native-gesture-handler's pan with
 * `activateAfterLongPress` runs it: it activates `LONG_PRESS` after the
 * down unless the finger moved more than 10 pt first (fails), and a second
 * finger is not the pan's. After every step both hold the same word, and
 * both have asked the voice the same things (pause, read on from word k,
 * resume), each end at most once.
 *
 * Two literals are held to their sources: the slop to the pan's own
 * (`RNPanHandler.m`) and the contract's timer to `HOLD_MS`.
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  activate,
  drop,
  finalize,
  LONG_PRESS,
  update,
  type Ask,
} from '@manna/heartseed/reading/hold';
import { shownWordsOf, wordAt, type Box } from '@manna/heartseed/reading/words';
import { readVerses } from '@manna/heartseed/passage';
import { Option } from 'effect';

import { seeded, type Random } from '../test/random';
import {
  HOLD_MS,
  HOLD_SLOP,
  holdStep,
  idleHold,
  type ContactInput,
  type Frame,
  type Hold,
  type Point,
} from './hold';

const HISTORIES = 300;
const STEPS = 40;

/** A generated layout: each word's box, in lines from 20, 20, some not laid out. */
interface Layout {
  readonly boxes: readonly Box[];
  readonly laid: readonly boolean[];
}

const layoutOf = (random: Random, words: number): Layout => {
  const boxes: Box[] = [];
  const laid: boolean[] = [];
  const height = 18 + random.below(30);
  const gap = random.below(12);
  const width = 200 + random.below(300);
  let x = 20;
  let y = 20;
  for (let word = 0; word < words; word++) {
    const w = 10 + random.below(80);
    if (x + w > 20 + width && x > 20) {
      x = 20;
      y += height + gap;
    }
    boxes.push({ x, y, width: w, height });
    laid.push(random.chance(0.97));
    x += w + random.below(10);
  }
  return { boxes, laid };
};

const framesOf = (layout: Layout): readonly Frame[] =>
  layout.boxes.map((box, index) => ({ ...box, unavailable: !layout.laid[index] }));

const mapOf = (layout: Layout): ReadonlyMap<number, Box> =>
  new Map(
    layout.boxes.flatMap((box, index) => (layout.laid[index] ? [[index, box] as const] : [])),
  );

/** A point on a word, in a gap or between lines, or off the words; never within 30 of 0, 0, where the web ends a cancel. */
const pointOf = (random: Random, layout: Layout): Point => {
  const box = random.pick(layout.boxes);
  switch (random.below(4)) {
    case 0:
      return { x: box.x + random.next() * box.width, y: box.y + random.next() * box.height };
    case 1:
      return { x: box.x + box.width + random.next() * 8, y: box.y + box.height / 2 };
    case 2:
      return { x: box.x + box.width / 2, y: box.y + box.height + random.next() * 10 };
    default:
      return { x: 40 + random.next() * 700, y: 40 + random.next() * 900 };
  }
};

/** A point within `most` of `at`. */
const near = (random: Random, at: Point, most: number): Point => {
  const angle = random.next() * 2 * Math.PI;
  const far = random.next() * most;
  return { x: at.x + far * Math.cos(angle), y: at.y + far * Math.sin(angle) };
};

type Pan = 'none' | 'possible' | 'active' | 'failed';

/** The current app's side: its pan as react-native-gesture-handler runs it, and its view's held word. */
interface One {
  readonly shown: boolean;
  readonly pan: Pan;
  readonly pointer: number;
  readonly from: Point;
  readonly at: Point;
  readonly began: number;
  readonly held: Option.Option<number>;
}

const named = (ask: Ask): string => (ask._tag === 'Seek' ? `seek ${ask.word}` : ask._tag);

/** One step of the current app's side: its held word and its asks, by its own rule. */
const oneStep = (one: One, event: Event, layout: Layout, now: number, asks: string[]): One => {
  const held = (moment: { held: Option.Option<number>; ask: Option.Option<Ask> }) => {
    if (Option.isSome(moment.ask)) asks.push(named(moment.ask.value));
    return moment.held;
  };
  switch (event._tag) {
    case 'down':
      if (!one.shown || one.pan !== 'none') return one;
      return {
        ...one,
        pan: 'possible',
        pointer: event.pointer,
        from: event.at,
        at: event.at,
        began: now,
      };
    case 'wait':
      if (one.pan !== 'possible' || now - one.began < LONG_PRESS) return one;
      return {
        ...one,
        pan: 'active',
        held: held(activate(one.held, wordAt(one.at.x, one.at.y, mapOf(layout)))),
      };
    case 'move': {
      if (one.pan === 'none' || event.pointer !== one.pointer) return one;
      if (one.pan === 'possible') {
        const dx = event.at.x - one.from.x;
        const dy = event.at.y - one.from.y;
        if (dx * dx + dy * dy > 100) return { ...one, pan: 'failed' };
        return { ...one, at: event.at };
      }
      if (one.pan !== 'active') return one;
      return {
        ...one,
        at: event.at,
        held: held(update(one.held, wordAt(event.at.x, event.at.y, mapOf(layout)))),
      };
    }
    case 'lift':
    case 'cancel': {
      if (one.pan === 'none' || event.pointer !== one.pointer) return one;
      const ended = { ...one, pan: 'none' as const };
      if (one.pan !== 'active') return ended;
      return { ...ended, held: held(finalize(one.held, event._tag === 'cancel')) };
    }
    case 'ends':
      if (!one.shown) return one;
      return {
        ...one,
        shown: false,
        pan: one.pan === 'none' ? 'none' : 'failed',
        held: held(drop(one.held)),
      };
    case 'starts':
      return { ...one, shown: true };
    case 'late':
      return one;
  }
};

type Event =
  | { readonly _tag: 'down'; readonly pointer: number; readonly at: Point }
  | { readonly _tag: 'wait'; readonly ms: number }
  | { readonly _tag: 'move'; readonly pointer: number; readonly at: Point }
  | { readonly _tag: 'lift'; readonly pointer: number }
  | { readonly _tag: 'cancel'; readonly pointer: number }
  | { readonly _tag: 'ends' }
  | { readonly _tag: 'starts' }
  | { readonly _tag: 'late' };

/** The port's side: the hold, the reading under way or not, the pointer's last point and the oldest timer key not yet fired. */
interface Port {
  readonly hold: Hold;
  readonly reading: boolean;
  readonly last: ReadonlyMap<number, Point>;
  readonly armed: Option.Option<{ readonly key: number; readonly at: number }>;
}

const pressKey = (hold: Hold): Option.Option<number> =>
  hold.contact._tag === 'pressing' ? Option.some(hold.contact.key) : Option.none();

const portStep = (port: Port, event: Event, layout: Layout, now: number, asks: string[]): Port => {
  const run = (state: Port, input: ContactInput): Port => {
    const next = holdStep(state.hold, input, state.reading);
    if (Option.isSome(next.ask)) asks.push(named(next.ask.value));
    const before = pressKey(state.hold);
    const after = pressKey(next.hold);
    const armed =
      Option.isSome(after) && !Option.contains(before, after.value)
        ? Option.some({ key: after.value, at: now + HOLD_MS })
        : state.armed;
    return { ...state, hold: next.hold, armed };
  };
  switch (event._tag) {
    case 'down':
      return run(
        { ...port, last: new Map(port.last).set(event.pointer, event.at) },
        { _tag: 'down', pointer: event.pointer, at: event.at },
      );
    case 'wait':
      return Option.match(port.armed, {
        onNone: () => port,
        onSome: (timer) =>
          now >= timer.at
            ? run(
                { ...port, armed: Option.none() },
                { _tag: 'elapsed', key: timer.key, frames: framesOf(layout) },
              )
            : port,
      });
    case 'move':
      return run(
        { ...port, last: new Map(port.last).set(event.pointer, event.at) },
        {
          _tag: 'move',
          pointer: event.pointer,
          at: event.at,
          frames: framesOf(layout),
        },
      );
    case 'lift':
      return run(port, {
        _tag: 'up',
        pointer: event.pointer,
        at: port.last.get(event.pointer) ?? { x: 0, y: 0 },
      });
    case 'cancel':
      return run(port, { _tag: 'up', pointer: event.pointer, at: { x: 0, y: 0 } });
    case 'ends':
      return run({ ...port, reading: false }, { _tag: 'gone' });
    case 'starts':
      return { ...port, reading: true };
    case 'late':
      return run(port, { _tag: 'elapsed', key: port.hold.presses - 1, frames: framesOf(layout) });
  }
};

const anEvent = (random: Random, layout: Layout, one: One): Event => {
  const roll = random.below(20);
  const pointer = random.chance(0.9) ? 1 : 2;
  if (one.pan === 'none' && roll < 8) return { _tag: 'down', pointer, at: pointOf(random, layout) };
  if (roll < 5) return { _tag: 'wait', ms: random.pick([50, 200, 340, 400, 1000]) };
  if (roll < 11)
    return {
      _tag: 'move',
      pointer,
      at: random.chance(0.4) ? near(random, one.at, 14) : pointOf(random, layout),
    };
  if (roll < 14) return { _tag: 'lift', pointer };
  if (roll < 15) return { _tag: 'cancel', pointer };
  if (roll < 16) return { _tag: 'ends' };
  if (roll < 18) return { _tag: 'starts' };
  if (roll < 19) return { _tag: 'late' };
  return { _tag: 'wait', ms: 400 };
};

describe('the hold, against the current app', () => {
  it(`holds the same word and asks the same of the voice over ${HISTORIES} touch histories`, () => {
    const verses = readVerses();
    const tally = { holds: 0, seeks: 0, resumes: 0, fails: 0, gone: 0 };
    for (let seed = 1; seed <= HISTORIES; seed++) {
      const random = seeded(seed);
      const verse = random.pick(verses).text;
      const layout = layoutOf(random, shownWordsOf(verse).length);
      const origin = { x: 0, y: 0 };
      let one: One = {
        shown: true,
        pan: 'none',
        pointer: 0,
        from: origin,
        at: origin,
        began: 0,
        held: Option.none(),
      };
      let port: Port = { hold: idleHold, reading: true, last: new Map(), armed: Option.none() };
      let now = 0;
      const oneAsks: string[] = [];
      const portAsks: string[] = [];
      const history: Event[] = [];
      for (let n = 0; n < STEPS; n++) {
        const event = anEvent(random, layout, one);
        history.push(event);
        if (event._tag === 'wait') now += event.ms;
        const was = one.pan;
        one = oneStep(one, event, layout, now, oneAsks);
        port = portStep(port, event, layout, now, portAsks);
        if (was === 'possible' && one.pan === 'failed') tally.fails++;
        if (event._tag === 'ends' && Option.isSome(port.hold.held)) tally.gone++;
        const at = `seed ${seed} step ${n} after ${JSON.stringify(history)}`;
        if (oneAsks.join('|') !== portAsks.join('|'))
          throw new Error(
            `${at}: asked ${portAsks.join('|')}, the current app ${oneAsks.join('|')}`,
          );
        if (Option.getOrNull(one.held) !== Option.getOrNull(port.hold.held))
          throw new Error(
            `${at}: holds ${Option.getOrNull(port.hold.held)}, the current app ${Option.getOrNull(one.held)}`,
          );
      }
      tally.holds += oneAsks.filter((ask) => ask === 'Hold').length;
      tally.seeks += oneAsks.filter((ask) => ask.startsWith('seek')).length;
      tally.resumes += oneAsks.filter((ask) => ask === 'LetGo').length;
    }
    expect(tally.holds).toBeGreaterThan(100);
    expect(tally.seeks).toBeGreaterThan(30);
    expect(tally.resumes).toBeGreaterThan(10);
    expect(tally.fails).toBeGreaterThan(20);
  });

  it("holds the slop to the current app's pan and the contract's timer to HOLD_MS", async () => {
    const pan = await Bun.file(
      Bun.resolveSync(
        'react-native-gesture-handler/apple/Handlers/RNPanHandler.m',
        join(import.meta.dir, '../../../heartseed'),
      ),
    ).text();
    const fails = [
      ...pan.matchAll(
        /activateAfterLongPress\) && trans\.x \* trans\.x \+ trans\.y \* trans\.y > (\d+)/gu,
      ),
    ];
    expect(fails.map((found) => Number(found[1]))).toEqual([HOLD_SLOP ** 2]);
    const contract = await Bun.file(join(import.meta.dir, '../../features/today.contract')).text();
    const waits = [...contract.matchAll(/after\((\d+), todayHoldNowIt\)/gu)].map((found) =>
      Number(found[1]),
    );
    expect(waits).toEqual([HOLD_MS]);
  });
});
