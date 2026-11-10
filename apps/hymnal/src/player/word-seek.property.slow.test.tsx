import { expect, it } from 'effect-bun-test';
import { Deferred, Effect, Option, Queue } from 'effect';
import { TestClock } from 'effect/testing';
import { renderToStaticMarkup } from 'react-dom/server';

import { openWordSeek } from '../test/word-seek';
import ScrubProbe from '../../app/(hymnal)/probe/scrub';
import { WordSeekProbe } from './WordSeekProbe';
import { Command, PlaybackError, Player, Remote, type Status } from './player';
import { HoldCommand, type HoldState, type HoldToken } from './word-seek';

it.effect(
  'the default probe route is empty outside development and the silent fixture exposes its numeric controls',
  () =>
    Effect.sync(() => {
      expect(renderToStaticMarkup(<ScrubProbe />).length).toBe(0);
      const html = renderToStaticMarkup(<WordSeekProbe />);
      for (const id of [
        'scrub-play',
        'scrub-begin',
        'scrub-prev-line',
        'scrub-next-line',
        'scrub-prev-word',
        'scrub-next-word',
        'scrub-release',
        'scrub-cancel',
        'scrub-invalidate',
        'scrub-pause',
        'scrub-replace',
        'scrub-stanza',
        'scrub-count-in',
        'scrub-status',
      ])
        expect(html.includes(`data-testid="${id}"`)).toBe(true);
      expect(html.includes('commits=0')).toBe(true);
      expect(html.includes('hold=Free')).toBe(true);
      expect(html.includes('countIn=-1')).toBe(true);
    }),
);

for (const audible of [true, false])
  it.effect(`frozen origin and cancel preserve score-clock position sound=${audible}`, () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(audible);
      yield* app.play;
      app.hold(HoldCommand.Begin({ targets: app.targets }));
      const held = yield* app.untilHold('Held');
      if (held._tag !== 'Held') return;
      const at = app.registry.get(app.player.state);
      yield* TestClock.adjust(2000);
      expect(app.registry.get(app.player.state)).toEqual(at);
      app.hold(HoldCommand.Select({ token: held.token, line: 3, word: Option.some(0) }));
      expect(app.registry.get(app.player.hold.state)).toEqual(held);
      app.hold(HoldCommand.Select({ token: held.token, line: 3, word: Option.none() }));
      app.hold(HoldCommand.Cancel({ token: held.token }));
      yield* app.untilHold('Free');
      expect(app.commands.filter(({ kind }) => kind === 'seek').length).toBe(0);
      expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(1);
      yield* TestClock.adjust(250);
      const playing = yield* app.untilPlayer(Player.$is('Playing'));
      expect(
        Player.$is('Playing')(playing) && Math.abs(playing.at * 1000 - held.origin - 250) < 3,
      ).toBe(true);
    }).pipe(Effect.scoped),
  );

for (const ending of ['Release', 'Cancel'] as const)
  for (const reason of ['route', 'background', 'unmount', 'timeline'] as const)
    it.effect(`acquiring ${ending} is revoked by ${reason} before its pause answer`, () =>
      Effect.gen(function* () {
        const app = yield* openWordSeek();
        yield* app.play;
        const answer = yield* Deferred.make<Status, PlaybackError>();
        app.gates.set('pause', answer);
        app.hold(HoldCommand.Begin({ targets: app.targets }));
        const hold = yield* app.untilHold('Acquiring');
        if (hold._tag !== 'Acquiring') return;
        yield* app.waitCall('pause');
        app.hold(HoldCommand[ending]({ token: hold.token }));
        app.hold(HoldCommand.Invalidate({ reason }));
        expect(app.registry.get(app.player.hold.state)._tag).toBe('Free');
        yield* Deferred.succeed(answer, { state: 'paused', positionMs: 1500, durationMs: 21_000 });
        yield* TestClock.adjust(250);
        expect(app.commands.map(({ kind }) => kind)).toEqual(['pause']);
      }).pipe(Effect.scoped),
    );

