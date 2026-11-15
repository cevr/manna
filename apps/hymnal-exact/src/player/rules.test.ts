/* oxlint-disable effect/noTernary, effect/noNullish, effect/noNodeBuiltinImport, effect/noAsyncFunction -- a Bun test, which awaits the current app's modules once, that holds the port's player to the current app's own rules by generated properties; it reads `app.ts`'s text to hold its grants, and the generators import no effect but its `Option`, which the current app's bar takes. */

/**
 * The player's rules are the current app's (A2): the bar's choice is
 * `playerFor`'s and `dockedBar`'s, a press on the full player's title goes
 * where `titleGoes` says, a stanza choice toggles as `toggle` does and the
 * shown length is the cut's (`cutOf`) for 50 hymns of the book, times read
 * as `clock`, and each hymn's recording is at the current app's `audioUrl`.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { audioUrl } from '@manna/hymnal-app/remote';
import { clock } from '@manna/hymnal-app/player/time';
import { cutOf, keptOf, toggle } from '@manna/hymnal-app/player/stanzas';
import type { Section, Timeline } from '@manna/hymnal-app/player/stanzas';
import { titleGoes } from '@manna/hymnal-app/player/title';
import { setHolds, setOf } from '@manna/hymnal/recordings';
import { Option } from 'effect';

import { book } from '../hymns/book.ts';
import { below, pick, seeded } from '../test/random.ts';
import { current } from './current.testing.ts';
import { TRACKS, inputOf, titleOf } from './fixtures.testing.ts';
import { scoreOf } from './score.ts';
import { BUCKET, originOf, recordingAt, recorded } from './sources.ts';
import { type State, initial, pageOf, step, timesOf } from './step.ts';
import { decodeChoices, encodeChoices, viewOf } from './view.ts';

/** `count` sung lines, each 1 to 8 s long, from a lead of up to 10 s. */
const timelineOf = (random: () => number, count: number): Timeline => {
  let at = below(random, 10_000);
  const first = at;
  const lines = Array.from({ length: count }, () => {
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

const statesOf = (seed: number, steps: number): ReadonlyArray<State> => {
  const random = seeded(seed);
  const states: Array<State> = [];
  let state = initial;
  for (let at = 0; at < steps; at++) {
    state = step(state, inputOf(random, state)).state;
    states.push(state);
  }
  return states;
};

describe('the rules are the current app’s', async () => {
  const { bar, player } = await current();
  const { Player } = player;

  it('the page’s own button offers Pause exactly while playerFor says its hymn sounds', () => {
    for (let seed = 1; seed <= 60; seed++)
      for (const state of statesOf(seed, 30)) {
        const page = pageOf(state);
        if (page === undefined) continue;
        const { held } = state;
        const track = { number: page, title: titleOf(page) };
        const theirs =
          held === undefined
            ? Player.Idle()
            : held.phase === 'loading'
              ? Player.Loading({ track: { number: held.track.number, title: held.track.title } })
              : held.phase === 'playing'
                ? Player.Playing({
                    track: { number: held.track.number, title: held.track.title },
                    at: 0,
                    length: Option.none(),
                  })
                : Player.Paused({
                    track: { number: held.track.number, title: held.track.title },
                    at: 0,
                    length: Option.none(),
                  });
        const sounds = bar.sounding(bar.playerFor(theirs, track));
        const view = viewOf(state, undefined, titleOf);
        if (held?.phase === 'buffering') continue;
        expect(view.pageToggle === 'pause').toBe(sounds);
      }
  });

  it('a press on the title goes where titleGoes says, for any stack', () => {
    const random = seeded(7);
    const paths = ['/', '/hymns/1', '/hymns/2', '/hymns/13', '/hymns/400'];
    for (let run = 0; run < 400; run++) {
      const under = Array.from({ length: below(random, 3) }, () => pick(random, paths));
      const stack = [...under, '/player'];
      const track = pick(random, TRACKS);
      let state = step(initial, { _tag: 'play', track }).state;
      state = step(state, { _tag: 'screen', stack }).state;
      const went = step(state, { _tag: 'titlePressed' }).state.go;
      const routes = stack.map((path) => {
        const n = /^\/hymns\/(\d+)$/u.exec(path)?.[1];
        return n === undefined ? { name: path } : { name: 'hymns/[number]', params: { number: n } };
      });
      const theirs = titleGoes({ routes, index: routes.length - 1 }, track.number);
      const expected: { readonly kind: string; readonly path: string; readonly close: boolean } =
        theirs._tag === 'Close'
          ? { kind: 'back', path: '', close: false }
          : theirs._tag === 'Open'
            ? { kind: 'push', path: `/hymns/${track.number}`, close: true }
            : { kind: 'replace', path: `/hymns/${track.number}`, close: false };
      const got: typeof expected = { kind: went.kind, path: went.path, close: went.close };
      expect(got).toEqual(expected);
      expect(went.serial).toBe(1);
    }
  });

  it('a stanza choice toggles as toggle does, and the length shown is the cut’s, for 50 hymns', () => {
    const random = seeded(11);
    const hymns = Array.from({ length: 50 }, () => pick(random, book.hymns));
    for (const hymn of hymns) {
      const sections = hymn.sections as ReadonlyArray<Section>;
      const lines = sections.reduce((sum, section) => sum + section.lines.length, 0);
      const timeline = timelineOf(random, lines);
      const score = scoreOf(sections, timeline);
      const track = { number: hymn.number, title: hymn.title, url: 'x', score };
      const length = (timeline.end + below(random, 20_000)) / 1000;
      let state = step(initial, { _tag: 'play', track }).state;
      state = step(state, { _tag: 'loaded', id: 1, duration: length }).state;
      let theirs: ReadonlyArray<number> = [];
      for (let tap = 0; tap < 6; tap++) {
        const stanza = below(random, score.count + 2);
        state = step(state, { _tag: 'chooseStanza', stanza }).state;
        theirs = toggle(theirs, stanza, score.count);
        expect(state.choices[`${hymn.number}`]).toEqual(theirs);
        const cut = cutOf(timeline, keptOf(sections, theirs));
        const shown = theirs.length === 0 ? length : cut.sungAt(length * 1000) / 1000;
        expect(timesOf(state).total).toBeCloseTo(shown, 9);
        expect(viewOf(state, undefined, titleOf).total).toBe(clock(shown));
      }
    }
  });

  it('times read as clock reads them', () => {
    const random = seeded(3);
    for (let run = 0; run < 200; run++) {
      const track = pick(random, TRACKS.slice(0, 2));
      const seconds = below(random, 100_000) / 100;
      let state = step(initial, { _tag: 'play', track }).state;
      state = step(state, { _tag: 'loaded', id: 1, duration: 2000 }).state;
      state = step(state, { _tag: 'time', id: 1, seconds }).state;
      expect(viewOf(state, undefined, titleOf).elapsed).toBe(clock(seconds));
    }
  });

  it('each hymn’s recording is at the current app’s address, and the same hymns have none', () => {
    for (let number = -2; number <= 700; number++) {
      const theirs = number >= 1 && number <= 695 && setHolds(setOf(number), number);
      expect(recorded(number)).toBe(theirs);
      if (theirs) expect(recordingAt(BUCKET, number)).toBe(audioUrl(number));
      else expect(recordingAt(BUCKET, number)).toBe('');
    }
    expect(book.hymns.filter((hymn) => !recorded(hymn.number))).toEqual([]);
  });
});

describe('the recordings’ origin', () => {
  it('a plain launch plays from the bucket, and only a loopback fixture replaces it', () => {
    expect(originOf(undefined)).toBe('https://hymns.cvr.im');
    expect(originOf('http://127.0.0.1:4797')).toBe('http://127.0.0.1:4797');
    for (const other of [
      'https://example.com',
      'http://localhost:4797',
      'http://127.0.0.1:4797/',
      'http://127.0.0.1',
      'https://127.0.0.1:4797',
      'http://127.0.0.1:4797.evil.com',
      '',
    ])
      expect(originOf(other)).toBe(BUCKET);
  });

  it('the grants name the bucket and the fixture alone, and the origin defaults to the bucket', () => {
    const app = readFileSync(new URL('../../app.ts', import.meta.url), 'utf8');
    expect(app).toContain(
      "const origin = import.meta.env.HYMNAL_RECORDINGS ?? 'https://hymns.cvr.im';",
    );
    const grants = /export const grants = \{([^}]*)\};/u.exec(app)?.[1] ?? '';
    expect(
      grants
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    ).toEqual([
      "'https://hymns.cvr.im': 'net.fetch https://hymns.cvr.im',",
      "'http://127.0.0.1:4797': 'net.fetch http://127.0.0.1:4797',",
    ]);
  });
});

describe('a stanza choice is kept', () => {
  it('reads back what it wrote, and nothing else', () => {
    const random = seeded(5);
    for (let run = 0; run < 200; run++) {
      const choices: Record<string, ReadonlyArray<number>> = {};
      for (let hymn = 0; hymn < below(random, 4); hymn++) {
        const stanzas = [1, 2, 3, 4, 5].filter(() => below(random, 2) === 0);
        choices[`${1 + below(random, 695)}`] = stanzas;
      }
      const kept = Object.fromEntries(Object.entries(choices).filter(([, c]) => c.length > 0));
      expect(decodeChoices(encodeChoices(choices))).toEqual(kept);
    }
    for (const bad of ['x', '1:', ':1', '1:2.1', '0:1', '1:0', '1:1,,', '9999:1'])
      expect(Object.keys(decodeChoices(bad)).length <= 1).toBe(true);
    expect(decodeChoices('1:2.1')).toEqual({});
    expect(decodeChoices('12:1.3,45:2')).toEqual({ '12': [1, 3], '45': [2] });
  });
});
