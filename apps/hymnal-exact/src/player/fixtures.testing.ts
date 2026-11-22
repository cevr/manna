/* oxlint-disable effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a held hymn is undefined when none is held, as `step`'s state has it. */

/**
 * What the player's tests step: three hymns, one of them with no
 * recording, each scored by the current app's rules (`scoreOf`) over a
 * hymn of three stanzas of two sung lines, a second each, after a lead of
 * half a second, so a stanza choice has spans to skip within the lengths
 * the device tells; and generated inputs of every kind, the device's
 * naming the current load, an earlier one, a later one or none, and the
 * current seek, an earlier one, a later one or none.
 */

import type { Section, Timeline } from '@manna/hymnal-app/player/stanzas';

import { type Random, below, pick } from '../test/random.ts';
import { scoreOf } from './score.ts';
import type { Input, State, Track, Why } from './step.ts';

const SECTIONS: ReadonlyArray<Section> = [1, 2, 3].map((n) => ({
  kind: 'stanza',
  n,
  lines: ['la la la', 'la la'],
}));

/** Six sung lines of a second each from half a second in: stanza `n` sings from `2n - 1.5` s to `2n + 0.5` s. */
export const TIMELINE: Timeline = {
  tempo: { microsPerQuarter: 500_000, numerator: 4, denominator: 4 },
  lines: Array.from({ length: 6 }, (_, index) => ({
    start: 500 + index * 1000,
    until: 1500 + index * 1000,
    played: true,
    even: false,
    syllables: [],
    words: [],
  })),
  first: 500,
  end: 6500,
};

const hymnOf = (number: number) => ({
  number,
  title: `${number}`,
  firstLine: 'la la la',
  topic: 'Test',
  sections: SECTIONS,
});

export const TRACKS: ReadonlyArray<Track> = [
  {
    number: 1,
    title: 'One',
    url: 'http://127.0.0.1:4797/audio/warm-1/sdah/1.mp3',
    score: scoreOf(SECTIONS, TIMELINE, hymnOf(1)),
  },
  {
    number: 2,
    title: 'Two',
    url: 'http://127.0.0.1:4797/audio/warm-1/sdah/2.mp3',
    score: scoreOf(SECTIONS, TIMELINE, hymnOf(2)),
  },
  {
    number: 13,
    title: 'Thirteen',
    url: '',
    score: scoreOf(SECTIONS, TIMELINE, hymnOf(13)),
  },
];

export const titleOf = (number: number) =>
  TRACKS.find((track) => track.number === number)?.title ?? '';

const PATHS = ['/', '/hymns/1', '/hymns/2', '/hymns/13', '/hymns/7', '/player', '/settings'];

/** A stack as the root's paths name it: the list, then up to two screens, a sheet at most last. */
const stackOf = (random: Random): ReadonlyArray<string> => {
  const above = Array.from({ length: below(random, 3) }, () => pick(random, PATHS)).filter(
    (path) => path !== '/',
  );
  return [
    '/',
    ...above.filter(
      (path, index) => (path !== '/player' && path !== '/settings') || index === above.length - 1,
    ),
  ];
};

/** A load id an event may name: the held one, the one before, the next, or none. */
const idOf = (random: Random, state: State) =>
  pick(random, [state.held?.load ?? 0, state.held?.load ?? 0, state.loads - 1, state.loads + 1, 0]);

/** A seek serial an event may name: the held load's, the one before, the next, or none. */
const serialOf = (random: Random, state: State) =>
  pick(random, [
    state.held?.seek ?? 0,
    state.held?.seek ?? 0,
    state.held?.seek ?? 0,
    (state.held?.seek ?? 0) - 1,
    (state.held?.seek ?? 0) + 1,
    0,
  ]);

const WHY: ReadonlyArray<Why> = ['network', 'missing', 'decode'];

const RESTORED: ReadonlyArray<Readonly<Record<string, ReadonlyArray<number>>>> = [
  {},
  { '1': [1] },
  { '2': [2, 3] },
  { '1': [1, 3] },
];

/** A place the device may tell: near the held one, often in a span the choice skips, or at an edge. */
const placeOf = (random: Random, state: State) =>
  pick(random, [
    0,
    1,
    2.5,
    3.2,
    5,
    6,
    9,
    30,
    -1,
    Number.NaN,
    Infinity,
    (state.held?.at ?? 0) + 0.25,
    (state.held?.at ?? 0) + 0.25,
    (state.held?.at ?? 0) + 0.6,
    (state.held?.sought ?? 0) + 0.3,
  ]);