for (const status of ['playing', 'idle', 'ended', 'failed'] as const)
  it.effect(`an invalid ${status} pause acknowledgement never seeks or resumes`, () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek();
      yield* app.play;
      const answer = yield* Deferred.make<Status, PlaybackError>();
      app.gates.set('pause', answer);
      app.hold(HoldCommand.Begin({ targets: app.targets }));
      yield* app.waitCall('pause');
      yield* Deferred.succeed(answer, { state: status, positionMs: 1500, durationMs: 21_000 });
      yield* app.untilHold('Free');
      expect(app.commands.map(({ kind }) => kind)).toEqual(['pause']);
    }).pipe(Effect.scoped),
  );

it.effect(
  'a failed pause acknowledgement closes ownership without orphaning a queued release',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek();
      yield* app.play;
      const answer = yield* Deferred.make<Status, PlaybackError>();
      app.gates.set('pause', answer);
      app.hold(HoldCommand.Begin({ targets: app.targets }));
      const hold = yield* app.untilHold('Acquiring');
      if (hold._tag !== 'Acquiring') return;
      app.hold(HoldCommand.Release({ token: hold.token }));
      yield* app.waitCall('pause');
      yield* Deferred.fail(answer, PlaybackError.make({ operation: 'pause', message: 'fixture' }));
      yield* app.untilHold('Free');
      expect(app.commands.map(({ kind }) => kind)).toEqual(['pause']);
    }).pipe(Effect.scoped),
);

for (const interruption of [
  'invalidate',
  'pause',
  'remote',
  'same-start',
  'other-start',
  'tempo',
  'stanzas',
  'key',
  'intro',
  'sound',
] as const)
  it.effect(`pending landing cannot resume or retry after ${interruption}`, () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek();
      yield* app.play;
      app.hold(HoldCommand.Begin({ targets: app.targets }));
      const hold = yield* app.untilHold('Held');
      if (hold._tag !== 'Held') return;
      const answer = yield* Deferred.make<Status, PlaybackError>();
      yield* app.waitCommand('pause');
      app.gates.set('seek', answer);
      app.hold(HoldCommand.Select({ token: hold.token, line: 2, word: Option.some(0) }));
      app.hold(HoldCommand.Release({ token: hold.token }));
      yield* app.waitCall('seek');
      yield* TestClock.adjust(750);
      expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(0);
      switch (interruption) {
        case 'invalidate':
          app.hold(HoldCommand.Invalidate({ reason: 'route' }));
          break;
        case 'pause':
          app.send(Command.Pause());
          break;
        case 'remote':
          yield* Queue.offer(app.remote, Remote.Pause());
          break;
        case 'same-start':
          app.send(Command.Start({ track: { number: 1, title: 'Fixture' } }));
          break;
        case 'other-start':
          app.send(Command.Start({ track: { number: 2, title: 'Fixture' } }));
          break;
        case 'tempo':
          app.registry.set(app.tempos(1), 120);
          break;
        case 'stanzas':
          app.registry.set(app.choices(1), [2]);
          break;
        case 'key':
          app.registry.set(app.moves(1), { transpose: 1, capo: 0 });
          break;
        case 'intro':
          app.registry.set(app.intro, true);
          break;
        case 'sound':
          app.registry.set(app.sound, false);
          break;
      }
      if (interruption === 'remote') yield* app.waitCommand('pause');
      app.hold(HoldCommand.Release({ token: hold.token }));
      app.hold(HoldCommand.Cancel({ token: hold.token }));
      yield* Deferred.succeed(answer, { state: 'paused', positionMs: 11_100, durationMs: 21_000 });
      yield* TestClock.adjust(1000);
      yield* app.untilHold('Free');
      expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(0);
      expect(app.commands.filter(({ kind }) => kind === 'seek').map(({ ms }) => ms)).toEqual([
        11_100,
      ]);
    }).pipe(Effect.scoped),
  );

