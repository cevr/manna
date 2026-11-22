/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/maxCognitiveComplexity, eslint/complexity -- a Bun test over the current app's timing and seek rules as plain values; a broken rule throws naming its seed and gesture as JSON. */

/**
 * The port's held seek (`followDesk`'s pointer, deadline and release, as
 * `features/follow.contract` sends them) against the current app's held
 * seek rules (`reader/seek-rules.ts`, `follow/seek-targets.ts`, imported):
 * over generated gestures on hymns and places read from the current app's
 * bundled timing at run time (words and syllables kept), or from the port's
 * own bundled timing (lines only, as the phone has it today), under
 * generated stanza choices, while the
 * player plays the page's hymn. A press that moves past `SLOP` before
 * `HOLD_MS` takes nothing; a still one takes the hold at the sounding place
 * (`initialTarget`) and asks the player to pause; each move holds the
 * target `choiceAt` and `targetAt` give from where the finger was when it
 * took, said as `describe` and `spoken` say it, and ticks only when the
 * choice changes; the lift seeks to that target's time, or plays on when
 * the choice never left the first; a lift away from the last move (a
 * pointercancel, which Exact folds into the pointerup) plays on and seeks
 * nothing. Nothing takes while the player does not play the page's hymn.
 */

import { describe, expect, it } from 'bun:test';
import { timelineOf } from '@manna/hymnal-app/follow/timeline';
import {
  HOLD_MS,
  SLOP,
  anchorOf,
  choiceAt,
  describe as describeChoice,
  initialTarget,
  isChoice,
  spoken,
  targetAt,
  targetsOf,
} from '@manna/hymnal-app/reader/seek-rules';
import { readTiming } from '@manna/hymnal-app/vite/timing';
import { Option } from 'effect';

import { book } from '../hymns/book.ts';
import { type Random, below, pick, seeded } from '../test/random.ts';
import { type FollowView, followDesk } from './follow.ts';

const full = new Map(readTiming());
/** Each line kept to its flags, start and length, as `tools/timing.ts` bundles it for the phone (its `linesOnly`, which writes the bundle when imported). */
const lineTiming = (encoded: string): string => {
  const [head = '', body = ''] = encoded.split('|');
  return `${head}|${body
    .split(';')
    .map((line) => line.split(',').slice(0, 3).join(','))
    .join(';')}`;
};
const linesOnly = new Map([...full].map(([number, encoded]) => [number, lineTiming(encoded)]));
const hymns = book.hymns.filter((hymn) => full.has(hymn.number));
const CASES = 300;

interface Gesture {
  readonly hymn: number;
  readonly at: number;
  readonly choice: ReadonlyArray<number>;
  readonly phase: string;
  readonly early: number;
  readonly moves: ReadonlyArray<readonly [number, number]>;
  readonly away: boolean;
  readonly lines: boolean;
}

const gestureOf = (random: Random): Gesture => {
  const hymn = pick(random, hymns);
  const decoded = timelineOf(full.get(hymn.number) ?? '');
  const end = decoded._tag === 'Some' ? decoded.value.end : 1000;
  const stanzas = hymn.sections.filter((section) => section.kind === 'stanza').length;
  return {
    hymn: hymn.number,
    at: below(random, end),
    choice: random() < 0.6 ? [] : [1 + below(random, Math.max(1, stanzas))],
    phase: random() < 0.85 ? 'playing' : pick(random, ['paused', 'buffering']),
    early: random() < 0.15 ? SLOP + 1 + below(random, 30) : below(random, SLOP),
    moves: Array.from({ length: below(random, 6) }, () => [
      below(random, 240) - 120,
      below(random, 400) - 200,
    ]),
    away: random() < 0.15,
    lines: random() < 0.35,
  };
};

