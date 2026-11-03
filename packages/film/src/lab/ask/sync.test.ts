import { describe, expect, it, test } from 'effect-bun-test';
import { Effect, Layer, Option } from 'effect';
import { manualFrames } from '../../browser/fixtures/frames.ts';
import { fakeMedia } from '../../browser/fixtures/media.ts';
import { hostOf } from '../../browser/host.ts';
import { Media } from '../../browser/media.ts';
import { SyncEvent, SyncState, UNKNOWN_END } from './sync-machine.ts';
import { makeSync } from './sync.ts';

const settle = Effect.repeat(Effect.yieldNow, { times: 10 });

const clock = (t: number, seek = 0) => ({
  t,
  start: 0,
  end: 10,
  fps: 30,
  rate: 1 as const,
  audible: 'a',
  seek,
});

const rig = (refuse?: { readonly a?: string; readonly b?: string }) => {
  const frames = manualFrames();
  const told: Array<SyncEvent> = [];
  const host = hostOf(
    Layer.mergeAll(
      frames.layer,
      Media.layerOver(() => fakeMedia().media),
    ),
  );
  const driver = makeSync('a', (event) => told.push(event), host);
  const a = fakeMedia(refuse?.a);
  const b = fakeMedia(refuse?.b);
  a.el.finishLoading(10);
  b.el.finishLoading(10);
  const release = { a: driver.attach('a', a.media), b: driver.attach('b', b.media) };
  expect(told).toEqual([SyncEvent.Measured({ end: 10 })]);
  told.length = 0;
  return { frames, told, driver, a, b, release, tags: () => told.map((e) => e._tag) };
};