it.effect('a position observed at the target cannot substitute for an acknowledged landing', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek();
    yield* app.play;
    app.hold(HoldCommand.Begin({ targets: app.targets }));
    const hold = yield* app.untilHold('Held');
    if (hold._tag !== 'Held') return;
    const answer = yield* Deferred.make<Status, PlaybackError>();
    app.gates.set('seek', answer);
    app.hold(HoldCommand.Select({ token: hold.token, line: 2, word: Option.some(0) }));
    app.hold(HoldCommand.Release({ token: hold.token }));
    yield* app.waitCall('seek');
    app.hold(HoldCommand.Cancel({ token: hold.token }));
    yield* TestClock.adjust(1000);
    expect(app.registry.get(app.player.hold.state)._tag).toBe('Landing');
    expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(0);
    yield* Deferred.succeed(answer, { state: 'paused', positionMs: 11_100, durationMs: 21_000 });
    yield* app.untilHold('Free');
    expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(1);
  }).pipe(Effect.scoped),
);

it.effect('no-op and other-hymn settings do not revoke a valid hold or invalid request', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek();
    yield* app.play;
    app.hold(HoldCommand.Begin({ targets: app.targets }));
    const hold = yield* app.untilHold('Held');
    if (hold._tag !== 'Held') return;
    app.registry.set(app.tempos(2), 120);
    app.registry.set(app.moves(2), { transpose: 1, capo: 0 });
    app.registry.set(app.choices(2), [2]);
    app.registry.set(app.choices(1), [1, 2]);
    app.registry.set(app.moves(1), { transpose: 0, capo: 7 });
    app.hold(HoldCommand.Begin({ targets: { ...app.targets, number: 2 } }));
    app.hold(HoldCommand.Select({ token: hold.token, line: -1, word: Option.some(0) }));
    expect(app.registry.get(app.player.hold.state)).toEqual(hold);
    app.hold(HoldCommand.Cancel({ token: hold.token }));
    yield* app.untilHold('Free');
    expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(1);
  }).pipe(Effect.scoped),
);

const start = { number: 1, title: 'Fixture' };

it.effect('a refused status read cannot leave a live token on a Failed player', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek();
    yield* app.play;
    app.hold(HoldCommand.Begin({ targets: app.targets }));
    const held = yield* app.untilHold('Held');
    if (held._tag !== 'Held') return yield* Effect.die('missing Held');
    const failure = yield* Deferred.make<Status, PlaybackError>();
    app.gates.set('status', failure);
    yield* TestClock.adjust(250);
    yield* app.waitStatus;
    yield* Deferred.fail(failure, PlaybackError.make({ operation: 'status', message: 'fixture' }));
    yield* app.untilPlayer(Player.$is('Failed'));
    const before = app.registry.get(app.player.hold.state)._tag;
    app.hold(HoldCommand.Release({ token: held.token }));
    const after = app.registry.get(app.player.hold.state)._tag;
    expect({ before, after }).toEqual({ before: 'Free', after: 'Free' });
  }).pipe(Effect.scoped),
);

const statusPhases = ['Acquiring', 'Held', 'Landing', 'Resuming'] as const;
type StatusPhase = (typeof statusPhases)[number];
const statusOutcomes = [
  'idle',
  'loading',
  'playing',
  'paused',
  'ended',
  'failed',
  'error',
] as const;
type StatusOutcome = (typeof statusOutcomes)[number];
const statusPlacements = ['current', 'same-start', 'other-start', 'new-token'] as const;
type StatusPlacement = (typeof statusPlacements)[number];
type SeekApp = Effect.Success<ReturnType<typeof openWordSeek>>;

const statusPhaseTag = (phase: StatusPhase) => {
  if (phase === 'Resuming') return 'Landing';
  return phase;
};
const holdTrace = (phase: StatusPhase) => {
  if (phase === 'Landing') return ['pause', 'seek'];
  if (phase === 'Resuming') return ['pause', 'resume'];
  return ['pause'];
};

