/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noNewPromise, effect/noNewError, effect/noUnsafeDictionaryType, effect/noUnknownParameters, effect/noGlobals, effect/noTryCatch -- a Bun test of the Feel's sources, which import no effect, against a module held in memory that answers untyped JSON (a Promise held open or refused, no module as null), and of the web's own module with the page's fetch swapped for a recorder and put back. */

/**
 * The Feel's sources ask the app's module for the voice as the current
 * hymnal's `FeelProvider` and `sound.ts` ask theirs: the load names every
 * sound the table names, once; a play names the sound and how long until it is
 * due, and the source answers before the module does, so a gesture never
 * waits on a play, and a failed play is dropped. With no module, or a
 * sound the table does not name, nothing is asked. The web's module holds
 * no voice: it loads none (so `features/feel.contract` sends none) and
 * plays none; under the agent it says it holds them all and still plays
 * none.
 */

import { describe, expect, it } from 'bun:test';

import { connect, later } from '../../modules/web/index.js';
import { FEEL_SOUNDS } from './cues.ts';
import { feelSources, playRequest } from './sources.ts';

/** A module that records each request and answers as `answer` says. */
const moduleOf = (
  answer: (request: Record<string, unknown>) => Promise<Record<string, unknown>>,
) => {
  const asked: Array<Record<string, unknown>> = [];
  return {
    asked,
    native: {
      available: true,
      later: (request: Record<string, unknown>) => {
        asked.push(request);
        return answer(request);
      },
    },
  };
};

describe('the Feel’s sources', () => {
  it('loads every sound the table names, once a launch, and answers how many the module holds', async () => {
    const { asked, native } = moduleOf(async () => ({ loaded: FEEL_SOUNDS.length }));
    expect(await feelSources().feelLoad([], null, null, native)).toEqual({ loaded: 13 });
    expect(asked).toEqual([{ op: 'feel.load', names: FEEL_SOUNDS.join(' ') }]);
  });

  it('loads none with no module, or one that refuses', async () => {
    expect(await feelSources().feelLoad([], null, null, null)).toEqual({ loaded: 0 });
    const { native } = moduleOf(() => Promise.reject(new Error('no voice')));
    expect(await feelSources().feelLoad([], null, null, native)).toEqual({ loaded: 0 });
  });

  it('asks the module to play a sound when it is due, and answers before the module does', async () => {
    const { asked, native } = moduleOf(() => new Promise(() => {}));
    const sources = feelSources();
    expect(await sources.feelSound(['key-3', 12.5], null, null, native)).toEqual({
      serial: 1,
      sound: 'key-3',
      asked: true,
    });
    expect(await sources.feelSound(['thock', -5], null, null, native)).toEqual({
      serial: 2,
      sound: 'thock',
      asked: true,
    });
    expect(asked).toEqual([
      { op: 'feel.play', name: 'key-3', wait: 12.5 },
      { op: 'feel.play', name: 'thock', wait: 0 },
    ]);
  });

  it('drops a failed play', async () => {
    const { native } = moduleOf(() => Promise.reject(new Error('refused')));
    expect(await feelSources().feelSound(['thock', 0], null, null, native)).toEqual({
      serial: 1,
      sound: 'thock',
      asked: true,
    });
  });

  it('asks nothing with no module, or for a sound the table does not name', async () => {
    const { asked, native } = moduleOf(async () => ({}));
    const sources = feelSources();
    expect(await sources.feelSound(['thock', 0], null, null, null)).toEqual({
      serial: 1,
      sound: 'thock',
      asked: false,
    });
    expect(await sources.feelSound(['bell', 0], null, null, native)).toEqual({
      serial: 2,
      sound: 'bell',
      asked: false,
    });
    expect(asked).toEqual([]);
  });

  it('names how long until a sound is due, now when it is past', () => {
    expect(playRequest('thock', 16.5)).toEqual({ op: 'feel.play', name: 'thock', wait: 16.5 });
    expect(playRequest('thock', -1)).toEqual({ op: 'feel.play', name: 'thock', wait: 0 });
  });
});

describe('the web’s module holds no voice', () => {
  it('loads none and plays none, fetching nothing', async () => {
    const fetched: Array<unknown> = [];
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (input: unknown) => {
        fetched.push(input);
        return new Response('');
      },
      { preconnect: fetchBefore.preconnect },
    );
    try {
      connect({ changed: () => {}, agent: false, now: () => 0 });
      expect(await later({ op: 'feel.load', names: FEEL_SOUNDS.join(' ') })).toEqual({ loaded: 0 });
      expect(await later({ op: 'feel.play', name: 'thock', wait: 0 })).toEqual({ played: false });
      connect({ changed: () => {}, agent: true, now: () => 0 });
      expect(await later({ op: 'feel.load', names: FEEL_SOUNDS.join(' ') })).toEqual({
        loaded: 13,
      });
      expect(await later({ op: 'feel.play', name: 'thock', wait: 0 })).toEqual({ played: false });
    } finally {
      connect({ changed: () => {}, agent: false, now: () => 0 });
      globalThis.fetch = fetchBefore;
    }
    expect(fetched).toEqual([]);
  });
});
