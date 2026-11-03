import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Path, Schema } from 'effect';
import { sha256Hex } from '../digest.ts';
import { memoryFileSystem, memoryLocks, text } from '../host/testing.ts';
import { ContentStore } from '../content-store.ts';
import { buildGraph } from './graph.ts';
import { clipMakeStages } from './clip-make.ts';
import { clipRequestOf } from './clips.ts';

const FIRST = text('first frame png');
const LAST = text('last frame png');
const MP4 = text('the clip mp4');
const PROMPT = 'Flat 2D cut-paper cartoon animation. The boy raises his hand, then holds the pose.';

const clip = (over: { readonly seed?: number; readonly last?: string } = {}) => ({
  id: 'raise/clip-b',
  file: 'cutout/raise/clip/clip-b.mp4',
  bands: [
    [0, 40],
    [41, 123],
  ] as const,
  given: Option.match(Option.fromUndefinedOr(over.last), {
    onNone: () => ({ first: 'turnaround-front' }),
    onSome: (last) => ({ first: 'turnaround-front', last }),
  }),
  expect: [['turnaround-front'], ['single-single-1']],
  prompt: PROMPT,
  seed: over.seed ?? 7,
});

/** A checkout at `root` holding member `m` at `<root>/cast/m`, its clip's first frame, and `extra` from the root. */
const checkout = (root: string, extra: Record<string, Uint8Array> = {}) =>
  new Map<string, Uint8Array>([
    [`${root}/cast/m/cutout/raise/clip/clip-b.first.png`, FIRST],
    ...Object.entries(extra).map(([p, b]) => [`${root}/${p}`, b] as const),
  ]);

const REQUEST = clipRequestOf({
  prompt: PROMPT,
  seed: 7,
  first: { path: 'cast/m/cutout/raise/clip/clip-b.first.png', sha256: sha256Hex(FIRST) },
  last: Option.none(),
});

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const provenance = (request = REQUEST, mp4 = MP4) =>
  text(
    encodeJson({
      ...request,
      requestId: 'r1',
      made: '2026-11-01',
      usd: 0.1625,
      output: { width: 704, height: 1440, fps: 24, frames: 124, sha256: sha256Hex(mp4) },
      map: { x0: -182, y0: 68, scale: 2 },
    }),
  );

const build = (disk: Map<string, Uint8Array>, root: string, c = clip(), plan = false) =>
  Effect.gen(function* () {
    const stages = yield* clipMakeStages(
      {
        member: 'm',
        memberDir: `${root}/cast/m`,
        coverage: { member: 'm', entries: [], clips: [c] },
      },
      root,
    );
    return yield* buildGraph(stages, { root, cache: '/cache', plan, touch: [], spend: new Set() });
  }).pipe(
    Effect.provide(
      ContentStore.layer.pipe(
        Layer.provideMerge([memoryFileSystem(disk), Path.layer, memoryLocks]),
      ),
    ),
  );

const only = (report: {
  readonly stages: ReadonlyArray<{
    readonly id: string;
    readonly state: string;
    readonly key: Option.Option<string>;
    readonly reason: Option.Option<string>;
  }>;
}) => {
  expect(report.stages.map((s) => s.id)).toEqual(['clip:raise/clip-b@m']);
  const s = report.stages[0]!;
  return {
    state: s.state,
    key: Option.getOrUndefined(s.key),
    reason: Option.getOrElse(s.reason, () => ''),
  };
};