const enterStatusPhase = Effect.fn('Test.enterStatusPhase')(function* (
  app: SeekApp,
  phase: StatusPhase,
) {
  const answer = yield* Deferred.make<Status, PlaybackError>();
  const operation = yield* Deferred.make<Status, PlaybackError>();
  if (phase === 'Acquiring') {
    app.gates.set('status', answer);
    yield* TestClock.adjust(250);
    yield* app.waitStatus;
    app.boundaries.set('pause', operation);
  }
  app.hold(HoldCommand.Begin({ targets: app.targets }));
  let acquired: 'Acquiring' | 'Held' = 'Held';
  if (phase === 'Acquiring') acquired = 'Acquiring';
  expect(app.registry.get(app.player.hold.state)._tag).toBe(acquired);
  const hold = yield* app.untilHold(acquired);
  if (hold._tag === 'Free') return yield* Effect.die('missing owned hold');
  if (phase === 'Acquiring') yield* app.waitCall('boundary:pause');
  app.hold(HoldCommand.Select({ token: hold.token, line: 2, word: Option.some(0) }));
  expect(app.commands.map(({ kind }) => kind)).toEqual(['pause']);
  if (phase !== 'Acquiring') app.gates.set('status', answer);
  if (phase === 'Held' || phase === 'Resuming') {
    yield* TestClock.adjust(250);
    yield* app.waitStatus;
  }
  if (phase === 'Landing') {
    app.boundaries.set('seek', operation);
    app.hold(HoldCommand.Release({ token: hold.token }));
    expect(app.registry.get(app.player.hold.state)._tag).toBe('Landing');
    yield* app.waitCall('boundary:seek');
    yield* app.waitStatus;
  }
  if (phase === 'Resuming') {
    app.boundaries.set('resume', operation);
    app.hold(HoldCommand.Cancel({ token: hold.token }));
    expect(app.registry.get(app.player.hold.state)._tag).toBe('Landing');
    yield* app.waitCall('boundary:resume');
  }
  expect(app.registry.get(app.player.hold.state)._tag).toBe(statusPhaseTag(phase));
  expect(app.commands.map(({ kind }) => kind)).toEqual(holdTrace(phase));
  return { hold, answer, operation };
});

const replaceStatusOwner = Effect.fn('Test.replaceStatusOwner')(function* (
  app: SeekApp,
  placement: StatusPlacement,
) {
  app.gates.delete('status');
  app.boundaries.clear();
  let number = 1;
  if (placement === 'other-start') number = 2;
  app.send(Command.Start({ track: { number, title: 'Fixture' } }));
  expect(app.registry.get(app.player.hold.state)._tag).toBe('Free');
  yield* TestClock.adjust(250);
  const playing = yield* app.untilPlayer(Player.$is('Playing'));
  expect(Player.$is('Playing')(playing) && playing.track.number).toBe(number);
  if (placement === 'new-token') {
    app.hold(HoldCommand.Begin({ targets: app.targets }));
    yield* app.untilHold('Held');
  }
});

const statusResult = (outcome: StatusOutcome): Player['_tag'] => {
  if (outcome === 'idle') return 'Idle';
  if (outcome === 'ended') return 'Ended';
  if (outcome === 'failed' || outcome === 'error') return 'Failed';
  return 'Paused';
};

const completeStatus = (
  answer: Deferred.Deferred<Status, PlaybackError>,
  outcome: StatusOutcome,
  positionMs: number,
) => {
  if (outcome === 'error')
    return Deferred.fail(answer, PlaybackError.make({ operation: 'status', message: 'fixture' }));
  return Deferred.succeed(answer, { state: outcome, positionMs, durationMs: 21_000 });
};

