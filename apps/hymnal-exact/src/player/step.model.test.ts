/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/maxCognitiveComplexity, eslint/complexity, effect/noAsyncFunction -- the current app's modules are awaited once; the reference model is one plain switch over every input, as a reader checks it against the spec, and a broken rule throws naming its seed and history as JSON. */

/**
 * `step` against a reference model of the player's states written here
 * (none, loading, playing, buffering, paused, ended, failed), over seeded
 * histories of every input: device events of the current load, an earlier
 * one, a later one or none, events out of order, a second play before the
 * first has loaded. After each step the step's held hymn, load and phase
 * must be the model's, and the spec's invariants (A1) hold.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { seeded } from '../test/random.ts';
import { current } from './current.testing.ts';
import { TRACKS, inputOf, titleOf } from './fixtures.testing.ts';
import {
  type Input,
  type Phase,
  type State,
  deviceOf,
  initial,
  pageOf,
  sessionOf,
  step,
  timesOf,
} from './step.ts';
import { viewOf } from './view.ts';

const HISTORIES = 300;
const STEPS = 40;

interface Model {
  readonly hymn: number;
  readonly load: number;
  readonly loads: number;
  readonly phase: Phase;
  readonly wants: 'play' | 'pause';
  /** The element's events still owed for the reader's commands and the load's start. */
  readonly owed: ReadonlyArray<'played' | 'paused'>;
  readonly why: string;
}

const none: Model = {
  hymn: 0,
  load: 0,
  loads: 0,
  phase: 'none',
  wants: 'pause',
  owed: [],
  why: '',
};

const sounding = (m: Model) =>
  m.phase === 'loading' || m.phase === 'playing' || m.phase === 'buffering';

const fresh = (m: Model, hymn: number): Model => {
  const missing = TRACKS.find((t) => t.number === hymn)?.url === '';
  return {
    hymn,
    load: m.loads + 1,
    loads: m.loads + 1,
    phase: missing ? 'failed' : 'loading',
    wants: 'play',
    owed: missing ? [] : ['played'],
    why: missing ? 'missing' : '',
  };
};

/** Play on; a reader's play of the same load is owed the element's `play`. */
const resumed = (m: Model, reader: boolean): Model => {
  if (m.phase === 'paused')
    return { ...m, phase: 'loading', wants: 'play', owed: reader ? [...m.owed, 'played'] : m.owed };
  if (m.phase === 'ended') return fresh(m, m.hymn);
  if (m.phase === 'failed' && m.why !== 'missing') return fresh(m, m.hymn);
  return m;
};

/** Pause; a reader's pause is owed the element's `pause`. */
const pausedBy = (m: Model, reader: boolean): Model =>
  m.phase !== 'none' && m.wants === 'play' && sounding(m)
    ? { ...m, phase: 'paused', wants: 'pause', owed: reader ? [...m.owed, 'paused'] : m.owed }
    : m;

/** The element's `event`: the echo owed first is paid; any other lets every debt go. */
const heard = (m: Model, event: 'played' | 'paused') =>
  m.owed[0] === event
    ? { echo: true, m: { ...m, owed: m.owed.slice(1) } }
    : { echo: false, m: { ...m, owed: [] } };

const modelStep = (m: Model, input: Input): Model => {
  const mine = 'id' in input && m.phase !== 'none' && m.phase !== 'failed' && input.id === m.load;
  switch (input._tag) {
    case 'play':
      return m.phase === 'none' || m.hymn !== input.track.number
        ? fresh(m, input.track.number)
        : resumed(m, true);
    case 'pause':
      return pausedBy(m, true);
    case 'resume':
      return resumed(m, true);
    case 'retry':
      return m.phase === 'failed' ? resumed(m, true) : m;
    case 'stop':
      return { ...none, loads: m.loads };
    case 'interrupted':
      return pausedBy(m, false);
    case 'remote':
      return input.action === 'pause' ? pausedBy(m, false) : resumed(m, false);
    case 'waiting':
      return mine && m.phase === 'playing' ? { ...m, phase: 'buffering' } : m;
    case 'playing':
      return mine && m.wants === 'play' && (m.phase === 'loading' || m.phase === 'buffering')
        ? { ...m, phase: 'playing' }
        : m;
    case 'played': {
      if (!mine) return m;
      const after = heard(m, 'played');
      if (after.echo) return after.m;
      if (after.m.phase === 'ended') return { ...after.m, phase: 'loading', wants: 'play' };
      return after.m.phase === 'paused' ? { ...after.m, phase: 'loading', wants: 'play' } : after.m;
    }
    case 'paused': {
      if (!mine) return m;
      const after = heard(m, 'paused');
      return after.echo ? after.m : pausedBy(after.m, false);
    }
    case 'ended':
      return mine ? { ...m, phase: 'ended', wants: 'pause', owed: [] } : m;
    case 'failed':
      return mine ? { ...m, phase: 'failed', why: input.why } : m;
    default:
      return m;
  }
};

/** The state with what an event of another load may not touch: everything but the count of steps. */
const kept = (state: State) => ({ ...state, steps: 0 });

