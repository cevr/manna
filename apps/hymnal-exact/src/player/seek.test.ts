/* oxlint-disable effect/noTernary, effect/noNullish -- a Bun test that holds the port's seek to the current app's own rules by generated properties, over `step`'s plain state, and reads the player's Contract file and the brand's text to hold their literals and roles. */

/**
 * The seek's rules are the current app's (A2), and the player's filled
 * buttons are the brand's (A4):
 *
 * - a drag sends one seek at its release, and none when it ends on the
 *   second the bar showed at its start (`sends`); the thumb stands where
 *   `placeAt` puts it; the step's `nudge` and the lock screen's skip move
 *   by `nudged`, and the bar's VoiceOver swipe by `NUDGE` (`adjust-step`,
 *   carried as an Exact patch), its drag left to the default step;
 * - for 50 hymns of the book under generated choices, and every choice of
 *   5, the cut's clock, every span the player skips and where it lands are
 *   `cutOf`'s over `keptOf`; a stanza's place is its first line's target
 *   (`targetsOf`, `targetAt`) and its first line's start on the cut's clock;
 * - the Contract file's settle, skip offsets and the bar's adjust step are
 *   `settleFor` and `NUDGE`;
 * - the filled buttons name `button` and `onButton` and no colour literal,
 *   and the tint is the brand's accent (owner, 2026-11-15).
 */

import { describe, expect, it } from 'bun:test';

import { targetAt, targetsOf } from '@manna/hymnal-app/follow/seek-targets';
import { NUDGE, nudged, placeAt, sends, settleFor } from '@manna/hymnal-app/player/scrub-rules';
import { chosenOf, cutOf, keptOf, toggle } from '@manna/hymnal-app/player/stanzas';
import type { Section, Timeline } from '@manna/hymnal-app/player/stanzas';
import { Duration } from 'effect';

import { book } from '../hymns/book.ts';
import { appFile, brandOf } from '../look/design.testing.ts';
import { below, pick, seeded } from '../test/random.ts';
import { type Choice, plainScore, scoreOf } from './score.ts';
import { type State, type Track, initial, step, timesOf } from './step.ts';

/** `count` sung lines, each 1 to 8 s long, from a lead of up to 10 s, now and then a rest between two. */
const timelineOf = (random: () => number, count: number): Timeline => {
  let at = below(random, 10_000);
  const first = at;
  const lines = Array.from({ length: count }, (_, index) => {
    if (index > 0 && below(random, 4) === 0) at += below(random, 3000);
    const start = at;
    at += 1000 + below(random, 7000);
    return { start, until: at, played: true, even: false, syllables: [], words: [] };
  });
  return {
    tempo: { microsPerQuarter: 500_000, numerator: 4, denominator: 4 },
    lines,
    first,
    end: at,
  };
};

/** The index among a hymn's lines of stanza `n`'s first line; -1 for none. */
const firstLineOf = (sections: ReadonlyArray<Section>, n: number) => {
  let line = 0;
  for (const section of sections) {
    if (section.kind === 'stanza' && section.n === n) return section.lines.length > 0 ? line : -1;
    line += section.lines.length;
  }
  return -1;
};

/** A track playing `score` with a recording `length` seconds long, its device told so. */
const playing = (score: Track['score'], length: number, choice: Choice = []): State => {
  const track: Track = { number: 1, title: 'One', url: 'x', score };
  let state = step(initial, { _tag: 'restore', choices: { '1': choice } }).state;
  state = step(state, { _tag: 'play', track }).state;
  state = step(state, { _tag: 'played', id: 1 }).state;
  state = step(state, { _tag: 'playing', id: 1 }).state;
  return step(state, { _tag: 'loaded', id: 1, duration: length }).state;
};