const statusHistory = Effect.fn('Test.statusHistory')(function* (
  phase: StatusPhase,
  outcome: StatusOutcome,
  placement: StatusPlacement,
  delayed: boolean,
  audible: boolean,
) {
  const app = yield* openWordSeek(audible);
  yield* app.play;
  const { hold, answer, operation } = yield* enterStatusPhase(app, phase);
  if (delayed) {
    yield* TestClock.adjust(1000);
    expect(app.registry.get(app.player.hold.state)._tag).toBe(statusPhaseTag(phase));
    expect(app.commands.map(({ kind }) => kind)).toEqual(holdTrace(phase));
  }
  if (placement !== 'current') yield* replaceStatusOwner(app, placement);
  const before = app.registry.get(app.player.hold.state);
  const commands = [...app.commands];
  let positionMs = 11_100;
  if ('origin' in hold) positionMs = hold.origin;
  if (phase === 'Landing') positionMs = 11_100;
  yield* completeStatus(answer, outcome, positionMs);
  yield* TestClock.adjust(250);
  const terminal =
    outcome === 'idle' || outcome === 'ended' || outcome === 'failed' || outcome === 'error';
  const watched = phase === 'Held' || phase === 'Landing';
  const revoked = placement === 'current' && watched && terminal;
  if (placement === 'current' && watched) {
    expect(app.registry.get(app.player.state)._tag).toBe(statusResult(outcome));
    let expected: HoldState['_tag'] = statusPhaseTag(phase);
    if (revoked) expected = 'Free';
    expect(app.registry.get(app.player.hold.state)._tag).toBe(expected);
    if (revoked && phase === 'Landing') expect(app.cancelled.includes('seek')).toBe(true);
  } else expect(app.registry.get(app.player.hold.state)).toEqual(before);
  expect(app.commands).toEqual(commands);
  if (placement === 'current' && !revoked) {
    app.hold(HoldCommand.Invalidate({ reason: 'timeline' }));
    expect(app.registry.get(app.player.hold.state)._tag).toBe('Free');
  }
  const kept = app.registry.get(app.player.hold.state);
  app.hold(HoldCommand.Select({ token: hold.token, line: 1, word: Option.none() }));
  expect(app.registry.get(app.player.hold.state)).toEqual(kept);
  app.hold(HoldCommand.Release({ token: hold.token }));
  expect(app.registry.get(app.player.hold.state)).toEqual(kept);
  app.hold(HoldCommand.Cancel({ token: hold.token }));
  expect(app.registry.get(app.player.hold.state)).toEqual(kept);
  app.gates.delete('status');
  yield* Deferred.succeed(operation, { state: 'paused', positionMs: 11_100, durationMs: 21_000 });
  yield* TestClock.adjust(250);
  expect(app.registry.get(app.player.hold.state)).toEqual(kept);
  expect(app.commands).toEqual(commands);
  if (placement !== 'current') {
    const state = app.registry.get(app.player.state);
    let number = 1;
    if (placement === 'other-start') number = 2;
    expect(state._tag !== 'Idle' && state.track.number).toBe(number);
  }
}, Effect.scoped);

for (const phase of statusPhases)
  for (const outcome of statusOutcomes)
    for (const placement of statusPlacements)
      for (const delayed of [false, true])
        for (const audible of [false, true])
          it.effect(
            `status history ${phase}/${outcome}/${placement}/delayed=${delayed}/sound=${audible}`,
            () => statusHistory(phase, outcome, placement, delayed, audible),
          );

for (let seed = 0; seed < 128; seed++)
  it.effect(`status completion reference history seed ${seed} x16`, () =>
    Effect.gen(function* () {
      const cells = new Set<string>();
      for (let step = 0; step < 16; step++) {
        const phase = Option.getOrThrow(
          Option.fromUndefinedOr(statusPhases[(seed + step) % statusPhases.length]),
        );
        const outcome = Option.getOrThrow(
          Option.fromUndefinedOr(statusOutcomes[(seed * 5 + step) % statusOutcomes.length]),
        );
        const placement = Option.getOrThrow(
          Option.fromUndefinedOr(statusPlacements[(seed + step * 3) % statusPlacements.length]),
        );
        cells.add(`${phase}/${outcome}/${placement}`);
        yield* statusHistory(phase, outcome, placement, step % 2 === 0, seed % 2 === 0);
      }
      expect(cells.size).toBe(16);
    }),
  );