/** A place just inside a span the held hymn's choice leaves out, or the held place when it skips none. */
const skippedOf = (random: Random, state: State) => {
  const { held } = state;
  if (held === undefined) return 0;
  const spans = held.track.score.skips(state.choices[`${held.track.number}`] ?? []);
  if (spans.length === 0) return held.at + 0.25;
  const span = pick(random, spans);
  return span.from + pick(random, [0, 0.1, 0.3]);
};

/** One input of any kind, its numbers often at their edges. */
export const inputOf = (random: Random, state: State): Input => {
  const id = idOf(random, state);
  const serial = serialOf(random, state);
  const seconds = placeOf(random, state);
  const way = pick(random, [1, -1] as const);
  const load = state.held?.load ?? 0;
  const seek = state.held?.seek ?? 0;
  const inputs: ReadonlyArray<() => Input> = [
    () => ({ _tag: 'time', id: load, serial: seek, seconds: skippedOf(random, state) }),
    () => ({ _tag: 'time', id: load, serial: seek, seconds: skippedOf(random, state) }),
    () => ({ _tag: 'due', id: load, serial: seek, seconds: skippedOf(random, state) }),
    () => ({ _tag: 'dragTo', seconds: pick(random, [0.2, 1.7, 2.9, 4.4, 5.6, 8]) }),
    () => ({ _tag: 'dragTo', seconds: pick(random, [0.2, 1.7, 2.9, 4.4, 5.6, 8]) }),
    () => ({ _tag: 'dragEnd' }),
    () => ({ _tag: 'chooseStanza', stanza: 1 + below(random, 3) }),
    () => ({ _tag: 'seeked', id: load, serial: seek }),
    () => ({ _tag: 'play', track: pick(random, TRACKS) }),
    () => ({ _tag: 'play', track: pick(random, TRACKS.slice(0, 2)) }),
    () => ({ _tag: 'play', track: pick(random, TRACKS.slice(0, 2)) }),
    () => ({ _tag: 'pause' }),
    () => ({ _tag: 'resume' }),
    () => ({ _tag: 'stop' }),
    () => ({ _tag: 'chooseStanza', stanza: below(random, 5) }),
    () => ({ _tag: 'chooseStanza', stanza: below(random, 5) }),
    () => ({ _tag: 'openSheet' }),
    () => ({ _tag: 'closeSheet' }),
    () => ({ _tag: 'titlePressed' }),
    () => ({ _tag: 'retry' }),
    () => ({ _tag: 'dragStart' }),
    () => ({ _tag: 'dragTo', seconds }),
    () => ({ _tag: 'dragTo', seconds }),
    () => ({ _tag: 'dragEnd' }),
    () => ({ _tag: 'dragEnd' }),
    () => ({ _tag: 'nudge', way }),
    () => ({ _tag: 'seekTo', seconds }),
    () => ({ _tag: 'seekTo', seconds }),
    () => ({ _tag: 'stanzaPlace', stanza: below(random, 5) }),
    () => ({ _tag: 'stanzaPlace', stanza: below(random, 5) }),
    () => ({ _tag: 'remoteSeek', seconds }),
    () => ({ _tag: 'remoteSkip', way }),
    () => ({ _tag: 'loaded', id, duration: pick(random, [0, 6, 6.5, 9, 30, -1, Number.NaN]) }),
    () => ({ _tag: 'loaded', id: state.held?.load ?? 0, duration: pick(random, [6, 9, 30]) }),
    () => ({ _tag: 'loaded', id: state.held?.load ?? 0, duration: pick(random, [6, 9, 30]) }),
    () => ({ _tag: 'time', id, serial, seconds }),
    () => ({ _tag: 'time', id, serial, seconds }),
    () => ({ _tag: 'time', id, serial, seconds }),
    () => ({ _tag: 'time', id: state.held?.load ?? 0, serial: state.held?.seek ?? 0, seconds }),
    () => ({ _tag: 'time', id: state.held?.load ?? 0, serial: state.held?.seek ?? 0, seconds }),
    () => ({ _tag: 'seeked', id: state.held?.load ?? 0, serial: state.held?.seek ?? 0 }),
    () => ({ _tag: 'playing', id: state.held?.load ?? 0 }),
    () => ({ _tag: 'seeked', id, serial }),
    () => ({ _tag: 'settle', id, serial }),
    () => ({ _tag: 'due', id, serial, seconds }),
    () => ({ _tag: 'waiting', id }),
    () => ({ _tag: 'waiting', id: load }),
    () => ({ _tag: 'waited', id: load }),
    () => ({ _tag: 'waited', id }),
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
