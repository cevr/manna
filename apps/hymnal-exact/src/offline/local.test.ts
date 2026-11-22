/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTernary, eslint/no-await-in-loop -- the current app's localOver is imported once, after the stand-ins its import graph needs (`current.testing.ts`), and run under Effect beside the port's source, each case awaited in turn as the host awaits it; the port's player is reached as the data module reaches it, its stand-in store answering plainly. */

/**
 * The element's source against the current app's `localOver`
 * (`player/offline.ts`, imported, never copied): over generated hymns,
 * key moves, the chords switch and saved sets, a Play's source in the port
 * is the one `localOver` hands the device: the saved file of the recording
 * the play sounds (the hymn in its moved key while chords are on), else the
 * streamed address.
 */

import { describe, expect, it } from 'bun:test';
import { soundingOffset } from '@manna/hymnal-app/remote';
import { Effect, Option } from 'effect';

import type * as Local from '@manna/hymnal-app/player/offline';
import { book } from '../hymns/book.ts';
import { current } from '../player/current.testing.ts';
import { BUCKET, playerSources } from '../player/sources.ts';
import { below, pick, seeded } from '../test/random.ts';
import type { Offline } from './sources.ts';
import { pathOf } from './store.ts';

const CASES = 150;
const KEPT = { get: () => null };

/** The saved recordings as a set of identities, as the store answers the player. */
const savedOf = (saved: ReadonlySet<string>): Offline => ({
  start: () => undefined,
  localOf: (id) => (saved.has(`${id.number}_${id.offset}`) ? pathOf(id) : ''),
  lookup: () => undefined,
  enqueue: () => undefined,
  verify: () => undefined,
});

/** The source the current `localOver` hands the device for a play of `uri` sounding `recording`. */
const theirs = (
  local: typeof Local.localOver,
  uri: string,
  recording: Local.Choice,
  saved: ReadonlySet<string>,
) => {
  let sent = '';
  const told: Local.Told = { state: 'playing', positionMs: 0 };
  const device: Local.LocalDevice = {
    play: (source) =>
      Effect.sync(() => {
        sent = source;
        return told;
      }),
    pause: Effect.succeed(told),
    resume: Effect.succeed(told),
    stop: Effect.void,
  };
  const cache = {
    local: (id: Local.Choice) =>
      Effect.succeed(
        saved.has(`${id.number}_${id.offset}`) ? Option.some(pathOf(id)) : Option.none<string>(),
      ),
  };
  return Effect.runPromise(
    Effect.map(local(device, cache).play(uri, 0, { recording, intent: 'play' }), () => sent),
  );
};

describe('a play’s source over the saved recordings, as the current localOver', () => {
  it('plays the saved file of what it sounds, else streams it', async () => {
    await current();
    const { localOver } = await import('@manna/hymnal-app/player/offline');
    const random = seeded(7);
    const seen = new Set<string>();
    for (let index = 0; index < CASES; index += 1) {
      const number = 1 + below(random, 695);
      const transpose = pick(random, [0, -1, 2, 5, -6]);
      const chords = random() < 0.7;
      const offset = chords ? soundingOffset(transpose) : 0;
      const saved = new Set(
        [0, soundingOffset(transpose), soundingOffset(transpose + 1)]
          .filter(() => random() < 0.5)
          .map((each) => `${number}_${each}`),
      );
      const sourceOver = async (kept: ReadonlySet<string>) => {
        const port = playerSources(book, [], BUCKET, savedOf(kept));
        await port.playerStep(['keys', 0, 0, chords ? 1 : 0, `${number}:${transpose}:0`], KEPT);
        return port.playerStep(['play', 0, 0, number, ''], KEPT);
      };
      const stream = await sourceOver(new Set());
      const streamed = stream.src;
      const expected = await theirs(localOver, streamed, { number, offset: stream.offset }, saved);
      const ours = (await sourceOver(saved)).src;
      if (stream.offset !== offset) seen.add('a move the dial cannot keep');
      expect({ number, transpose, chords, saved: [...saved], source: ours }).toEqual({
        number,
        transpose,
        chords,
        saved: [...saved],
        source: expected,
      });
      if (ours !== streamed) seen.add('a saved file');
      else seen.add('streamed');
    }
    expect([...seen].toSorted()).toEqual([
      'a move the dial cannot keep',
      'a saved file',
      'streamed',
    ]);
  });
});