/** The current app's player state for the port's, as its bar reads it. */
const playerOf = (
  Player: Awaited<ReturnType<typeof current>>['player']['Player'],
  state: State,
) => {
  const { held } = state;
  if (held === undefined) return Player.Idle();
  const track = { number: held.track.number, title: held.track.title };
  const { elapsed, total } = timesOf(state);
  const length = total > 0 ? Option.some(total) : Option.none();
  switch (held.phase) {
    case 'loading':
      return Player.Loading({ track });
    case 'playing':
      return Player.Playing({ track, at: elapsed, length });
    case 'buffering':
      return Player.Buffering({ track, at: elapsed, length, retry: false });
    case 'paused':
      return Player.Paused({ track, at: elapsed, length });
    case 'ended':
      return Player.Ended({ track, length });
    case 'failed':
      return Player.Failed({ track, offline: held.why === 'network', at: Option.some(elapsed) });
  }
};

describe('the player against its reference model', async () => {
  const { bar, player } = await current();

  it('agrees with the model and keeps every invariant over generated histories', () => {
    for (let seed = 1; seed <= HISTORIES; seed++) {
      const random = seeded(seed);
      let state = initial;
      let model = none;
      let pausedByReader = false;
      let failedLoad = false;
      const history: Array<Input> = [];
      const fail = (rule: string) => {
        throw new Error(`${rule}\nseed ${seed}\n${JSON.stringify(history, undefined, 1)}`);
      };
      for (let at = 0; at < STEPS; at++) {
        const input = inputOf(random, state);
        history.push(input);
        const before = state;
        const { state: after, command } = step(before, input);
        state = after;
        model = modelStep(model, input);
        if ((after.held?.track.number ?? 0) !== model.hymn) fail('the held hymn is the model’s');
        if ((after.held?.phase ?? 'none') !== model.phase) fail('the phase is the model’s');
        if ((after.held?.load ?? 0) !== model.load) fail('the load is the model’s');

        if ('id' in input && input.id !== before.held?.load)
          if (JSON.stringify(kept(after)) !== JSON.stringify(kept(before)))
            fail('an event of another load changes nothing');

        const changed = JSON.stringify(deviceOf(before)) !== JSON.stringify(deviceOf(after));
        if (changed !== (command !== undefined))
          fail('a command is issued by the step that changes the device, and only by it');

        const tag = input._tag;
        const playAsked =
          tag === 'play' ||
          tag === 'resume' ||
          tag === 'retry' ||
          (tag === 'remote' && input.action === 'play') ||
          (tag === 'played' && before.held?.phase !== 'loading' && after.held?.phase === 'loading');
        if (tag === 'pause' && after.held?.wants === 'pause') pausedByReader = true;
        if (playAsked || after.held === undefined) pausedByReader = false;
        if (pausedByReader && after.held?.phase === 'playing')
          fail('a pause is never undone by a device event');

        if (after.held?.phase === 'failed' && before.held?.phase !== 'failed') failedLoad = true;
        if (after.held?.load !== before.held?.load || after.held === undefined) failedLoad = false;
        if (failedLoad && (after.held?.phase !== 'failed' || deviceOf(after) !== undefined))
          fail('after a failure nothing plays until a retry or a new play');

        const was = timesOf(before);
        const now = timesOf(after);
        if (now.total > 0 && now.elapsed > now.total) fail('elapsed never passes the length');
        const mayFall =
          tag === 'play' ||
          tag === 'resume' ||
          tag === 'retry' ||
          tag === 'remote' ||
          tag === 'stop' ||
          tag === 'chooseStanza' ||
          tag === 'restore' ||
          (tag === 'played' && before.held?.phase === 'ended') ||
          after.held?.load !== before.held?.load;
        if (now.elapsed < was.elapsed && !mayFall)
          fail('elapsed never falls but by a play or a choice');

        const view = viewOf(after, command, titleOf);
        const session = sessionOf(after);
        if (session !== undefined) {
          if (session.title !== view.title || session.number !== view.number)
            fail('the session names the view’s hymn');
          if (view.session.duration !== (after.held?.length ?? 0))
            fail('the session’s length is the recording’s');
          if (session.playing !== (view.phase === 'playing' || view.phase === 'buffering'))
            fail('the session plays while the view plays');
        } else if (view.session.title !== '') fail('no session while the device holds nothing');

        const page = pageOf(after);
        const pageTrack =
          page === undefined ? Option.none() : Option.some({ number: page, title: titleOf(page) });
        const theirs = bar.dockedBar(playerOf(player.Player, after), pageTrack);
        const ours = view.bar;
        if (theirs._tag === 'Hidden') {
          if (ours.shown) fail('the bar hides where bar.ts hides it');
        } else {
          const theirPage = theirs.page._tag === 'Some' ? theirs.page.value.number : 0;
          if (!ours.shown || ours.number !== theirs.track.number || ours.page !== theirPage)
            fail('the bar shows the hymn bar.ts shows');
          if (bar.sounding(theirs.state) !== (ours.toggle === 'pause'))
            fail('the bar offers Pause exactly while bar.ts’s hymn sounds');
        }
      }
    }
    expect(true).toBe(true);
  });
});
