import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option } from 'effect';
import { type SceneSpec, createFilm } from '../canvas/film.ts';
import { BLOCK, blockImages } from '../puppet/fixtures/block.ts';
import { NEAR, SKY, paintingImages } from '../painting/fixtures/sky.ts';
import { stroke } from '../canvas/ink.ts';
import { probeFace } from '../canvas/probe.ts';
import { standInDom } from '../canvas/fixtures/stand-in.ts';
import { HANGING_FACE, armFilm, armPose, armRig, armScene } from '../canvas/fixtures/arm.ts';
import { drawFindings, impureAt, momentCounts } from './draw-check.ts';

/** A film of the given scenes, four seconds each. */
const filmOf = (...scenes: ReadonlyArray<readonly [string, SceneSpec['draw']]>) =>
  createFilm({
    fps: 30,
    title: 'draw',
    paper: { base: '#ffffff', tone: '#000000', seed: 1 },
    shade: '#000000',
    scenes: scenes.map(([id, draw]) => ({ id, min: 4, draw })),
    captions: { font: '38px x', color: '#000000', plate: '#ffffff' },
  });

/** The images the leg loads through: the block puppet's part and the fixture plates, from memory. */
const images = () => Layer.mergeAll(blockImages().layer, paintingImages().layer);

/** A film of scenes that each paint one plate, four seconds each. */
const paintedFilm = (...scenes: ReadonlyArray<Pick<SceneSpec, 'id' | 'paintings' | 'draw'>>) =>
  createFilm({
    fps: 30,
    title: 'draw',
    paper: { base: '#ffffff', tone: '#000000', seed: 1 },
    shade: '#000000',
    scenes: scenes.map((s) => ({ ...s, min: 4 })),
  });

/** A face declared at (960, 540), 200 px tall, and a rope drawn across it after. */
const roped: SceneSpec['draw'] = (f) => {
  probeFace(f.ctx, 960, 540, 200);
  stroke(
    f.ctx,
    [
      [700, 520],
      [1220, 560],
    ],
    { color: '#000000', width: 6 },
    f.hand('rope'),
  );
};

