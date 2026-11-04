import type { PaintingSpec } from '@manna/film/canvas';
import { Option } from 'effect';
import type { CameraKey, Layer, Light, Plate, PlateKey } from '../../../library/storybook/shot.ts';

/** Where the film's plates lie, relative to apps/animations: each plate's file is its painting's key too. */
const PLATES = 'src/films/in-its-order/plates';

/** A plate of the film at rest: its painting as declared (`plates/`), placed where the painting's `at` puts it, `scale` times its size about that corner. */
export const plateOf = (
  name: string,
  spec: PaintingSpec,
  more: Partial<Pick<Plate, 'moves' | 'reveal'>> & {
    readonly at?: readonly [number, number];
    readonly scale?: number;
  } = {},
): Plate => {
  const [x, y] = more.at ?? spec.at ?? [0, 0];
  const s = more.scale ?? 1;
  return {
    _tag: 'Plate',
    file: `${PLATES}/${name}`,
    testArt: false,
    place: { x, y, width: spec.size[0] * s, height: spec.size[1] * s },
    painting: spec,
    ...Option.match(Option.fromUndefinedOr(more.moves), {
      onNone: () => ({}),
      onSome: (moves) => ({ moves }),
    }),
    ...Option.match(Option.fromUndefinedOr(more.reveal), {
      onNone: () => ({}),
      onSome: (reveal) => ({ reveal }),
    }),
  };
};

/** A plate whose point `on` (its own px) is laid at layer point `at`, `scale` times its size. */
export const plateOn = (
  name: string,
  spec: PaintingSpec,
  on: readonly [number, number],
  at: readonly [number, number],
  scale: number,
  more: Partial<Pick<Plate, 'moves' | 'reveal'>> = {},
): Plate =>
  plateOf(name, spec, { ...more, at: [at[0] - on[0] * scale, at[1] - on[1] * scale], scale });

/** A key of a moving plate: at rest but for the fields given. */
export const key = (k: Partial<PlateKey>): PlateKey => ({
  x: 0,
  y: 0,
  sx: 1,
  sy: 1,
  alpha: 1,
  ...k,
});

/** A camera key at `t` s. */
export const cam = (t: number, x: number, y: number, zoom: number): CameraKey => ({
  t,
  x,
  y,
  zoom,
});

/** A layer: its name, depth and items, unblurred. */
export const layer = (name: string, z: number, items: Layer['items']): Layer => ({
  name,
  z,
  blur: 0,
  items,
});

/** The courtyard's light, from take 5: a warm tint and a violet shade, each a tenth. */
export const COURTYARD: Light = {
  tint: { colour: '#ffd79a', amount: 0.1 },
  shade: { colour: '#5b4a8c', amount: 0.1 },
};

/** The parchment's light: a warmer, softer tint and a violet shade at least as saturated (CRAFT rule 12). */
export const PARCHMENT: Light = {
  tint: { colour: '#ffd2a0', amount: 0.08 },
  shade: { colour: '#7f6bb3', amount: 0.1 },
};
