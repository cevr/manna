/* oxlint-disable effect/noTernary, effect/noAsyncFunction -- the current app's player is imported after the stand-ins its import graph needs; its states are built as plain values. */

/**
 * The follow's report of the player (`reportFrom`, which the data module
 * runs) is the current app's (`follow/report.ts`'s `reportOf`, imported):
 * over generated player states of every kind, on the page's hymn or
 * another, at any place, rate and count-in, both make the same report. The
 * port's player view names a state by its phase (`src/player/view.ts`'s
 * `CAPTIONED`, the current state each phase is drawn as); Stopped, which
 * the port never holds, is named `none`.
 */

import { describe, expect, it } from 'bun:test';

import { current } from '../player/current.testing.ts';
import { below, pick, seeded } from '../test/random.ts';
import { reportFrom } from './follow.ts';

const { player } = await current();
const { reportOf } = await import('@manna/hymnal-app/follow/report');
const { Player } = player;

const KINDS = [
  ['Idle', 'none'],
  ['Loading', 'loading'],
  ['Playing', 'playing'],
  ['Buffering', 'buffering'],
  ['Paused', 'paused'],
  ['Ended', 'ended'],
  ['Stopped', 'none'],
  ['Failed', 'failed'],
] as const;

/** The current app's player state of `kind` on a track of hymn `number` at `at` sung seconds. */
const stateOf = (kind: (typeof KINDS)[number][0], number: number, at: number) => {
  const track = { number, title: '', stanzas: [] } as never;
  if (kind === 'Idle') return Player.Idle();
  if (kind === 'Loading') return Player.Loading({ track } as never);
  if (kind === 'Playing') return Player.Playing({ track, at, length: { _tag: 'None' } as never });
  if (kind === 'Buffering') return Player.Buffering({ track, at } as never);
  if (kind === 'Paused') return Player.Paused({ track, at } as never);
  if (kind === 'Ended') return Player.Ended({ track } as never);
  if (kind === 'Stopped') return Player.Stopped({ track } as never);
  return Player.Failed({ track, error: 'x' } as never);
};

describe('the follow’s report of the player', () => {
  it('is the current reportOf’s over generated states of every kind', () => {
    const random = seeded(31);
    const seen = new Set<string>();
    for (let n = 0; n < 2000; n += 1) {
      const [kind, phase] = pick(random, KINDS);
      const page = 1 + below(random, 695);
      const number = random() < 0.7 ? page : 1 + below(random, 695);
      const seconds = below(random, 400_000) / 1000;
      const rate = pick(random, [0.5, 0.75, 1, 1.25, 1.5]);
      const counting = random() < 0.3;
      const theirs = reportOf(page, stateOf(kind, number, seconds), rate, counting);
      const ours = reportFrom(page, { number, phase, at: seconds * 1000, rate, counting, seek: 0 });
      expect({ kind, number, page, counting, report: ours }).toEqual({
        kind,
        number,
        page,
        counting,
        report: theirs,
      });
      seen.add(`${kind} ${theirs._tag === 'Here' ? theirs.state : 'Away'}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(11);
  });
});
