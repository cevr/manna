import { Option } from 'effect';
import type { PoseOf, RiveEngine, RivePropSpec } from '../rive.ts';
import { type SceneSpec, createFilm, drawing } from '../film.ts';
import armRiv from '../../rive/fixtures/arm/build/arm.riv' with { type: 'file' };

/** The arm, drawn by `engine`. */
export const armRig = (
  engine: RiveEngine,
): RivePropSpec<'idle' | 'reach' | 'boil', 'lift' | 'reach'> => ({
  source: {
    riv: armRiv,
    artboard: 'Arm',
    timelines: ['idle', 'reach', 'boil'],
    numbers: ['lift', 'reach'],
  },
  engine,
  key: `fixtures/arm/${engine}`,
  origin: [100, 100],
  face: { node: 'face', height: 24 },
});

/** Where the face stands, in our units from the origin, when the arm hangs at rest with no reach. */
export const HANGING_FACE = [40 - 100, 160 - 100] as const;

/**
 * The pose at scene time `t`: the reach played over two seconds and the
 * lift swung, with the reach's strength off for the first half second and
 * the timeline left at rest (mix 0) over the last, so frames that differ only
 * in what was drawn before them are told apart; the upper piece boiling.
 */
export const armPose = (t: number): ArmPose => ({
  timelines: [
    ['idle', t % 1],
    ['reach', t % 2, Number(t < 1.5)],
    ['boil', t % 1],
  ],
  numbers: Option.match(
    Option.liftPredicate(t, (s) => s < 0.5),
    {
      onSome: () => ({ reach: 0 }),
      onNone: () => ({ reach: 0.8, lift: 120 + 40 * Math.sin(t * 3) }),
    },
  ),
});

/** A pose of the arm. */
export type ArmPose = PoseOf<ReturnType<typeof armRig>>;

/** A fixture film of `scenes`, four seconds each, at 1920 × 1080. */
export const armFilm = (scenes: ReadonlyArray<SceneSpec>) =>
  createFilm({
    fps: 30,
    title: 'arm',
    paper: { base: '#ffffff', tone: '#000000', seed: 1 },
    shade: '#000000',
    scenes,
    captions: { font: '38px x', color: '#000000', plate: '#ffffff' },
  });

/** The arm drawn by `engine`, posed by `armPose`, at the frame's centre, twice its size. */
export const armScene = (id: string, engine: RiveEngine): SceneSpec => ({
  id,
  min: 4,
  ...drawing({
    timeline: {},
    rigs: { arm: armRig(engine) },
    draw: (f) => {
      f.ctx.save();
      f.ctx.translate(f.w / 2, f.h / 2);
      f.ctx.scale(2, 2);
      f.rive('arm', armPose(f.t));
      f.ctx.restore();
    },
  }),
});
