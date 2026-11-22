/* oxlint-disable effect/noTernary, effect/noNullish, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/maxCognitiveComplexity, eslint/complexity, effect/noAsyncFunction -- the current app's modules are awaited once; the reference model is one plain switch over every input, as a reader checks it against the spec, and a broken rule throws naming its seed and history as JSON. */

/**
 * `step` against a reference model of the player written here: its states
 * (none, loading, playing, buffering, paused, ended, failed), its place,
 * its seeks and the reader's drag, over seeded histories of every input:
 * device events of the current load, an earlier one, a later one or none,
 * of the current seek, an earlier one, a later one; events out of order, a
 * second play before the first has loaded, a seek before the load has a
 * length, a drag across an `ended`. After each step the step's held hymn,
 * load, phase, place, seek, hold and drag must be the model's, and the
 * spec's invariants (A1) hold.
 */

import { describe, expect, it } from 'bun:test';
import { captionOf } from '@manna/hymnal-app/player/caption';
import { placeAt } from '@manna/hymnal-app/player/scrub-rules';
import { Option } from 'effect';

import { seeded } from '../test/random.ts';
import { current } from './current.testing.ts';
import type * as Declared from './decl/caption';
import { inputOf, titleOf } from './fixtures.testing.ts';
import type { Span } from './score.ts';
import {
  type Input,
  type Phase,
  type State,
  type Track,
  deviceOf,
  initial,
  pageOf,
  sessionOf,
  step,
  timesOf,
} from './step.ts';
import { viewOf } from './view.ts';

const HISTORIES = 300;
const STEPS = 60;

interface Model {
  readonly track: Track | undefined;
  readonly load: number;
  readonly loads: number;
  readonly phase: Phase;
  readonly wants: 'play' | 'pause';
  /** The element's events still owed for the reader's commands and the load's start. */
  readonly owed: ReadonlyArray<'played' | 'paused'>;
  readonly why: string;
  readonly length: number;
  /** The place, in the recording's seconds. */
  readonly at: number;
  readonly seeks: number;
  readonly seek: number;
  /** The place sent and not yet reached, in the recording's seconds. */
  readonly hold: number | undefined;
  readonly drag: { readonly from: number; readonly to: number } | undefined;
  readonly choices: Readonly<Record<string, ReadonlyArray<number>>>;
}

const none: Model = {
  track: undefined,
  load: 0,
  loads: 0,
  phase: 'none',
  wants: 'pause',
  owed: [],
  why: '',
  length: 0,
  at: 0,
  seeks: 0,
  seek: 0,
  hold: undefined,
  drag: undefined,
  choices: {},
};

const sounding = (m: Model) =>
  m.phase === 'loading' || m.phase === 'playing' || m.phase === 'buffering';

const fresh = (m: Model, track: Track, from = 0): Model => {
  const missing = track.url === '';
  return {
    ...m,
    track,
    load: m.loads + 1,
    loads: m.loads + 1,
    phase: missing ? 'failed' : 'loading',
    wants: 'play',
    owed: missing ? [] : ['played'],
    why: missing ? 'missing' : '',
    length: 0,
    at: from,
    seek: 0,
    hold: undefined,
    drag: undefined,
  };
};