const sample = (random: () => number) => {
  const hymn = pick(random, book.hymns);
  const sections = hymn.sections as ReadonlyArray<Section>;
  const lines = sections.reduce((sum, section) => sum + section.lines.length, 0);
  const timeline = timelineOf(random, lines);
  return { hymn, sections, timeline, score: scoreOf(sections, timeline, hymn) };
};

/** Every choice of a hymn of `count` stanzas: each set of its stanzas, `[]` the whole. */
const choicesOf = (count: number): ReadonlyArray<Choice> =>
  Array.from({ length: 2 ** count }, (_, mask) =>
    Array.from({ length: count }, (_, at) => at + 1).filter((n) => (mask >> (n - 1)) & 1),
  );

/** Hold the score of one hymn under `choice` to `cutOf`, `keptOf`, `targetsOf` and `targetAt`. */
const holds = (
  { hymn, sections, timeline, score }: ReturnType<typeof sample>,
  choice: Choice,
  random: () => number,
) => {
  const cut = cutOf(timeline, keptOf(sections, choice));
  const skips = choice.length === 0 ? [] : cut.skips;
  expect(score.skips(choice)).toEqual(
    skips.map((skip) => ({ from: skip.from / 1000, to: skip.to / 1000 })),
  );
  for (let probe = 0; probe < 8; probe++) {
    const recording = below(random, timeline.end + 5000);
    const sung = choice.length === 0 ? recording : cut.sungAt(recording);
    expect(score.sung(choice, recording / 1000)).toBeCloseTo(sung / 1000, 9);
  }
  const length = (timeline.end + 2000) / 1000;
  for (const skip of score.skips(choice)) {
    const state = playing(score, length, choice);
    const inside = skip.from + (skip.to - skip.from) * random();
    const ticked = step(state, { _tag: 'time', id: 1, serial: 0, seconds: inside });
    expect(ticked.command).toEqual({
      _tag: 'seek',
      id: 1,
      seconds: Math.min(skip.to, length),
      serial: 1,
      skip: true,
    });
    expect(score.sung(choice, skip.to)).toBeCloseTo(score.sung(choice, skip.from), 9);
  }
  const targets = targetsOf(hymn, timeline, choice);
  for (let n = 0; n <= score.count + 1; n++) {
    const line = firstLineOf(sections, n);
    const sung = chosenOf(choice, score.count).includes(n) && line >= 0;
    const place = score.stanzaAt(choice, n);
    if (!sung || targets._tag === 'None') {
      expect(place).toBeUndefined();
      continue;
    }
    const target = targetAt(targets.value, line, { _tag: 'None' } as never);
    expect(place).toBe(target._tag === 'Some' ? target.value.ms / 1000 : undefined);
    const start = timeline.lines[line]?.start ?? 0;
    expect(place).toBeCloseTo((choice.length === 0 ? start : cut.sungAt(start)) / 1000, 9);
  }
};