describe('cast build: the clip-make stage', () => {
  it.effect(
    'ClipMissing: a clip not yet made fails the build, its reason carrying the exact fal request as JSON',
    () =>
      Effect.gen(function* () {
        const s = only(yield* build(checkout('/one'), '/one'));
        expect(s.state).toBe('failed');
        expect(s.reason).toContain('ClipMissing');
        expect(s.reason).toContain(encodeJson(REQUEST));
      }),
  );

  it.effect('ClipMissing: a committed clip made for another seed is not adopted', () =>
    Effect.gen(function* () {
      const other = clipRequestOf({
        prompt: PROMPT,
        seed: 11,
        first: REQUEST.frames.first,
        last: Option.none(),
      });
      const disk = checkout('/one', {
        'cast/m/cutout/raise/clip/clip-b.mp4': MP4,
        'cast/m/cutout/raise/clip/clip-b.json': provenance(other),
      });
      const s = only(yield* build(disk, '/one'));
      expect(s.state).toBe('failed');
      expect(s.reason).toContain(encodeJson(REQUEST));
    }),
  );

  it.effect(
    'adopts a committed clip whose provenance is the request and whose mp4 it names, then reads it cached',
    () =>
      Effect.gen(function* () {
        const disk = checkout('/one', {
          'cast/m/cutout/raise/clip/clip-b.mp4': MP4,
          'cast/m/cutout/raise/clip/clip-b.json': provenance(),
        });
        const ran = only(yield* build(disk, '/one'));
        expect(ran.state).toBe('ran');
        expect(disk.get(`/cache/objects/${sha256Hex(MP4)}`)).toEqual(MP4);
        const again = only(yield* build(disk, '/one'));
        expect(again).toEqual({ ...ran, state: 'cached' });
      }),
  );

  it.effect(
    'ClipMissing: a cached clip whose committed provenance now names another seed is not read cached',
    () =>
      Effect.gen(function* () {
        const disk = checkout('/one', {
          'cast/m/cutout/raise/clip/clip-b.mp4': MP4,
          'cast/m/cutout/raise/clip/clip-b.json': provenance(),
        });
        expect(only(yield* build(disk, '/one')).state).toBe('ran');
        const other = clipRequestOf({
          prompt: PROMPT,
          seed: 11,
          first: REQUEST.frames.first,
          last: Option.none(),
        });
        disk.set('/one/cast/m/cutout/raise/clip/clip-b.json', provenance(other));
        const s = only(yield* build(disk, '/one'));
        expect(s.state).toBe('failed');
        expect(s.reason).toContain('ClipMissing');
        expect(s.reason).toContain(encodeJson(REQUEST));
      }),
  );

  it.effect(
    'a cached clip whose committed mp4 and provenance were replaced by a valid pair gives the new mp4',
    () =>
      Effect.gen(function* () {
        const disk = checkout('/one', {
          'cast/m/cutout/raise/clip/clip-b.mp4': MP4,
          'cast/m/cutout/raise/clip/clip-b.json': provenance(),
        });
        const first = only(yield* build(disk, '/one'));
        const NEW = text('the clip mp4, made again');
        disk.set('/one/cast/m/cutout/raise/clip/clip-b.mp4', NEW);
        disk.set('/one/cast/m/cutout/raise/clip/clip-b.json', provenance(REQUEST, NEW));
        const again = only(yield* build(disk, '/one'));
        expect(again.state).toBe('ran');
        expect(again.key).toBe(first.key);
        expect(disk.get(`/cache/objects/${sha256Hex(NEW)}`)).toEqual(NEW);
      }),
  );

  it.effect(
    'ClipMissing: a cached clip whose committed mp4 alone was replaced is not read cached',
    () =>
      Effect.gen(function* () {
        const disk = checkout('/one', {
          'cast/m/cutout/raise/clip/clip-b.mp4': MP4,
          'cast/m/cutout/raise/clip/clip-b.json': provenance(),
        });
        expect(only(yield* build(disk, '/one')).state).toBe('ran');
        disk.set('/one/cast/m/cutout/raise/clip/clip-b.mp4', text('another mp4'));
        const s = only(yield* build(disk, '/one'));
        expect(s.state).toBe('failed');
        expect(s.reason).toContain('ClipMissing');
      }),
  );

  it.effect('asks for the last frame too when the clip is given one', () =>
    Effect.gen(function* () {
      const disk = checkout('/one', { 'cast/m/cutout/raise/clip/clip-b.last.png': LAST });
      const s = only(yield* build(disk, '/one', clip({ last: 'single-single-1' })));
      const withLast = clipRequestOf({
        prompt: PROMPT,
        seed: 7,
        first: REQUEST.frames.first,
        last: Option.some({
          path: 'cast/m/cutout/raise/clip/clip-b.last.png',
          sha256: sha256Hex(LAST),
        }),
      });
      expect(s.reason).toContain(encodeJson(withLast));
    }),
  );

  it.effect('fails, naming the frame, when a given frame is not in the checkout', () =>
    Effect.gen(function* () {
      const s = only(yield* build(checkout('/one'), '/one', clip({ last: 'single-single-1' })));
      expect(s.state).toBe('failed');
      expect(s.reason).toContain('cast/m/cutout/raise/clip/clip-b.last.png');
    }),
  );

  it.effect(
    "keys by the request's content: the same in another checkout, apart for another seed",
    () =>
      Effect.gen(function* () {
        const one = only(yield* build(checkout('/one'), '/one', clip(), true));
        const two = only(yield* build(checkout('/two'), '/two', clip(), true));
        const seed = only(yield* build(checkout('/one'), '/one', clip({ seed: 11 }), true));
        expect(one.key).toBeDefined();
        expect(two.key).toBe(one.key);
        expect(seed.key).not.toBe(one.key);
      }),
  );
});