const run = (seed: number): string => {
  const random = seeded(seed);
  const gesture = gestureOf(random);
  const hymn = book.hymns.find((each) => each.number === gesture.hymn);
  const decoded = timelineOf((gesture.lines ? linesOnly : full).get(gesture.hymn) ?? '');
  if (hymn === undefined || decoded._tag === 'None') return 'none';
  const timeline = decoded.value;
  const desk = followDesk((number) => (number === hymn.number ? { hymn, timeline } : undefined));
  const kept = gesture.choice.length === 0 ? '' : `${hymn.number}:${gesture.choice.join('.')}`;
  let view: FollowView = desk.report(0, hymn.number, gesture.choice, {
    number: hymn.number,
    phase: gesture.phase,
    at: gesture.at,
    rate: 1,
    counting: false,
    seek: 0,
  });
  const fail = (why: string, extra = '') => {
    throw new Error(JSON.stringify({ seed, why, gesture, kept, extra, view }).slice(0, 4000));
  };
  const asked = view.askKey;
  const [x0, y0] = [200, 300];
  view = desk.pointer(10, { _tag: 'Down', id: 1, primary: true, button: 0, x: x0, y: y0 }, true);
  if (view.armed === 0) fail('a press on the words arms no hold');
  const nx = x0;
  const ny = y0 + gesture.early;
  view = desk.pointer(20, { _tag: 'Move', id: 1, x: nx, y: ny }, true);
  view = desk.deadline(10 + HOLD_MS, view.armed);

  const targets = targetsOf(hymn, timeline, gesture.choice);
  const first = Option.flatMap(targets, (all) => initialTarget(all, gesture.at));
  const takes = gesture.early <= SLOP && gesture.phase === 'playing' && Option.isSome(first);
  if (view.holding !== takes)
    fail('the hold takes where the current rules do not, or not', JSON.stringify({ takes }));
  if (!takes || Option.isNone(targets) || Option.isNone(first)) {
    if (view.askKey !== asked) fail('a hold that never took asks the player');
    return 'untaken';
  }
  if (view.ask !== 'pause') fail('the hold took and asks no pause');
  const anchor = anchorOf(targets.value, first.value);
  if (Option.isNone(anchor)) return 'unanchored';
  let target = first.value;
  let moved = false;
  let ticks = 0;
  let tick = view.tick;
  let last: readonly [number, number] = [nx, ny];
  for (const [dx, dy] of gesture.moves) {
    last = [nx + dx, ny + dy];
    view = desk.pointer(30, { _tag: 'Move', id: 1, x: last[0], y: last[1] }, true);
    const choice = choiceAt(targets.value, anchor.value, dx, dy);
    if (Option.isSome(choice)) {
      const next = targetAt(targets.value, choice.value.line, choice.value.word);
      if (Option.isSome(next)) {
        if (!isChoice(target, choice.value)) ticks += 1;
        target = next.value;
        moved = !isChoice(first.value, choice.value);
      }
    }
    if (view.tick !== tick) {
      tick = view.tick;
      ticks -= 1;
    }
    const said = describeChoice(targets.value, target);
    const want = {
      line: target.line,
      word: target._tag === 'Word' ? target.word : -1,
      said: Option.isSome(said) ? spoken(said.value) : '',
    };
    const got = { line: view.holdLine, word: view.holdWord, said: view.holdSaid };
    if (JSON.stringify(got) !== JSON.stringify(want))
      fail('the held choice is not the current one', JSON.stringify({ got, want }));
  }
  if (ticks !== 0)
    fail('a tick where the choice did not change, or none where it did', JSON.stringify({ ticks }));
  const up = gesture.away ? [last[0] + SLOP + 20, last[1]] : last;
  view = desk.pointer(40, { _tag: 'Up', id: 1, button: 0, x: up[0] ?? 0, y: up[1] ?? 0 }, true);
  const want = gesture.away
    ? { ask: 'resume', at: view.askAt }
    : moved
      ? { ask: 'seek', at: target.ms / 1000 }
      : { ask: 'lift', at: view.askAt };
  const got = { ask: view.ask, at: view.askAt };
  if (view.holding || JSON.stringify(got) !== JSON.stringify(want))
    fail('the lift', JSON.stringify({ got, want }));
  return want.ask;
};

describe('the port’s held seek beside the current app’s seek rules', () => {
  it('takes, holds and seeks as the current rules over generated gestures', () => {
    expect(hymns.length).toBeGreaterThan(600);
    const ends = new Map<string, number>();
    for (let seed = 1; seed <= CASES; seed += 1) {
      const end = run(seed);
      ends.set(end, (ends.get(end) ?? 0) + 1);
    }
    for (const end of ['untaken', 'seek', 'lift', 'resume'])
      expect(ends.get(end) ?? 0).toBeGreaterThan(10);
  });
});
