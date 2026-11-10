import { expect, it } from 'effect-bun-test';
import { Deferred, Effect, Option } from 'effect';
import { TestClock } from 'effect/testing';

import { openWordSeek } from '../test/word-seek';
import { HoldCommand } from './word-seek';
import type { PlaybackError, Status } from './player';

it.effect('held previews never seek and release commits the earliest selected word once', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek();
    yield* app.play;
    expect('hold' in app.player).toBe(true);
    app.hold(HoldCommand.Begin({ targets: app.targets }));
    const held = yield* app.untilHold('Held');
    if (held._tag !== 'Held') return;
    const before = app.trace.filter(({ kind }) => kind === 'seek').length;
    app.hold(HoldCommand.Select({ token: held.token, line: 2, word: Option.some(0) }));
    expect(app.trace.filter(({ kind }) => kind === 'seek').length).toBe(before);
    yield* TestClock.adjust(1000);
    expect(app.registry.get(app.player.state)._tag).toBe('Paused');
    app.hold(HoldCommand.Release({ token: held.token }));
    app.hold(HoldCommand.Release({ token: held.token }));
    yield* app.untilHold('Free');
    expect(app.trace.filter(({ kind }) => kind === 'seek').map(({ ms }) => ms)).toEqual([11_100]);
    expect(app.trace.filter(({ kind }) => kind === 'resume').length).toBe(1);
  }).pipe(Effect.scoped),
);

it.effect('early cancel waits for the actual pause answer and resumes without a preview seek', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek();
    yield* app.play;
    const pause = yield* Deferred.make<Status, PlaybackError>();
    app.gates.set('pause', pause);
    app.hold(HoldCommand.Begin({ targets: app.targets }));
    const held = yield* app.untilHold('Acquiring');
    if (held._tag !== 'Acquiring') return;
    app.hold(HoldCommand.Select({ token: held.token, line: 2, word: Option.some(1) }));
    app.hold(HoldCommand.Cancel({ token: held.token }));
    app.hold(HoldCommand.Release({ token: held.token }));
    yield* Deferred.succeed(pause, { state: 'paused', positionMs: 1500, durationMs: 21_000 });
    yield* app.untilHold('Free');
    expect(app.trace.filter(({ kind }) => kind === 'seek').length).toBe(0);
    expect(app.trace.filter(({ kind }) => kind === 'resume').length).toBe(1);
  }).pipe(Effect.scoped),
);

it.effect('early release is consumed once and lands only after the owned pause acknowledges', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek();
    yield* app.play;
    const pause = yield* Deferred.make<Status, PlaybackError>();
    app.gates.set('pause', pause);
    app.hold(HoldCommand.Begin({ targets: app.targets }));
    const acquiring = yield* app.untilHold('Acquiring');
    if (acquiring._tag !== 'Acquiring') return;
    app.hold(HoldCommand.Select({ token: acquiring.token, line: 1, word: Option.none() }));
    app.hold(HoldCommand.Release({ token: acquiring.token }));
    app.hold(HoldCommand.Cancel({ token: acquiring.token }));
    app.hold(HoldCommand.Select({ token: acquiring.token, line: 2, word: Option.none() }));
    expect(app.trace.filter(({ kind }) => kind === 'seek').length).toBe(0);
    yield* Deferred.succeed(pause, { state: 'paused', positionMs: 1750, durationMs: 21_000 });
    yield* app.untilHold('Free');
    expect(app.trace.filter(({ kind }) => kind === 'pause').length).toBe(1);
    expect(app.trace.filter(({ kind }) => kind === 'seek').map(({ ms }) => ms)).toEqual([6000]);
    expect(app.trace.filter(({ kind }) => kind === 'resume').length).toBe(1);
  }).pipe(Effect.scoped),
);
