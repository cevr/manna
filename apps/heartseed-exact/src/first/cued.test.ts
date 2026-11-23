/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- each launch's calls are awaited in turn as Exact asks them, and an absent result is `null` on the wire as the Contract reads it. */

/**
 * The first minute's line in Today's sources (`todayOpen`): the route
 * `first` recites the first verse as `/cue/<cue>` does, and each new cue
 * there starts a fresh recital, so letters' graded try leaves nothing on
 * alone; under `/cue/<cue>` a graded try still keeps its cue, as before.
 */

import { describe, expect, it } from 'bun:test';
import { FIRST_VERSE } from '@manna/heartseed/first/verse';

import { makeSessionPort } from '../test/session-model';
import type { TodayScreen } from '../today/sources';

const NOW = Date.parse('2026-11-14T12:00:00Z');

const open = (
  port: ReturnType<typeof makeSessionPort>,
  route: string,
  cue: string,
  minutes = '5',
) => port.call<TodayScreen>('todayOpen', [route, '', cue, minutes, 'her', NOW, 7]);

/** A try said and finished on `port`: graded, its result pending. */
const graded = async (port: ReturnType<typeof makeSessionPort>) => {
  await port.call<TodayScreen>('todaySay', ['heard-1', NOW + 1000, 7]);
  return port.call<TodayScreen>('todayFinish', []);
};

describe('the first minute in Today', () => {
  it('recites the first verse under the cue its route names', async () => {
    const port = makeSessionPort();
    const shown = await open(port, 'first', 'full');
    expect([shown.session.mode, shown.cue, shown.reference, shown.canSay]).toEqual([
      'cued',
      'full',
      FIRST_VERSE,
      true,
    ]);
  });

  it('starts a fresh recital at each new cue of the route `first`', async () => {
    const port = makeSessionPort();
    await open(port, 'first', 'initials');
    const done = await graded(port);
    expect([done.phase, done.pending === null]).toEqual(['graded', false]);
    const alone = await open(port, 'first', 'none');
    expect([alone.phase, alone.cue, alone.pending, alone.last]).toEqual([
      'resting',
      'none',
      null,
      null,
    ]);
  });

  it('keeps a try on the same cue of the route `first`, as a Minutes change', async () => {
    const port = makeSessionPort();
    await open(port, 'first', 'initials');
    await graded(port);
    const again = await open(port, 'first', 'initials', '10');
    expect(again.phase).toBe('graded');
  });

  it('keeps a graded try under `/cue/<cue>` across a change of cue, as before', async () => {
    const port = makeSessionPort();
    await open(port, 'cued', 'initials');
    await graded(port);
    const next = await open(port, 'cued', 'none');
    expect([next.phase, next.cue]).toEqual(['graded', 'initials']);
  });
});