describe('the draw leg', () => {
  it.effect('a frame that reads the frame drawn before it is caught', () =>
    Effect.gen(function* () {
      yield* standInDom({ record: false });
      let last = 0;
      const impure = filmOf([
        'one',
        (f) => {
          f.ctx.fillRect(last, 0, 10, 10);
          last = f.t;
        },
      ]);
      expect(Option.isSome(impureAt(impure, 30))).toBe(true);
      const pure = filmOf(['one', (f) => f.ctx.fillRect(f.t, 0, 10, 10)]);
      expect(impureAt(pure, 30)).toEqual(Option.none());
    }).pipe(Effect.scoped),
  );

  it.effect('finds a scene that throws, a frame that is not pure, and a rope over a face', () =>
    Effect.gen(function* () {
      let last = 0;
      const found = yield* drawFindings(() =>
        filmOf(
          ['still', (f) => f.ctx.fillRect(f.t, 0, 10, 10)],
          ['broken', (f) => f.ctx.arc(960, 540, -1, 0, Math.PI)],
          [
            'eased',
            (f) => {
              f.ctx.fillRect(last, 0, 10, 10);
              last = f.t;
            },
          ],
          ['roof', roped],
        ),
      );
      const tagged = (tag: string) => found.filter((f) => f._tag === tag).map((f) => f.scene);
      expect(new Set(tagged('DrawThrew'))).toEqual(new Set(['broken']));
      expect(found.find((f) => f._tag === 'DrawThrew')?.message).toContain('radius');
      expect(new Set(tagged('FrameImpure'))).toEqual(new Set(['eased']));
      expect(tagged('InkOverFace')).toEqual(['roof']);
      expect(found.filter((f) => f.scene === 'still')).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(images())),
  );

  it.effect('lists ink over faces in film order, a mid-cue finding in its own place', () =>
    Effect.gen(function* () {
      const knotted: SceneSpec = {
        id: 'knotted',
        min: 4,
        timeline: { knot: { at: 'start', offset: 0.2, dur: 0.6 } },
        draw: (f) => {
          const knot = f.at('knot');
          if (knot > 0 && knot < 1) roped(f);
        },
      };
      const found = yield* drawFindings(() =>
        createFilm({
          fps: 30,
          title: 'draw',
          paper: { base: '#ffffff', tone: '#000000', seed: 1 },
          shade: '#000000',
          scenes: [knotted, { id: 'roof', min: 4, draw: roped }],
          captions: { font: '38px x', color: '#000000', plate: '#ffffff' },
        }),
      );
      const faces = found.filter((f) => f._tag === 'InkOverFace');
      expect(faces.map((f) => f.scene)).toEqual(['knotted', 'roof']);
    }).pipe(Effect.scoped, Effect.provide(images())),
  );

  it.effect('draws only the scenes it is given, and each at several moments', () =>
    Effect.gen(function* () {
      const build = () => filmOf(['roof', roped], ['bare', (f) => f.ctx.fillRect(0, 0, 1, 1)]);
      const found = yield* drawFindings(build, new Set(['bare']));
      expect(found).toEqual([]);
      yield* standInDom({ record: false });
      const counts = momentCounts(build());
      expect(counts.moments).toBeGreaterThanOrEqual(2 * 3);
      expect(counts.pure).toBeGreaterThanOrEqual(2);
    }).pipe(Effect.scoped, Effect.provide(images())),
  );

  it.effect('poses a declared Rive rig through Bun, its face at its face node', () =>
    Effect.gen(function* () {
      const struck: SceneSpec = {
        id: 'struck',
        min: 4,
        rigs: { arm: armRig('webgl2') },
        draw: (f) => {
          f.ctx.save();
          f.ctx.translate(960, 540);
          f.rive('arm', { timelines: [], numbers: { reach: 0 } });
          f.ctx.restore();
          const [x, y] = [960 + HANGING_FACE[0], 540 + HANGING_FACE[1]];
          stroke(
            f.ctx,
            [
              [x - 60, y],
              [x + 60, y],
            ],
            { color: '#000000', width: 6 },
            f.hand('rope'),
          );
        },
      };
      const found = yield* drawFindings(() => armFilm([armScene('reaching', 'webgl2'), struck]));
      expect(found.filter((f) => f.scene === 'reaching')).toEqual([]);
      const faces = found.filter((f) => f._tag === 'InkOverFace');
      expect(faces.map((f) => f.scene)).toEqual(['struck']);
      expect(faces[0]?.x).toBeCloseTo(960 + HANGING_FACE[0], 3);
      expect(faces[0]?.y).toBeCloseTo(540 + HANGING_FACE[1], 3);
      expect(faces[0]?.size).toBe(24);
      expect(found.filter((f) => f._tag === 'FrameImpure')).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(images())),
  );

  it.effect('fails, naming it, a rig the film cannot load: never a silent fallback', () =>
    Effect.gen(function* () {
      const arm = armRig('webgl2');
      const lost = { ...arm, source: { ...arm.source, artboard: 'Leg' } };
      const error = yield* Effect.flip(
        drawFindings(() =>
          armFilm([
            { id: 'lost', min: 4, rigs: { arm: lost }, draw: (f) => f.rive('arm', armPose(f.t)) },
          ]),
        ),
      );
      expect(error.message).toBe('rig fixtures/arm/webgl2 has no artboard "Leg"; it has Arm');
    }).pipe(Effect.scoped, Effect.provide(images())),
  );

  it.effect('drawFindings loads a declared puppet and draws it', () => {
    const { read, layer } = blockImages();
    return Effect.gen(function* () {
      const found = yield* drawFindings(() =>
        armFilm([
          {
            id: 'block',
            min: 4,
            timeline: {},
            puppets: { block: BLOCK },
            draw: (f) => f.puppet('block', { numbers: { spine: 10 }, root: [960, 540], scale: 1 }),
          },
        ]),
      );
      expect(read).toEqual(['block/body.png']);
      expect(found).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(Layer.mergeAll(layer, paintingImages().layer)));
  });

  it.effect('finds a painted plate edge that shows in the frame, once per scene and painting', () =>
    Effect.gen(function* () {
      const found = yield* drawFindings(() =>
        paintedFilm(
          { id: 'covered', paintings: { sky: SKY }, draw: (f) => f.painting('sky') },
          {
            id: 'moved',
            paintings: { sky: SKY },
            draw: (f) => {
              f.ctx.save();
              f.ctx.translate(24, 0);
              f.painting('sky');
              f.ctx.restore();
            },
          },
          { id: 'open', paintings: { near: NEAR }, draw: (f) => f.painting('near') },
        ),
      );
      expect(found).toEqual([
        expect.objectContaining({
          _tag: 'PaintingEdge',
          scene: 'moved',
          painting: 'fixtures/sky',
          edges: ['left'],
        }),
      ]);
    }).pipe(Effect.scoped, Effect.provide(images())),
  );

  it.effect('draws a painting scene at its breath peak, and no other scene there', () =>
    Effect.gen(function* () {
      const watched = (scene: Pick<SceneSpec, 'paintings' | 'draw'>) => {
        const seen: Array<number> = [];
        const draw: SceneSpec['draw'] = (f) => {
          seen.push(f.t);
          scene.draw(f);
        };
        return { seen, build: () => paintedFilm({ ...scene, id: 'mid', draw }) };
      };
      const plain = watched({ draw: (f) => f.ctx.fillRect(0, 0, 1, 1) });
      yield* drawFindings(plain.build);
      const painted = watched({ paintings: { sky: SKY }, draw: (f) => f.painting('sky') });
      yield* drawFindings(painted.build);
      expect(plain.seen.some((t) => Math.abs(t - 2) < 1e-9)).toBe(false);
      expect(painted.seen.some((t) => Math.abs(t - 2) < 1e-9)).toBe(true);
      yield* standInDom({ record: false });
      expect(momentCounts(painted.build()).moments).toBe(momentCounts(plain.build()).moments + 1);
    }).pipe(Effect.scoped, Effect.provide(images())),
  );

  it.effect('a painting the drawing does not name is a finding naming it', () =>
    Effect.gen(function* () {
      const found = yield* drawFindings(() =>
        paintedFilm({
          id: 'stray',
          paintings: { sky: SKY },
          draw: (f) => f.painting('nope'),
        }),
      );
      expect(found.some((f) => f._tag === 'DrawThrew' && f.why.includes('"nope"'))).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(images())),
  );
});