for (const command of [
  Command.Pause(),
  Command.Resume(),
  Command.Seek({ seconds: 5 }),
  Command.Follow(),
  Command.Start({ track: start }),
])
  it.effect(
    `ordinary ${command._tag} revokes Held before dispatch and stale release is inert`,
    () =>
      Effect.gen(function* () {
        const app = yield* openWordSeek();
        yield* app.play;
        app.hold(HoldCommand.Begin({ targets: app.targets }));
        const held = yield* app.untilHold('Held');
        if (held._tag !== 'Held') return;
        app.hold(HoldCommand.Select({ token: held.token, line: 2, word: Option.none() }));
        app.send(command);
        expect(app.registry.get(app.player.hold.state)._tag).toBe('Free');
        app.hold(HoldCommand.Release({ token: held.token }));
        yield* TestClock.adjust(500);
        expect(
          app.commands.filter(({ kind }) => kind === 'seek').some(({ ms }) => ms === 11_000),
        ).toBe(false);
      }).pipe(Effect.scoped),
  );

for (const remote of [
  Remote.Play(),
  Remote.Seek({ seconds: Option.none() }),
  Remote.Seek({ seconds: Option.some(5) }),
])
  it.effect(`remote ${remote._tag} revokes Held and stale cancel cannot restore its origin`, () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek();
      yield* app.play;
      app.hold(HoldCommand.Begin({ targets: app.targets }));
      const held = yield* app.untilHold('Held');
      if (held._tag !== 'Held') return;
      yield* Queue.offer(app.remote, remote);
      yield* TestClock.adjust(500);
      expect(app.registry.get(app.player.hold.state)._tag).toBe('Free');
      const before = app.commands.length;
      app.hold(HoldCommand.Cancel({ token: held.token }));
      yield* TestClock.adjust(250);
      expect(app.commands.length).toBe(before);
    }).pipe(Effect.scoped),
  );

for (const tag of [
  'Idle',
  'Loading',
  'Paused',
  'Stopped',
  'Ended',
  'Failed',
  'Buffering',
  'CountIn',
] as const)
  it.effect(`Begin rejects inactive ${tag} without a playback command`, () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(tag !== 'CountIn');
      if (tag === 'CountIn') app.registry.set(app.intro, true);
      if (tag !== 'Idle' && tag !== 'Loading' && tag !== 'Stopped') yield* app.play;
      if (tag === 'Loading' || tag === 'Stopped') app.send(Command.Start({ track: start }));
      if (tag === 'Paused' || tag === 'Stopped') app.send(Command.Pause());
      if (tag === 'Ended' || tag === 'Failed' || tag === 'Buffering') {
        let state: Status['state'] = 'loading';
        if (tag === 'Ended') state = 'ended';
        if (tag === 'Failed') state = 'failed';
        yield* app.setStatus({ state, positionMs: 21_000, durationMs: 21_000 });
        yield* TestClock.adjust(2500);
      }
      if (tag !== 'CountIn') yield* app.untilPlayer((state) => state._tag === tag);
      const before = app.commands.length;
      app.hold(HoldCommand.Begin({ targets: app.targets }));
      expect(app.registry.get(app.player.hold.state)._tag).toBe('Free');
      expect(app.commands.length).toBe(before);
    }).pipe(Effect.scoped),
  );

const finalizeCommand = (release: boolean, token: HoldToken): HoldCommand => {
  if (release) return HoldCommand.Release({ token });
  return HoldCommand.Cancel({ token });
};