describe('the seek’s rules are the current app’s', () => {
  it('a drag sends one seek at release, none on the second it started on, the thumb where placeAt puts it', () => {
    const random = seeded(17);
    let sent = 0;
    for (let run = 0; run < 200; run++) {
      const length = 1 + below(random, 60_000) / 100;
      let state = playing(plainScore, length);
      state = step(state, {
        _tag: 'time',
        id: 1,
        serial: 0,
        seconds: below(random, length * 100) / 100,
      }).state;
      const start = timesOf(state).elapsed;
      state = step(state, { _tag: 'dragStart' }).state;
      let to = start;
      for (let move = 0; move < 1 + below(random, 3); move++) {
        const asked = pick(random, [
          -5,
          length + 5,
          start + 0.4,
          start - 0.4,
          below(random, length * 100) / 100,
        ]);
        to = placeAt(asked, length, length);
        const moved = step(state, { _tag: 'dragTo', seconds: asked });
        expect(moved.command).toBeUndefined();
        state = moved.state;
        expect(timesOf(state).elapsed).toBe(to);
      }
      const released = step(state, { _tag: 'dragEnd' });
      expect(released.command?._tag === 'seek').toBe(sends(start, to));
      if (released.command?._tag === 'seek') {
        sent++;
        expect(released.command.seconds).toBeCloseTo(to, 9);
      }
    }
    expect(sent).toBeGreaterThan(50);
  });

  it('a nudge (which no Contract event sends yet) and the lock screen’s skip move by nudged', () => {
    const random = seeded(19);
    for (let run = 0; run < 150; run++) {
      const length = 1 + below(random, 60_000) / 100;
      let state = playing(plainScore, length);
      state = step(state, {
        _tag: 'time',
        id: 1,
        serial: 0,
        seconds: below(random, length * 100) / 100,
      }).state;
      const shown = timesOf(state).elapsed;
      const way = pick(random, [1, -1] as const);
      const to = nudged(shown, length, way);
      const moved = step(state, { _tag: pick(random, ['nudge', 'remoteSkip'] as const), way });
      if (sends(shown, to)) expect(timesOf(moved.state).elapsed).toBeCloseTo(to, 9);
      else expect(moved.command).toBeUndefined();
    }
  });

  it('the cut’s clock, its skips and each stanza’s place, for 50 hymns under generated choices', () => {
    const random = seeded(23);
    for (let run = 0; run < 50; run++) {
      const hymn = sample(random);
      let choice: Choice = [];
      for (let tap = 0; tap < 4; tap++) {
        choice = toggle(choice, 1 + below(random, hymn.score.count + 1), hymn.score.count);
        holds(hymn, choice, random);
      }
    }
  });

  it('the same, for every choice of 5 hymns', () => {
    const random = seeded(29);
    let hymns = 0;
    while (hymns < 5) {
      const hymn = sample(random);
      if (hymn.score.count < 3 || hymn.score.count > 6) continue;
      hymns++;
      for (const choice of choicesOf(hymn.score.count)) holds(hymn, choice, random);
    }
  });
});

describe('the player’s Contract file keeps the current app’s numbers and the brand’s roles', () => {
  const contract = appFile('features/player.contract') + appFile('features/bar.contract');

  it('holds a sent place as long as settleFor, and the lock screen and VoiceOver skip by NUDGE', () => {
    expect(contract).toContain(`after(${Duration.toMillis(settleFor)}, playerSettled)`);
    expect(contract).toContain(`seekbackwardOffset=${NUDGE} seekforwardOffset=${NUDGE}`);
    const bar = /\n\s*input type="range" id="position" ([^\n]*)/u.exec(contract)?.[1] ?? '';
    expect(bar).toContain(`adjust-step=${NUDGE} `);
    expect(bar).not.toMatch(/(?:^|\s)step=/u);
  });

  it('draws its marks and chips in the current app’s roles, names no colour, and the tint is the brand’s accent', () => {
    const mark =
      /component PlayerMark\n[\s\S]*?\n {4}button ([^\n]*)\n {6}:active\n {8}([^\n]*)\n {6}image ([^\n]*)/u.exec(
        contract,
      );
    expect(mark?.[2]).toBe('background-color = "soft"');
    expect(mark?.[3]).toContain('color="button"');
    const pill = /component PlayerPill\n[\s\S]*?\n {4}button ([^\n]*)\n {6}text ([^\n]*)/u.exec(
      contract,
    );
    expect(pill?.[1]).toContain('background-color=(chosen ? "chosen" : "pill")');
    expect(pill?.[2]).toContain('color=(chosen ? "onChosen" : "onPill")');
    expect(contract.match(/PlayerMark\(/gu)?.length).toBe(2);
    expect(contract).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|light-dark\(/iu);
    const brand = brandOf(appFile('app.forma'));
    expect(
      ['button', 'soft', 'pill', 'onPill', 'chosen', 'onChosen'].every((role) =>
        brand.colours.has(role),
      ),
    ).toBe(true);
    expect(brand.names.get('AccentColor')).toBe('accent');
  });
});