describe('the sync driver', () => {
  test("a playing set tells the machine the clock's time as it moves, and pulls a drifter back", () => {
    const { frames, told, driver, a, b } = rig();
    driver.apply(SyncState.Playing(clock(0)));
    a.el.currentTime = 1;
    b.el.currentTime = 1.1;
    a.asked.length = 0;
    b.asked.length = 0;
    frames.frame(16);
    expect(told.at(-1)).toMatchObject({ _tag: 'Ticked', t: 1 });
    expect(b.asked).toEqual([]);
    a.el.currentTime = 2;
    a.asked.length = 0;
    frames.frame(32);
    expect(b.asked).toEqual(['seek 2']);
    expect(told.at(-1)).toMatchObject({ _tag: 'Ticked', t: 2 });
  });

  test('a drifter on a slow clock (1 or 1.25 frames a second) is put back once, never again as the clock plays on', () => {
    for (const fps of [1, 1.25]) {
      const { frames, driver, a, b } = rig();
      let at = 3 / fps + 0.01;
      let follower = at + 0.3;
      driver.apply(SyncState.Playing({ ...clock(at), fps }));
      const seeks: Array<string> = [];
      for (let n = 1; n <= 10; n++) {
        a.el.currentTime = at;
        b.el.currentTime = follower;
        a.asked.length = 0;
        b.asked.length = 0;
        frames.frame(16 * n);
        seeks.push(...b.asked);
        follower = b.el.currentTime + 1 / 60;
        at += 1 / 60;
      }
      expect({ fps, seeks }).toEqual({ fps, seeks: [`seek ${3 / fps + 0.01}`] });
    }
  });

  test('a paused set asks for no frame; a seek moves every video', () => {
    const { frames, driver, a, b } = rig();
    driver.apply(SyncState.Paused(clock(3, 1)));
    expect(frames.pending()).toBe(0);
    expect(a.asked.slice(-2)).toEqual([`seek ${90.25 / 30}`, 'pause']);
    expect(b.asked.slice(-2)).toEqual([`seek ${90.25 / 30}`, 'pause']);
  });

  test('a seek lands a quarter of a frame into the frame its timecode reads', () => {
    const { driver, a } = rig();
    const at = (t: number, fps: number, seek: number) =>
      driver.apply(SyncState.Paused({ ...clock(t, seek), fps }));
    at(25 / 24, 24, 1);
    expect(a.asked.slice(-2)).toEqual([`seek ${25.25 / 24}`, 'pause']);
    at(62 / 30, 30, 2);
    expect(a.asked.slice(-2)).toEqual([`seek ${62.25 / 30}`, 'pause']);
    at(1001 / 30000, 30000 / 1001, 3);
    expect(a.asked.slice(-2)).toEqual([`seek ${1.25 / (30000 / 1001)}`, 'pause']);
    at(0.1 + 0.2, 30, 4);
    expect(a.asked.slice(-2)).toEqual([`seek ${9.25 / 30}`, 'pause']);
    at(0.52, 24, 5);
    expect(a.asked.slice(-2)).toEqual([`seek ${12.25 / 24}`, 'pause']);
    at(0.53, 24, 6);
    expect(a.asked.slice(-2)).toEqual([`seek ${13.25 / 24}`, 'pause']);
  });

  test("each video lands in its own frame at the clock's, once its rate is told, and is put there as it is told", () => {
    const { driver, a, b } = rig();
    driver.apply(SyncState.Paused({ ...clock(3 / 24, 1), fps: 24 }));
    expect(a.asked.slice(-2)).toEqual([`seek ${3.25 / 24}`, 'pause']);
    b.asked.length = 0;
    driver.timed('b', Option.some(30));
    expect(b.asked).toEqual([`seek ${3.25 / 30}`]);
    driver.timed('b', Option.some(30));
    expect(b.asked).toEqual([`seek ${3.25 / 30}`]);
    driver.timed('b', Option.none());
    expect(b.asked).toEqual([`seek ${3.25 / 30}`, `seek ${3.25 / 24}`]);
    driver.timed('b', Option.none());
    expect(b.asked).toEqual([`seek ${3.25 / 30}`, `seek ${3.25 / 24}`]);
    const ntsc = 30000 / 1001;
    driver.timed('b', Option.some(ntsc));
    driver.apply(SyncState.Paused({ ...clock(3 / 30, 2), fps: 30 }));
    expect(a.asked.slice(-2)).toEqual([`seek ${3.25 / 30}`, 'pause']);
    expect(b.asked.slice(-2)).toEqual([`seek ${2.25 / ntsc}`, 'pause']);
  });

  test("the clock's rate read puts every video on its frames again, where the clock's timecode reads", () => {
    const { driver, a, b } = rig();
    driver.apply(SyncState.Paused({ ...clock(1.042, 1), fps: 30 }));
    a.asked.length = 0;
    b.asked.length = 0;
    driver.apply(SyncState.Paused({ ...clock(1.042, 1), fps: 24 }));
    expect(a.asked).toEqual([`seek ${25.25 / 24}`, 'pause']);
    expect(b.asked).toEqual([`seek ${25.25 / 24}`, 'pause']);
  });

  test("the clock's rate read while playing seeks no video: none is put back to the last tick's time", () => {
    const { driver, a, b } = rig();
    driver.apply(SyncState.Playing({ ...clock(1.042, 1), fps: 30 }));
    a.asked.length = 0;
    b.asked.length = 0;
    driver.apply(SyncState.Playing({ ...clock(1.042, 1), fps: 24 }));
    expect([...a.asked, ...b.asked].filter((asked) => asked.startsWith('seek'))).toEqual([]);
  });

  test("the clock's rate read while the set waits on a video seeks none either: it is about to play on", () => {
    const { driver, a, b } = rig();
    driver.apply(SyncState.Playing({ ...clock(1.042, 1), fps: 30 }));
    driver.apply(SyncState.Buffering({ ...clock(1.042, 1), fps: 30 }));
    a.asked.length = 0;
    b.asked.length = 0;
    driver.apply(SyncState.Buffering({ ...clock(1.042, 1), fps: 24 }));
    expect([...a.asked, ...b.asked].filter((asked) => asked.startsWith('seek'))).toEqual([]);
  });

  test('a set waiting on a stalled video resumes once every video can play on', () => {
    const { frames, driver, b, tags } = rig();
    driver.apply(SyncState.Playing(clock(0)));
    b.el.readyState = 1;
    b.el.fire('waiting');
    driver.apply(SyncState.Buffering(clock(0)));
    frames.frame(16);
    expect(tags()).toEqual(['Stalled']);
    b.el.readyState = 4;
    frames.frame(32);
    expect(tags()).toEqual(['Stalled', 'Resumed']);
  });

  it.effect(
    'a set waiting on its videos does not wait on one whose media failed, and leaves it where it is',
    () =>
      Effect.gen(function* () {
        const { frames, driver, a, b, tags } = rig({ b: 'NotSupportedError' });
        driver.apply(SyncState.Playing(clock(0)));
        yield* b.answered;
        yield* settle;
        b.el.readyState = 1;
        driver.apply(SyncState.Buffering(clock(0)));
        frames.frame(16);
        expect(tags()).toEqual(['Resumed']);
        driver.apply(SyncState.Playing(clock(0)));
        b.asked.length = 0;
        a.el.currentTime = 2;
        frames.frame(32);
        expect(b.asked).toEqual([]);
      }),
  );

  it.effect(
    'a play the browser refuses sound for plays muted; only the audible video is unmuted',
    () =>
      Effect.gen(function* () {
        const { driver, a, b } = rig({ a: 'NotAllowedError' });
        driver.apply(SyncState.Playing(clock(0)));
        expect([a.el.muted, b.el.muted]).toEqual([false, true]);
        yield* a.answered;
        yield* a.answered;
        expect(a.asked.filter((asked) => asked === 'play')).toEqual(['play', 'play']);
        expect(a.el.muted).toBe(true);
        expect(a.el.paused).toBe(false);
      }),
  );

  it.effect('a seek still pending ends when its video is replaced, released or stopped', () =>
    Effect.gen(function* () {
      const { driver, a, b, release } = rig();
      const c = fakeMedia();
      c.el.finishLoading(10);
      for (const v of [a, b, c]) v.el.holdsSeeks = true;
      driver.attach('c', c.media);
      driver.apply(SyncState.Paused(clock(3, 1)));
      yield* Effect.yieldNow;
      const waiting = () => [a, b, c].map((v) => v.el.listening('seeked'));
      expect(waiting()).toEqual([1, 1, 1]);
      driver.attach('a', fakeMedia().media);
      yield* Effect.yieldNow;
      expect(waiting()).toEqual([0, 1, 1]);
      release.b();
      yield* Effect.yieldNow;
      expect(waiting()).toEqual([0, 0, 1]);
      driver.stop();
      yield* Effect.yieldNow;
      expect(waiting()).toEqual([0, 0, 0]);
    }),
  );

  test('a video let go after another took its place leaves the one in its place', () => {
    const { driver, a, release } = rig();
    const next = fakeMedia();
    next.el.finishLoading(10);
    driver.attach('a', next.media);
    release.a();
    driver.apply(SyncState.Paused(clock(4, 1)));
    expect(next.asked.slice(-2)).toEqual([`seek ${120.25 / 30}`, 'pause']);
    expect(a.asked).not.toContain(`seek ${120.25 / 30}`);
  });

  it.effect('a player says its clock cannot play: a play refused as unsupported', () =>
    Effect.gen(function* () {
      const { driver, a, told, frames } = rig({ a: 'NotSupportedError' });
      driver.apply(SyncState.Playing(clock(0)));
      yield* a.answered;
      yield* settle;
      expect(told).toEqual([SyncEvent.MediaFailed({ reason: 'NotSupportedError' })]);
      driver.apply(SyncState.Failed({ ...clock(0), reason: 'NotSupportedError' }));
      frames.frame(16);
      expect(frames.pending()).toBe(0);
      expect(a.el.paused).toBe(true);
    }),
  );

  test("a player says its clock's media failed, never another's", () => {
    const { a, b, tags } = rig();
    b.el.fire('error');
    expect(tags()).toEqual([]);
    a.el.fire('error');
    expect(tags()).toEqual(['MediaFailed']);
  });

  test("the clock's new media, after its last failed, is told; another's, or over a clock that plays, is not", () => {
    const { driver, tags } = rig();
    const media = () => fakeMedia().media;
    driver.apply(SyncState.Playing(clock(2)));
    driver.attach('a', media());
    expect(tags()).toEqual([]);
    driver.apply(SyncState.Failed({ ...clock(2), reason: 'error' }));
    driver.attach('b', media());
    expect(tags()).toEqual([]);
    driver.attach('a', media());
    expect(tags()).toEqual(['MediaReplaced']);
  });

  test("a clock that follows another version tells that one's end, failure and ending, and hears only it after", () => {
    const { driver, a, b, told, tags } = rig();
    b.el.finishLoading(6);
    driver.follow('b');
    expect(told).toEqual([SyncEvent.ClockMoved({ end: 6 })]);
    a.el.fire('ended');
    a.el.fire('error');
    expect(tags()).toEqual(['ClockMoved']);
    b.el.fire('ended');
    expect(tags()).toEqual(['ClockMoved', 'Ended']);
    a.el.ended = true;
    driver.follow('a');
    expect(tags()).toEqual(['ClockMoved', 'Ended', 'ClockMoved', 'MediaFailed', 'Ended']);
    driver.follow('a');
    expect(tags()).toHaveLength(5);
  });

  test('a clock that follows a version not attached yet says its end is not known', () => {
    const { driver, told } = rig();
    driver.follow('c');
    expect(told).toEqual([SyncEvent.ClockMoved({ end: UNKNOWN_END })]);
  });

  test("while the leading version has no video, the set's time comes from no other: one clock, its time and its events one video's", () => {
    const frames = manualFrames();
    const told: Array<SyncEvent> = [];
    const host = hostOf(
      Layer.mergeAll(
        frames.layer,
        Media.layerOver(() => fakeMedia().media),
      ),
    );
    const driver = makeSync('a', (event) => told.push(event), host);
    const b = fakeMedia();
    b.el.finishLoading(6);
    driver.attach('b', b.media);
    driver.apply(SyncState.Playing(clock(0)));
    b.el.currentTime = 2;
    frames.frame(16);
    b.el.fire('ended');
    expect(told.map((e) => e._tag)).toEqual([]);
    driver.follow('b');
    b.el.currentTime = 3;
    frames.frame(16);
    b.el.fire('ended');
    expect(told).toEqual([
      SyncEvent.ClockMoved({ end: 6 }),
      SyncEvent.Ticked({ t: 3 }),
      SyncEvent.Ended,
    ]);
  });

  test("the clock's video measured before it joins the set is told: its end is known, not waited on", () => {
    const frames = manualFrames();
    const told: Array<SyncEvent> = [];
    const host = hostOf(
      Layer.mergeAll(
        frames.layer,
        Media.layerOver(() => fakeMedia().media),
      ),
    );
    const driver = makeSync('a', (event) => told.push(event), host);
    const a = fakeMedia();
    a.el.finishLoading(8);
    const b = fakeMedia();
    b.el.finishLoading(6);
    driver.attach('b', b.media);
    expect(told).toEqual([]);
    driver.attach('a', a.media);
    expect(told).toEqual([SyncEvent.Measured({ end: 8 })]);
  });

  test('stopped, every video is paused and no frame is asked for', () => {
    const { frames, driver, a, b } = rig();
    driver.apply(SyncState.Playing(clock(0)));
    driver.stop();
    frames.frame(16);
    expect([a.el.paused, b.el.paused]).toEqual([true, true]);
    expect(frames.pending()).toBe(0);
  });
});