for (let seed = 0; seed < 128; seed++)
  it.effect(`deferred reference completion order seed ${seed} x128`, () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek();
      let oldPause = Option.none<Deferred.Deferred<Status, PlaybackError>>();
      for (let cycle = 0; cycle < 16; cycle++) {
        app.send(Command.Start({ track: start }));
        yield* TestClock.adjust(250);
        yield* app.untilPlayer(Player.$is('Playing'));
        const pause = yield* Deferred.make<Status, PlaybackError>();
        const seek = yield* Deferred.make<Status, PlaybackError>();
        const resume = yield* Deferred.make<Status, PlaybackError>();
        app.gates.set('pause', pause);
        app.gates.set('seek', seek);
        app.gates.set('resume', resume);
        const before = app.commands.length;
        app.hold(HoldCommand.Begin({ targets: app.targets }));
        const hold = yield* app.untilHold('Acquiring');
        if (hold._tag !== 'Acquiring') return;
        yield* app.waitCall('pause');
        yield* Option.match(oldPause, {
          onNone: () => Effect.void,
          onSome: (answer) =>
            Deferred.succeed(answer, { state: 'paused', positionMs: 1500 }).pipe(Effect.asVoid),
        });
        expect(app.registry.get(app.player.hold.state)._tag).toBe('Acquiring');
        const line = 1 + ((seed + cycle) % 3);
        const ms = 1000 + line * 5000;
        app.hold(HoldCommand.Select({ token: hold.token, line, word: Option.none() }));
        expect(app.commands.slice(before).map(({ kind }) => kind)).toEqual(['pause']);
        const released = (seed + cycle) % 2 === 0;
        const revoked = (seed * 7 + cycle) % 4 === 0;
        app.hold(finalizeCommand(released, hold.token));
        expect(app.registry.get(app.player.hold.state)._tag).toBe('Acquiring');
        if (revoked) app.hold(HoldCommand.Invalidate({ reason: 'timeline' }));
        else app.hold(finalizeCommand(!released, hold.token));
        if (revoked) {
          oldPause = Option.some(pause);
          expect(app.registry.get(app.player.hold.state)._tag).toBe('Free');
        } else {
          oldPause = Option.none();
          yield* Deferred.succeed(pause, { state: 'paused', positionMs: 1500, durationMs: 21_000 });
          if (released) yield* app.waitCall('seek');
          else yield* app.waitCall('resume');
          expect(app.registry.get(app.player.hold.state)._tag).toBe('Landing');
        }
        yield* Deferred.succeed(seek, { state: 'paused', positionMs: ms, durationMs: 21_000 });
        if (!revoked && released) yield* app.waitCall('resume');
        expect(app.commands.slice(before).filter(({ kind }) => kind === 'seek').length).toBe(
          Number(released && !revoked),
        );
        yield* Deferred.succeed(resume, { state: 'playing', positionMs: ms, durationMs: 21_000 });
        if (!revoked) yield* app.untilHold('Free');
        app.hold(HoldCommand.Release({ token: hold.token }));
        expect(app.registry.get(app.player.hold.state)._tag).toBe('Free');
        expect(app.commands.slice(before).filter(({ kind }) => kind === 'resume').length).toBe(
          Number(!revoked),
        );
      }
      if (Option.isSome(oldPause))
        yield* Deferred.succeed(oldPause.value, { state: 'paused', positionMs: 1500 });
    }).pipe(Effect.scoped),
  );

for (const state of ['idle', 'ended', 'failed'] as const)
  it.effect(`unexpected ${state} device state revokes a held transaction`, () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek();
      yield* app.play;
      app.hold(HoldCommand.Begin({ targets: app.targets }));
      const held = yield* app.untilHold('Held');
      if (held._tag !== 'Held') return;
      yield* app.setStatus({ state, positionMs: 1500, durationMs: 21_000 });
      yield* TestClock.adjust(250);
      yield* app.untilHold('Free');
      app.hold(HoldCommand.Release({ token: held.token }));
      expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(0);
      expect(app.commands.filter(({ kind }) => kind === 'seek').length).toBe(0);
    }).pipe(Effect.scoped),
  );

it.effect(
  'off-window seek acknowledgements retry the same selected target without early resume',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek();
      yield* app.play;
      app.hold(HoldCommand.Begin({ targets: app.targets }));
      const hold = yield* app.untilHold('Held');
      if (hold._tag !== 'Held') return;
      const answer = yield* Deferred.make<Status, PlaybackError>();
      app.gates.set('seek', answer);
      app.hold(HoldCommand.Select({ token: hold.token, line: 2, word: Option.some(0) }));
      app.hold(HoldCommand.Release({ token: hold.token }));
      yield* app.waitCall('seek');
      app.gates.delete('seek');
      yield* Deferred.succeed(answer, { state: 'paused', positionMs: 1500, durationMs: 21_000 });
      expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(0);
      yield* TestClock.adjust(250);
      yield* app.untilHold('Free');
      expect(app.commands.filter(({ kind }) => kind === 'seek').map(({ ms }) => ms)).toEqual([
        11_100, 11_100,
      ]);
      expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(1);
    }).pipe(Effect.scoped),
);

