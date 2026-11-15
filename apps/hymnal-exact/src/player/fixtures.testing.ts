/* oxlint-disable effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): the test score's rules branch plainly. */

/**
 * What the player's tests step: three hymns, one of them with no
 * recording, each with a score whose sung time is its own (a hymn of three
 * stanzas whose choice of the first two sings two thirds of the time), and
 * generated inputs of every kind, the device's naming the current load,
 * an earlier one, a later one or none.
 */

import { type Random, below, pick } from '../test/random.ts';
import type { Score } from './score.ts';
import type { Input, State, Track, Why } from './step.ts';

/** Two thirds of the time for any choice of fewer than all of three stanzas. */
const thirds: Score = {
  count: 3,
  sung: (choice, recording) => (choice.length === 0 ? recording : (recording * 2) / 3),
  toggle: (choice, stanza) => {
    if (stanza < 1 || stanza > 3) return choice;
    const chosen = choice.length === 0 ? [1, 2, 3] : [...choice];
    const next = chosen.includes(stanza)
      ? chosen.length === 1
        ? chosen
        : chosen.filter((n) => n !== stanza)
      : [...chosen, stanza].toSorted((a, b) => a - b);
    return next.length === 3 ? [] : next;
  },
  chosen: (choice) => (choice.length === 0 ? [1, 2, 3] : choice),
};

export const TRACKS: ReadonlyArray<Track> = [
  { number: 1, title: 'One', url: 'http://127.0.0.1:4797/audio/warm-1/sdah/1.mp3', score: thirds },
  { number: 2, title: 'Two', url: 'http://127.0.0.1:4797/audio/warm-1/sdah/2.mp3', score: thirds },
  { number: 13, title: 'Thirteen', url: '', score: thirds },
];

export const titleOf = (number: number) =>
  TRACKS.find((track) => track.number === number)?.title ?? '';

const PATHS = ['/', '/hymns/1', '/hymns/2', '/hymns/13', '/hymns/7', '/player'];

/** A stack as the root's paths name it: the list, then up to two screens, a sheet at most last. */
const stackOf = (random: Random): ReadonlyArray<string> => {
  const above = Array.from({ length: below(random, 3) }, () => pick(random, PATHS)).filter(
    (path) => path !== '/',
  );
  return ['/', ...above.filter((path, index) => path !== '/player' || index === above.length - 1)];
};

/** A load id an event may name: the held one, the one before, the next, or none. */
const idOf = (random: Random, state: State) =>
  pick(random, [state.held?.load ?? 0, state.held?.load ?? 0, state.loads - 1, state.loads + 1, 0]);

const WHY: ReadonlyArray<Why> = ['network', 'missing', 'decode'];

const RESTORED: ReadonlyArray<Readonly<Record<string, ReadonlyArray<number>>>> = [
  {},
  { '1': [1] },
  { '2': [2, 3] },
];

/** One input of any kind, its numbers often at their edges. */
export const inputOf = (random: Random, state: State): Input => {
  const id = idOf(random, state);
  const seconds = pick(random, [0, 1, 2.5, 5, 6, 9, 30, -1, Number.NaN, Infinity]);
  const inputs: ReadonlyArray<() => Input> = [
    () => ({ _tag: 'play', track: pick(random, TRACKS) }),
    () => ({ _tag: 'pause' }),
    () => ({ _tag: 'resume' }),
    () => ({ _tag: 'stop' }),
    () => ({ _tag: 'chooseStanza', stanza: below(random, 5) }),
    () => ({ _tag: 'openSheet' }),
    () => ({ _tag: 'closeSheet' }),
    () => ({ _tag: 'titlePressed' }),
    () => ({ _tag: 'retry' }),
    () => ({ _tag: 'loaded', id, duration: seconds }),
    () => ({ _tag: 'time', id, seconds }),
    () => ({ _tag: 'time', id, seconds }),
    () => ({ _tag: 'waiting', id }),
    () => ({ _tag: 'played', id }),
    () => ({ _tag: 'playing', id }),
    () => ({ _tag: 'playing', id }),
    () => ({ _tag: 'paused', id }),
    () => ({ _tag: 'ended', id }),
    () => ({ _tag: 'failed', id, why: pick(random, WHY) }),
    () => ({ _tag: 'interrupted' }),
    () => ({ _tag: 'remote', action: pick(random, ['play', 'pause'] as const) }),
    () => ({ _tag: 'screen', stack: stackOf(random) }),
    () => ({ _tag: 'restore', choices: pick(random, RESTORED) }),
  ];
  return pick(random, inputs)();
};
