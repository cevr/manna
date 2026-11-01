// The feast's courtyard, painted to the kept panel `title.start.2` in the
// panel's own pixels (1536 x 1024): the teal sky, the small dawn light on the
// green hill with the gold path rising to it, the violet ridges, the sand
// town with its cypresses, the olive tree at the left, the pale building with
// its cream awning at the right, the pergola with its garlands and cream
// lanterns, the low wall, the floor and the long table of plant food. Each
// plane is its own function, so a scene moves them apart (`PLANES`); `title`
// and `cold` share it. `PANEL` maps the panel's pixels onto the 1920 frame.

import {
  type Hand,
  type Pt,
  ellipseShape,
  glow,
  mix,
  piece,
  rectShape,
  sky,
  stroke,
} from '@manna/film/canvas';
import { palette as P } from '../palette.ts';

/** The panel's pixels on the frame: frame = (panel - [0, y]) x scale; the panel's bottom strip falls off the frame. */
export const PANEL = { scale: 1.25, y: 80 } as const;

/** How far each plane stands, as a camera's divisor: a far plane moves less in a pull. */
export const PLANES = { sky: 12, distance: 5, near: 2, guests: 1.15, table: 1 } as const;

/** The scene's hands by key (`f.hand`). */
type Hands = (key: string) => Hand;

// The far ridges are pale violet in the haze, as the panel's are.
const VIOLET = mix(mix(P.indigo, P.duskTop, 0.45), P.tealLow, 0.45);
const VIOLET_DEEP = mix(mix(P.indigo, P.duskTop, 0.3), P.tealLow, 0.3);
const SHADE = mix(P.boardDeep, P.indigo, 0.4);
// The courtyard's stone is pale sand, the town's colour, not the chipboard brown.
const SAND = mix(P.linen, P.boardLight, 0.35);
const STONE = mix(P.cream, P.linen, 0.5);

/** The dawn light on the hill: the point the gold path rises to (panel px). */
export const DAWN: Pt = [790, 340];

/** The gold path from the hill's foot to the dawn light (panel px). */
const PATH_FOOT: Pt = [700, 445];
const PATH: ReadonlyArray<Pt> = [PATH_FOOT, [736, 418], [742, 392], [770, 366], DAWN];

const scenery = (
  ctx: CanvasRenderingContext2D,
  shape: ReadonlyArray<Pt>,
  color: string,
  hand: Hand,
  shadow = 0.15,
) =>
  piece(
    ctx,
    shape,
    { role: 'scenery', kind: 'torn', torn: 4, shadow, color, outline: P.outline },
    hand,
  );

/** The sky, the plane farthest back: teal at the top to pale green at the hills. */
export const courtyardSky = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  ctx.scale(1, 520 / 1024);
  sky(ctx, 1536, 1024, [
    [0, P.tealTop],
    [0.55, P.tealMid],
    [1, P.tealLow],
  ]);
  ctx.restore();
};

/**
 * The distance: the dawn light, the green hill, the violet ridges, the town
 * and its cypresses. `path` draws the gold path on, 0..1.
 */
export const courtyardDistance = (ctx: CanvasRenderingContext2D, hand: Hands, path: number) => {
  glow(ctx, DAWN[0], DAWN[1], 170, P.gold, 0.55);
  // The violet ridges behind the hill.
  scenery(
    ctx,
    [
      [0, 450],
      [0, 392],
      [210, 372],
      [430, 396],
      [600, 380],
      [1000, 384],
      [1250, 368],
      [1536, 392],
      [1536, 450],
    ],
    VIOLET,
    hand('ridge-far'),
  );
  scenery(
    ctx,
    [
      [0, 460],
      [0, 420],
      [260, 410],
      [520, 430],
      [1080, 425],
      [1340, 404],
      [1536, 424],
      [1536, 460],
    ],
    VIOLET_DEEP,
    hand('ridge-near'),
  );
  // The green hill under the dawn.
  scenery(
    ctx,
    [
      [560, 470],
      [640, 410],
      [720, 362],
      [790, 340],
      [880, 360],
      [960, 408],
      [1040, 470],
    ],
    P.leaf,
    hand('hill'),
  );
  glow(ctx, DAWN[0], DAWN[1], 46, P.cream, 0.9);
  stroke(
    ctx,
    [...PATH],
    { color: P.gold, width: 9, progress: path, taper: 0.2, boil: 'none' },
    hand('path'),
  );
  if (path > 0) glow(ctx, PATH_FOOT[0], PATH_FOOT[1], 60, P.gold, 0.4 * path);
  // The sand town, blocks stepping down the slope.
  const houses: ReadonlyArray<readonly [number, number, number, number]> = [
    [120, 470, 150, 170],
    [300, 440, 120, 200],
    [430, 470, 110, 170],
    [1040, 450, 130, 190],
    [1190, 430, 110, 210],
    [1330, 470, 150, 170],
  ];
  houses.forEach(([x, y, w, hgt], i) => {
    scenery(ctx, rectShape(x, y, w, hgt), i % 2 === 0 ? P.linen : P.boardLight, hand(`house-${i}`));
    scenery(
      ctx,
      rectShape(x + w * 0.3, y + hgt * 0.35, w * 0.16, hgt * 0.18),
      P.boardShade,
      hand(`window-${i}`),
      0,
    );
  });
  // The cypresses, dark and tall among the houses.
  [270, 410, 1015, 1300].forEach((x, i) =>
    scenery(
      ctx,
      [
        [x, 640],
        [x - 22, 520],
        [x - 14, 440],
        [x, 380],
        [x + 14, 440],
        [x + 22, 520],
      ],
      P.leafShade,
      hand(`cypress-${i}`),
    ),
  );
};

