// The player's clock machine, with no DOM: it plays and pauses, plays again
// from the start once at the end, holds while a video stalls, scrubs
// (playing on after if it was), steps, and keeps its rate and the sound it
// plays through all of it; a seek counts, a tick does not.

import { Effect } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { assertPath, simulate } from 'effect-machine';
import {
  SyncEvent,
  SyncState,
  UNKNOWN_END,
  UNTIMED_FPS,
  atRest,
  clockParts,
  reachOf,
  runningOf,
  syncMachine,
} from './sync-machine.ts';

const player = syncMachine('A', 1);

const clock = {
  t: 1,
  start: 1,
  end: 10,
  fps: UNTIMED_FPS,
  rate: 1,
  audible: 'A',
  seek: 0,
} as const;

describe('the synced player', () => {
  it.effect('plays and pauses, by the button and by space', () =>
    Effect.gen(function* () {
      yield* assertPath(
        player,
        [
          SyncEvent.Measured({ end: 10 }),
          SyncEvent.PlayPressed,
          SyncEvent.PausePressed,
          SyncEvent.Toggled,
          SyncEvent.Toggled,
        ],
        ['Paused', 'Paused', 'Playing', 'Paused', 'Playing', 'Paused'],
      );
    }),
  );

  it.effect('follows the clock while playing, never past the end; a tick is no seek', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.PlayPressed,
        SyncEvent.Ticked({ t: 4.2 }),
        SyncEvent.Ticked({ t: 11 }),
      ]);
      expect(result.finalState).toEqual(SyncState.Playing({ ...clock, t: 10 }));
    }),
  );

  it.effect("opens at a link's time, never before the start, and stands at the end past it", () =>
    Effect.gen(function* () {
      expect((yield* simulate(syncMachine('A', 1, 4.5), [])).finalState).toEqual(
        SyncState.Paused({ ...clock, t: 4.5, end: UNKNOWN_END }),
      );
      expect((yield* simulate(syncMachine('A', 1, -3), [])).finalState.t).toBe(1);
      const past = yield* simulate(syncMachine('A', 1, 30), [SyncEvent.Measured({ end: 10 })]);
      expect(past.finalState).toEqual(SyncState.Paused({ ...clock, t: 10 }));
    }),
  );

  it.effect('stops at the end, and plays again from the start', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.PlayPressed,
        SyncEvent.Ticked({ t: 9.9 }),
        SyncEvent.Ended,
        SyncEvent.PlayPressed,
      ]);
      expect(result.states.at(-2)).toEqual(SyncState.Paused({ ...clock, t: 10 }));
      expect(result.finalState).toEqual(SyncState.Playing({ ...clock, t: 1, seek: 1 }));
    }),
  );

  it.effect('holds while a video stalls, and plays on once it can; a pause there pauses', () =>
    Effect.gen(function* () {
      yield* assertPath(
        player,
        [
          SyncEvent.PlayPressed,
          SyncEvent.Stalled,
          SyncEvent.Ticked({ t: 5 }),
          SyncEvent.Resumed,
          SyncEvent.Stalled,
          SyncEvent.Toggled,
          SyncEvent.Stalled,
        ],
        // A tick while it waits, and a stall once paused, change nothing.
        ['Paused', 'Playing', 'Buffering', 'Playing', 'Buffering', 'Paused'],
      );
    }),
  );

  it.effect('scrubs every video, playing on after only if it was playing', () =>
    Effect.gen(function* () {
      const paused = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.ScrubMoved({ t: 3 }),
        SyncEvent.ScrubMoved({ t: 20 }),
        SyncEvent.ScrubReleased,
      ]);
      expect(paused.states.slice(2).map((s) => s._tag)).toEqual([
        'Scrubbing',
        'Scrubbing',
        'Paused',
      ]);
      expect(paused.finalState).toEqual(SyncState.Paused({ ...clock, t: 10, seek: 2 }));
      const playing = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.PlayPressed,
        SyncEvent.ScrubMoved({ t: 0 }),
        SyncEvent.ScrubReleased,
      ]);
      expect(playing.finalState).toEqual(SyncState.Playing({ ...clock, t: 1, seek: 1 }));
    }),
  );

  it.effect(
    'steps one frame of the clock either way inside the set, as it stands, onto the frame grid',
    () =>
      Effect.gen(function* () {
        const step = (by: number) => SyncEvent.Stepped({ frames: by });
        const frameOf = (t: number) => Math.round(t * UNTIMED_FPS * 1e6) / 1e6;
        const result = yield* simulate(player, [
          SyncEvent.Measured({ end: 10 }),
          // A clock between frames (a video's time) steps from the frame its timecode reads.
          SyncEvent.Landed({ t: 1.0101 }),
          step(1),
          step(10),
          SyncEvent.PlayPressed,
          step(-1),
          step(-100),
        ]);
        expect(result.states.map((s) => [s._tag, frameOf(s.t), s.seek])).toEqual([
          ['Paused', 30, 0],
          ['Paused', 30, 0],
          ['Paused', 30.303, 1],
          ['Paused', 31, 2],
          ['Paused', 41, 3],
          ['Playing', 41, 3],
          ['Playing', 40, 4],
          // Never before the set's start.
          ['Playing', 30, 5],
        ]);
        // On the grid: ten single steps land where one ×10 does, with no drift.
        const tens = yield* simulate(player, [
          SyncEvent.Measured({ end: 10 }),
          ...Array.from({ length: 10 }, () => step(1)),
        ]);
        expect(tens.finalState.t).toBe(40 / UNTIMED_FPS);
      }),
  );

  it.effect(
    "steps and counts by the clock's video's own rate once it is known, the film rate until then",
    () =>
      Effect.gen(function* () {
        const step = SyncEvent.Stepped({ frames: 1 });
        const result = yield* simulate(player, [
          SyncEvent.Measured({ end: 10 }),
          step,
          SyncEvent.Timed({ fps: 24 }),
          step,
          step,
        ]);
        // At the film rate (30): frame 31; at 24, from the frame it reads (24.8, so 25) on.
        expect(result.states.map((s) => [s.fps, s.t])).toEqual([
          [UNTIMED_FPS, 1],
          [UNTIMED_FPS, 1],
          [UNTIMED_FPS, 31 / 30],
          [24, 31 / 30],
          [24, 26 / 24],
          [24, 27 / 24],
        ]);
        expect(clockParts(result.finalState)).toEqual({
          at: '00:00:01:03',
          rest: ' / 00:00:10:00',
        });
      }),
  );

  it.effect('steps a 29.97 video (30000/1001) on its own grid, never a whole rate', () =>
    Effect.gen(function* () {
      const fps = 30000 / 1001;
      const step = SyncEvent.Stepped({ frames: 1 });
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 60 }),
        SyncEvent.Timed({ fps }),
        SyncEvent.Landed({ t: 30 / fps }),
        step,
        SyncEvent.Landed({ t: 1000 / fps }),
        step,
        step,
      ]);
      // Each step lands on a frame's own start: n of 30000/1001, the picture's time.
      const frames = result.states.slice(-5).map((s) => Math.round(s.t * 30000) / 1001);
      expect(frames).toEqual([30, 31, 1000, 1001, 1002]);
      expect(clockParts(result.finalState).at).toBe('00:00:33:12');
    }),
  );

  it.effect('Back landing on an entry seeks to its time, playing on as it was', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.Landed({ t: 4 }),
        SyncEvent.PlayPressed,
        SyncEvent.Landed({ t: 20 }),
      ]);
      expect(result.states.map((s) => [s._tag, s.t, s.seek])).toEqual([
        ['Paused', 1, 0],
        ['Paused', 1, 0],
        ['Paused', 4, 1],
        ['Playing', 4, 1],
        ['Playing', 10, 2],
      ]);
    }),
  );

  it.effect('keeps the sound heard and the rate through play, scrub and pause', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.HeardChosen({ id: 'C' }),
        SyncEvent.RateChosen({ rate: 0.5 }),
        SyncEvent.PlayPressed,
        SyncEvent.ScrubMoved({ t: 2 }),
        SyncEvent.ScrubReleased,
        SyncEvent.HeardChosen({ id: 'B' }),
        SyncEvent.PausePressed,
      ]);
      expect(result.states.map((s) => [s.audible, s.rate])).toEqual([
        ['A', 1],
        ['C', 1],
        ['C', 0.5],
        ['C', 0.5],
        ['C', 0.5],
        ['C', 0.5],
        ['B', 0.5],
        ['B', 0.5],
      ]);
      expect(result.finalState._tag).toBe('Paused');
    }),
  );

  it.effect('fails where it stands once its media cannot play, and stays failed', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.PlayPressed,
        SyncEvent.Ticked({ t: 3 }),
        SyncEvent.MediaFailed({ reason: 'NotSupportedError' }),
        SyncEvent.Toggled,
        SyncEvent.ScrubMoved({ t: 5 }),
        SyncEvent.Stepped({ frames: 1 }),
      ]);
      expect(result.finalState).toEqual(
        SyncState.Failed({ ...clock, t: 3, reason: 'NotSupportedError' }),
      );
      expect(runningOf(result.finalState)).toBe(false);
    }),
  );

  it.effect(
    'given new media after failing, stands paused where it failed; playing, new media changes nothing',
    () =>
      Effect.gen(function* () {
        const result = yield* simulate(player, [
          SyncEvent.Measured({ end: 10 }),
          SyncEvent.PlayPressed,
          SyncEvent.Ticked({ t: 3 }),
          SyncEvent.MediaReplaced,
          SyncEvent.MediaFailed({ reason: 'error' }),
          SyncEvent.MediaReplaced,
        ]);
        expect(result.states.map((s) => s._tag)).toEqual([
          'Paused',
          'Paused',
          'Playing',
          'Playing',
          'Failed',
          'Paused',
        ]);
        expect(result.finalState).toEqual(SyncState.Paused({ ...clock, t: 3 }));
      }),
  );

  it.effect(
    "on a clock moved to another video, ends at that one's end, unknown until measured; a failed clock's player stands paused",
    () =>
      Effect.gen(function* () {
        const result = yield* simulate(player, [
          SyncEvent.Measured({ end: 10 }),
          SyncEvent.PlayPressed,
          SyncEvent.Ticked({ t: 8 }),
          SyncEvent.ClockMoved({ end: 3 }),
          SyncEvent.ClockMoved({ end: UNKNOWN_END }),
          SyncEvent.MediaFailed({ reason: 'error' }),
          SyncEvent.ClockMoved({ end: 6 }),
        ]);
        expect(result.states.map((s) => [s._tag, s.t, s.end])).toEqual([
          ['Paused', 1, UNKNOWN_END],
          ['Paused', 1, 10],
          ['Playing', 1, 10],
          ['Playing', 8, 10],
          ['Playing', 3, 3],
          ['Playing', 3, UNKNOWN_END],
          ['Failed', 3, UNKNOWN_END],
          ['Paused', 3, 6],
        ]);
      }),
  );

  test('is at rest only paused where it opens: a scrub, even back to the start, is not', () => {
    expect(atRest(SyncState.Paused(clock))).toBe(true);
    expect(atRest(SyncState.Paused({ ...clock, t: 2 }))).toBe(false);
    expect(atRest(SyncState.Scrubbing({ ...clock, resume: false }))).toBe(false);
    expect(atRest(SyncState.Playing(clock))).toBe(false);
    expect(atRest(SyncState.Buffering(clock))).toBe(false);
    expect(atRest(SyncState.Failed({ ...clock, reason: 'NotSupportedError' }))).toBe(false);
  });

  test('runs the videos only while playing', () => {
    expect(runningOf(SyncState.Playing(clock))).toBe(true);
    expect(runningOf(SyncState.Buffering(clock))).toBe(false);
    expect(runningOf(SyncState.Scrubbing({ ...clock, resume: true }))).toBe(false);
    expect(runningOf(SyncState.Paused(clock))).toBe(false);
  });

  test('says where the clock is, the end once known, and when it waits', () => {
    expect(clockParts(SyncState.Paused({ ...clock, end: UNKNOWN_END }))).toEqual({
      at: '00:00:01:00',
      rest: ' / …',
    });
    expect(clockParts(SyncState.Buffering({ ...clock, t: 4 }))).toEqual({
      at: '00:00:04:00',
      rest: ' / 00:00:10:00 · waiting',
    });
    expect(clockParts(SyncState.Paused({ ...clock, t: 65.24, end: 70 }))).toEqual({
      at: '00:01:05:07',
      rest: ' / 00:01:10:00',
    });
    expect(reachOf(SyncState.Paused({ ...clock, end: UNKNOWN_END }))).toBe(1);
    expect(reachOf(SyncState.Paused(clock))).toBe(10);
  });
});