it.effect('a refused resume closes its token without another seek or resume', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek();
    yield* app.play;
    app.hold(HoldCommand.Begin({ targets: app.targets }));
    const hold = yield* app.untilHold('Held');
    if (hold._tag !== 'Held') return;
    const answer = yield* Deferred.make<Status, PlaybackError>();
    app.gates.set('resume', answer);
    app.hold(HoldCommand.Cancel({ token: hold.token }));
    yield* app.waitCall('resume');
    yield* Deferred.fail(answer, PlaybackError.make({ operation: 'resume', message: 'fixture' }));
    yield* app.untilHold('Free');
    app.hold(HoldCommand.Release({ token: hold.token }));
    expect(app.commands.filter(({ kind }) => kind === 'seek').length).toBe(0);
    expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(1);
  }).pipe(Effect.scoped),
);

for (let seed = 0; seed < 128; seed++)
  it.effect(`owned hold reference machine seed ${seed} x128`, () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(seed % 2 === 0);
      yield* app.play;
      let random = seed + 1;
      let token = Option.none<HoldToken>();
      let stale = Option.none<HoldToken>();
      let selected = 1200;
      let expectedSeeks = 0;
      let expectedResumes = 0;
      const cells = new Set<number>();
      for (let step = 0; step < 128; step++) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const event = (random >>> 16) % 8;
        cells.add(event);
        if (event === 0 && Option.isNone(token)) {
          app.send(Command.Start({ track: start }));
          yield* TestClock.adjust(250);
          yield* app.untilPlayer(Player.$is('Playing'));
          app.hold(HoldCommand.Begin({ targets: app.targets }));
          const hold = yield* app.untilHold('Held');
          if (hold._tag !== 'Held') return;
          token = Option.some(hold.token);
          selected = 1200;
        } else if (Option.isSome(token)) {
          switch (event) {
            case 1:
              app.hold(HoldCommand.Select({ token: token.value, line: 2, word: Option.some(0) }));
              selected = 11_100;
              break;
            case 2:
              app.hold(HoldCommand.Select({ token: token.value, line: 3, word: Option.none() }));
              selected = 16_000;
              break;
            case 3:
              app.hold(
                HoldCommand.Select({ token: token.value, line: NaN, word: Option.some(Infinity) }),
              );
              break;
            case 4:
            case 5: {
              stale = token;
              if (event === 4) {
                app.hold(HoldCommand.Release({ token: token.value }));
                expectedSeeks++;
              } else app.hold(HoldCommand.Cancel({ token: token.value }));
              expectedResumes++;
              yield* app.untilHold('Free');
              token = Option.none();
              if (event === 4)
                expect(app.commands.filter(({ kind }) => kind === 'seek').at(-1)?.ms).toBe(
                  selected,
                );
              break;
            }
            case 6:
              stale = token;
              app.send(Command.Pause());
              token = Option.none();
              break;
            case 7:
              stale = token;
              app.hold(HoldCommand.Invalidate({ reason: 'background' }));
              token = Option.none();
              break;
            case 0:
              app.hold(HoldCommand.Begin({ targets: app.targets }));
              break;
          }
        }
        Option.match(stale, {
          onNone: () => {},
          onSome: (token) => app.hold(HoldCommand.Release({ token })),
        });
        expect(app.registry.get(app.player.hold.state)._tag).toBe(
          Option.match(token, { onNone: () => 'Free', onSome: () => 'Held' }),
        );
        expect(app.commands.filter(({ kind }) => kind === 'seek').length).toBe(expectedSeeks);
        expect(app.commands.filter(({ kind }) => kind === 'resume').length).toBe(expectedResumes);
      }
      expect(cells.size).toBe(8);
    }).pipe(Effect.scoped),
  );