/**
 * The near plane: the olive tree, the pale building with its awning, the
 * pergola with its garlands and lanterns, the low wall and the floor.
 */
export const courtyardNear = (ctx: CanvasRenderingContext2D, hand: Hands) => {
  // The floor, from the wall's foot down.
  scenery(ctx, rectShape(-40, 740, 1616, 340), STONE, hand('floor'), 0);
  // The olive tree at the left.
  scenery(
    ctx,
    [
      [60, 760],
      [78, 560],
      [70, 470],
      [96, 470],
      [104, 560],
      [122, 760],
    ],
    P.camel,
    hand('olive-trunk'),
  );
  scenery(ctx, ellipseShape(90, 420, 150, 95), P.olive, hand('olive-crown'));
  scenery(ctx, ellipseShape(40, 470, 90, 60), P.olive, hand('olive-crown-2'));
  // The pale building and its cream awning at the right.
  scenery(ctx, rectShape(1300, 300, 260, 460), P.linen, hand('building'));
  scenery(ctx, rectShape(1360, 520, 90, 240), P.boardShade, hand('door'));
  scenery(
    ctx,
    [
      [1270, 440],
      [1560, 420],
      [1560, 480],
      [1290, 500],
    ],
    P.cream,
    hand('awning'),
  );
  // The low wall across the courtyard.
  scenery(ctx, rectShape(-40, 600, 1616, 160), SAND, hand('wall'));
  scenery(ctx, rectShape(-40, 596, 1616, 20), STONE, hand('wall-cap'), 0);
  // The pergola: four posts and the beam.
  [55, 515, 1000, 1275].forEach((x, i) =>
    scenery(ctx, rectShape(x - 14, 450, 28, 380), P.boardShade, hand(`post-${i}`)),
  );
  scenery(ctx, rectShape(-40, 438, 1616, 26), P.boardShade, hand('beam'));
  // The garlands sag between the posts, each with its cream lantern.
  const spans: ReadonlyArray<readonly [number, number]> = [
    [55, 515],
    [515, 1000],
    [1000, 1275],
  ];
  spans.forEach(([a, b], i) => {
    const mid = (a + b) / 2;
    stroke(
      ctx,
      [
        [a, 462],
        [(a + mid) / 2, 498],
        [mid, 512],
        [(mid + b) / 2, 498],
        [b, 462],
      ],
      { color: P.leafShade, width: 10, boil: 'none' },
      hand(`garland-${i}`),
    );
    [0.3, 0.5, 0.7].forEach((k, j) => {
      const x = a + (b - a) * k;
      const y = 470 + 40 * Math.sin(Math.PI * k);
      stroke(
        ctx,
        [
          [x, y],
          [x, y + 30],
        ],
        { color: P.outline, width: 2, boil: 'none' },
        hand(`cord-${i}-${j}`),
      );
      scenery(ctx, ellipseShape(x, y + 50, 16, 24), P.cream, hand(`lantern-${i}-${j}`));
    });
  });
};

/** The long table of plant food at the front, with the shade under it that hides its legs. */
export const courtyardTable = (ctx: CanvasRenderingContext2D, hand: Hands) => {
  scenery(ctx, rectShape(140, 900, 1440, 80), SHADE, hand('table-shade'), 0);
  [200, 820, 1460].forEach((x, i) =>
    scenery(ctx, rectShape(x, 900, 22, 60), P.boardShade, hand(`leg-${i}`)),
  );
  scenery(ctx, rectShape(140, 850, 1440, 55), P.walnut, hand('table-front'));
  scenery(ctx, rectShape(140, 830, 1440, 22), P.linen, hand('table-top'));
  // The plant food: bread, grapes, figs and greens along the top.
  const food: ReadonlyArray<readonly [number, string, number, number]> = [
    [260, P.corn, 44, 18],
    [380, P.olive, 30, 16],
    [520, P.leaf, 40, 14],
    [660, P.corn, 50, 20],
    [880, P.indigo, 30, 16],
    [1040, P.leaf, 44, 14],
    [1180, P.corn, 46, 18],
    [1330, P.olive, 32, 16],
    [1460, P.leaf, 40, 14],
  ];
  food.forEach(([x, color, rx, ry], i) =>
    scenery(ctx, ellipseShape(x, 828, rx, ry), color, hand(`food-${i}`), 0.2),
  );
};