/** Play on; a reader's play of the same load is owed the element's `play`. */
const resumed = (m: Model, reader: boolean): Model => {
  if (m.track === undefined) return m;
  if (m.phase === 'paused')
    return { ...m, phase: 'loading', wants: 'play', owed: reader ? [...m.owed, 'played'] : m.owed };
  if (m.phase === 'ended') return fresh(m, m.track);
  if (m.phase === 'failed' && m.why !== 'missing') return fresh(m, m.track, m.at);
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

const choiceOfModel = (m: Model) => m.choices[`${m.track?.number ?? 0}`] ?? [];
const sungOf = (m: Model, recording: number) =>
  m.track?.score.sung(choiceOfModel(m), recording) ?? recording;
const totalOfModel = (m: Model) => (m.length > 0 ? sungOf(m, m.length) : 0);
const shownOfModel = (m: Model) => {
  const total = totalOfModel(m);
  if (m.drag !== undefined) return Math.min(m.drag.to, total);
  return total > 0 ? Math.min(sungOf(m, m.at), total) : sungOf(m, m.at);
};
const clampTo = (value: number, max: number) => Math.min(Math.max(value, 0), max);
const spanIn = (spans: ReadonlyArray<Span>, at: number) =>
  spans.find((span) => span.from <= at && at < span.to);
const skipsOfModel = (m: Model) => m.track?.score.skips(choiceOfModel(m)) ?? [];
const canSeek = (m: Model) =>
  m.track !== undefined &&
  m.track.url !== '' &&
  m.phase !== 'none' &&
  m.phase !== 'failed' &&
  m.length > 0;

/** The device sent to `recording` seconds: a new serial, the place held there. */
const sentTo = (m: Model, recording: number): Model => {
  const place = clampTo(recording, m.length);
  return {
    ...m,
    seeks: m.seeks + 1,
    seek: m.seeks + 1,
    at: place,
    hold: place,
    phase: m.phase === 'ended' ? 'paused' : m.phase,
  };
};
const sentSung = (m: Model, sung: number) =>
  sentTo(m, m.track?.score.recording(choiceOfModel(m), sung) ?? sung);

/** A place asked for at once: sent when it is on another second than the bar shows. */
const steppedTo = (m: Model, to: number): Model => {
  if (Math.floor(to) === Math.floor(shownOfModel(m))) return m;
  const sent = sentSung(m, to);
  return m.drag === undefined ? sent : { ...sent, drag: { from: to, to } };
};

const skipped = (m: Model, at: number): Model => {
  const span = spanIn(skipsOfModel(m), at);
  return span === undefined ? m : sentTo(m, span.to);
};

const modelStep = (m: Model, input: Input): Model => {
  const mine = 'id' in input && m.phase !== 'none' && m.phase !== 'failed' && input.id === m.load;
  const ofSeek = 'serial' in input && input.serial === m.seek;
  switch (input._tag) {
    case 'play':
      return m.track === undefined || m.track.number !== input.track.number
        ? fresh(m, input.track)
        : resumed(m, true);
    case 'pause':
      return pausedBy(m, true);
    case 'resume':
      return resumed(m, true);
    case 'retry':
      return m.phase === 'failed' ? resumed(m, true) : m;
    case 'stop':
      return { ...none, loads: m.loads, seeks: m.seeks, choices: m.choices };
    case 'interrupted':
      return pausedBy(m, true);
    case 'remote':
      return input.action === 'pause' ? pausedBy(m, true) : resumed(m, true);
    case 'chooseStanza': {
      if (m.track === undefined) return m;
      const choice = m.track.score.toggle(choiceOfModel(m), input.stanza);
      const chosen = { ...m, choices: { ...m.choices, [`${m.track.number}`]: choice } };
      if (!canSeek(chosen) || chosen.phase === 'ended' || chosen.drag !== undefined) return chosen;
      return skipped(chosen, chosen.at);
    }
    case 'dragStart':
      return canSeek(m) && m.drag === undefined
        ? { ...m, drag: { from: shownOfModel(m), to: shownOfModel(m) } }
        : m;
    case 'dragTo':
      return canSeek(m) && Number.isFinite(input.seconds)
        ? {
            ...m,
            drag: {
              from: m.drag?.from ?? shownOfModel(m),
              to: placeAt(input.seconds, totalOfModel(m), totalOfModel(m)),
            },
          }
        : m;
    case 'dragEnd': {
      if (!canSeek(m) || m.drag === undefined) return m;
      const { from, to } = m.drag;
      const free = { ...m, drag: undefined };
      return Math.floor(from) === Math.floor(to) ? free : sentSung(free, to);
    }
    case 'nudge':
    case 'remoteSkip':
      return canSeek(m)
        ? steppedTo(m, clampTo(shownOfModel(m) + 10 * input.way, totalOfModel(m)))
        : m;
    case 'seekTo':
      return canSeek(m) && Number.isFinite(input.seconds)
        ? steppedTo(m, placeAt(input.seconds, totalOfModel(m), totalOfModel(m)))
        : m;
    case 'stanzaPlace': {
      if (!canSeek(m) || m.track === undefined) return m;
      const place = m.track.score.stanzaAt(choiceOfModel(m), input.stanza);
      return place === undefined ? m : sentSung(m, place);
    }
    case 'remoteSeek': {
      if (!canSeek(m) || !Number.isFinite(input.seconds)) return m;
      const place = clampTo(input.seconds, m.length);
      return sentTo(m, spanIn(skipsOfModel(m), place)?.to ?? place);
    }
    case 'loaded':
      return mine && Number.isFinite(input.duration) && input.duration > 0
        ? { ...m, length: Math.max(input.duration, m.at) }
        : m;
    case 'time': {
      if (!mine || m.phase === 'ended' || !ofSeek || !Number.isFinite(input.seconds)) return m;
      let after: Model;
      if (m.hold !== undefined) {
        if (Math.abs(input.seconds - m.hold) >= 1) return m;
        after = { ...m, hold: undefined, at: input.seconds };
      } else after = { ...m, at: Math.max(m.at, input.seconds) };
      after = {
        ...after,
        at: after.length > 0 ? clampTo(after.at, after.length) : Math.max(after.at, 0),
      };
      if (!sounding(after) || after.wants !== 'play' || !canSeek(after)) return after;
      return skipped(after, after.at);
    }
    case 'seeked':
    case 'settle':
      return mine && ofSeek && m.hold !== undefined ? { ...m, hold: undefined } : m;
    case 'due':
      if (
        !mine ||
        !ofSeek ||
        m.phase !== 'playing' ||
        m.wants !== 'play' ||
        m.hold !== undefined ||
        !Number.isFinite(input.seconds) ||
        input.seconds < m.at ||
        input.seconds > m.at + 0.5 ||
        !canSeek(m)
      )
        return m;
      return skipped(m, input.seconds);
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
      if (after.m.phase === 'ended') return { ...after.m, phase: 'loading', wants: 'play', at: 0 };
      return after.m.phase === 'paused' ? { ...after.m, phase: 'loading', wants: 'play' } : after.m;
    }
    case 'paused': {
      if (!mine) return m;
      const after = heard(m, 'paused');
      return after.echo ? after.m : pausedBy(after.m, false);
    }
    case 'ended':
      if (!mine || m.owed.includes('played')) return m;
      return {
        ...m,
        phase: 'ended',
        wants: 'pause',
        owed: [],
        hold: undefined,
        at: m.length > 0 ? m.length : m.at,
      };
    case 'failed':
      return mine ? { ...m, phase: 'failed', why: input.why } : m;
    case 'restore':
      return { ...m, choices: { ...input.choices, ...m.choices } };
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

const MOVES = new Set<Input['_tag']>([
  'play',
  'resume',
  'retry',
  'remote',
  'stop',
  'chooseStanza',
  'restore',
  'dragStart',
  'dragTo',
  'dragEnd',
  'nudge',
  'seekTo',
  'stanzaPlace',
  'remoteSeek',
  'remoteSkip',
]);

describe('the player against its reference model', async () => {
  const { bar, player } = await current();

  it('the caption Exact’s type check is told of is the current app’s', () => {
    const held: typeof Declared.captionOf = captionOf;
    expect(held({ _tag: 'Stopped' })).toBe('Paused');
  });

  it('agrees with the model and keeps every invariant over generated histories', () => {
    let seeks = 0;
    let skips = 0;
    let releases = 0;
    let holds = 0;
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
        const held = after.held;
        if ((held?.track.number ?? 0) !== (model.track?.number ?? 0))
          fail('the held hymn is the model’s');
        if ((held?.phase ?? 'none') !== model.phase) fail('the phase is the model’s');
        if ((held?.load ?? 0) !== model.load) fail('the load is the model’s');
        if (held !== undefined) {
          if (held.at !== model.at) fail('the place is the model’s');
          if (held.seek !== model.seek || after.seeks !== model.seeks)
            fail('the seek is the model’s');
          if (held.holding !== (model.hold !== undefined)) fail('the hold is the model’s');
          if (JSON.stringify(held.drag) !== JSON.stringify(model.drag))
            fail('the drag is the model’s');
        }
        const tag = input._tag;
        const seek = command?._tag === 'seek' ? command : undefined;
        if (seek !== undefined) seeks++;

        if ('id' in input && input.id !== before.held?.load)
          if (JSON.stringify(kept(after)) !== JSON.stringify(kept(before)))
            fail('an event of another load changes nothing');
        if (
          (tag === 'time' || tag === 'seeked' || tag === 'settle' || tag === 'due') &&
          input.serial < (before.held?.seek ?? 0) &&
          JSON.stringify(kept(after)) !== JSON.stringify(kept(before))
        )
          fail('an event of an older seek changes nothing');

        const changed = JSON.stringify(deviceOf(before)) !== JSON.stringify(deviceOf(after));
        if (changed !== (command !== undefined))
          fail('a command is issued by the step that changes the device, and only by it');

        if ((tag === 'dragStart' || tag === 'dragTo') && seek !== undefined)
          fail('while a drag is held, it sends no seek');
        if (
          tag === 'dragTo' &&
          after.held?.drag !== undefined &&
          after.held.drag !== before.held?.drag
        ) {
          const shown = timesOf(after).elapsed;
          if (shown !== after.held.drag.to) fail('while a drag is held, the bar shows the drag');
        }
        if (tag === 'dragEnd' && before.held?.drag !== undefined && deviceOf(before)) {
          const { from, to } = before.held.drag;
          const moved = Math.floor(from) !== Math.floor(to);
          if (moved !== (seek !== undefined))
            fail('a release sends one seek, and none on the second the bar showed at its start');
          if (seek !== undefined) releases++;
        }

        if (seek !== undefined) {
          if (deviceOf(before)?.paused !== deviceOf(after)?.paused)
            fail('a seek neither plays nor pauses');
          if (!after.held?.holding || seek.seconds !== after.held.sought)
            fail('a sent place is held');
        }
        if (after.held?.holding === true && after.held.drag === undefined) {
          holds++;
          const sung = after.held.track.score.sung(
            after.choices[`${after.held.track.number}`] ?? [],
            after.held.sought,
          );
          if (Math.abs(timesOf(after).elapsed - Math.min(sung, timesOf(after).total)) > 1e-9)
            fail('while a place is held, the bar reads the place sent');
          if (before.held?.holding === true && before.held.seek === after.held.seek)
            if (before.held.at !== after.held.at) fail('no time moves a held place');
        }

        if (held !== undefined && held.length > 0) {
          const choice = after.choices[`${held.track.number}`] ?? [];
          const { elapsed, total } = timesOf(after);
          if (elapsed < 0 || elapsed > total + 1e-9) fail('elapsed is inside the cut’s length');
          if (held.drag === undefined) {
            const recording = held.track.score.recording(choice, elapsed);
            const span = held.track.score
              .skips(choice)
              .find((each) => each.from <= recording && recording < each.to);
            if (span !== undefined && recording < held.length)
              fail('elapsed maps to a place inside a kept line');
          }
        }

        if (
          tag === 'time' &&
          before.held !== undefined &&
          !before.held.holding &&
          input.id === before.held.load &&
          input.serial === before.held.seek &&
          Number.isFinite(input.seconds) &&
          before.held.wants === 'play' &&
          (before.held.phase === 'loading' ||
            before.held.phase === 'playing' ||
            before.held.phase === 'buffering') &&
          before.held.length > 0 &&
          deviceOf(before) !== undefined
        ) {
          const choice = before.choices[`${before.held.track.number}`] ?? [];
          const place = Math.min(Math.max(before.held.at, input.seconds), before.held.length);
          const span = before.held.track.score
            .skips(choice)
            .find((each) => each.from <= place && place < each.to);
          if (span !== undefined) {
            skips++;
            if (
              seek === undefined ||
              !seek.skip ||
              seek.seconds !== Math.min(span.to, before.held.length)
            )
              fail('a place in a span the choice leaves out is sought across at the tick');
          }
        }

        if (
          tag === 'chooseStanza' &&
          before.held !== undefined &&
          after.held !== undefined &&
          before.held.length > 0 &&
          deviceOf(before) !== undefined &&
          before.held.phase !== 'ended' &&
          before.held.drag === undefined
        ) {
          const choice = after.choices[`${after.held.track.number}`] ?? [];
          const span = after.held.track.score
            .skips(choice)
            .find((each) => each.from <= before.held!.at && before.held!.at < each.to);
          if (span === undefined && (seek !== undefined || after.held.at !== before.held.at))
            fail('a new choice keeps a place it still sings');
          if (span !== undefined && seek?.seconds !== Math.min(span.to, before.held.length))
            fail('a new choice moves a place it leaves out to the next line it sings');
        }

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
        const mayFall =
          MOVES.has(tag) ||
          (tag === 'played' && before.held?.phase === 'ended') ||
          (tag === 'time' && before.held?.holding === true) ||
          (tag === 'loaded' && before.held?.drag !== undefined) ||
          after.held?.load !== before.held?.load;
        if (now.elapsed < was.elapsed && !mayFall)
          fail('elapsed never falls but by a play, a choice or a seek');

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
        if (view.dock && (after.stack.at(-1) === '/player' || after.stack.at(-1) === '/settings'))
          fail('no bar is docked under a sheet');

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
        const top = after.stack.at(-1);
        const theirPageBar = Option.match(pageTrack, {
          onNone: () => false,
          onSome: (track) =>
            bar.pageBar(playerOf(player.Player, after), track)._tag === 'Shown' &&
            top !== '/player' &&
            top !== '/settings',
        });
        if (view.pageBar !== theirPageBar)
          fail('a hymn page draws its own bar exactly where bar.ts’s pageBar does, under no sheet');
        if (view.pageBar && view.dock) fail('the page’s bar and the docked bar never show at once');
        if (view.onPage !== (page ?? 0)) fail('the view names the hymn page shown');
        if (after.held !== undefined && after.held.why !== 'missing') {
          const theirs = playerOf(player.Player, after);
          if (view.caption !== captionOf(theirs))
            fail('the full player’s caption is the current app’s for the state it would be in');
        }
      }
    }
    expect(seeks).toBeGreaterThan(200);
    expect(skips).toBeGreaterThan(10);
    expect(releases).toBeGreaterThan(20);
    expect(holds).toBeGreaterThan(400);
  });
});
