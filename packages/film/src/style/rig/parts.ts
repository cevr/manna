import { INK_NUMBER } from '../../canvas/rive.ts';
import { rng } from '../../core/random.ts';
import { type Direction, LIGHT, inkOf, ramps as R } from '../house.ts';
import type { Crease } from '../paper.ts';
import { type Element, argb, el, num } from './rml.ts';

export type Pt = readonly [number, number];

export const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const ellipse = (cx: number, cy: number, rx: number, ry: number, n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const;
  });

export const boxOf = (pts: ReadonlyArray<Pt>): Box => ({
  x0: Math.min(...pts.map(([x]) => x)),
  y0: Math.min(...pts.map(([, y]) => y)),
  x1: Math.max(...pts.map(([x]) => x)),
  y1: Math.max(...pts.map(([, y]) => y)),
});

interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export const creaseOf = (box: Box, crease: Crease = {}) => {
  const toward = crease.toward ?? LIGHT.toward;
  const dx = Math.cos(toward);
  const dy = Math.sin(toward);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const reach = (Math.abs(box.x1 - box.x0) * dx + Math.abs(box.y1 - box.y0) * dy) / 2;
  return {
    start: [cx - dx * reach, cy - dy * reach] as const,
    end: [cx + dx * reach, cy + dy * reach] as const,
    at: crease.at ?? LIGHT.crease,
  };
};

const solid = (hex: string, alpha = 1) => el('SolidColor', { colorValue: argb(hex, alpha) });

const creased = (color: string, shade: string, box: Box, crease: Crease = {}): Element => {
  const { start, end, at } = creaseOf(box, crease);
  const soft = crease.soft ?? 0;
  const [from, to] = soft > 0 ? [at - soft / 2, at + soft / 2] : [at, at + 0.002];
  return el('LinearGradient', { startX: start[0], startY: start[1], endX: end[0], endY: end[1] }, [
    el('GradientStop', { colorValue: argb(color), position: 0 }),
    el('GradientStop', { colorValue: argb(color), position: Math.max(0, from) }),
    el('GradientStop', { colorValue: argb(shade), position: Math.min(1, to) }),
    el('GradientStop', { colorValue: argb(shade), position: 1 }),
  ]);
};

interface Surface {
  readonly key: string;
  readonly shade: string;
}

export interface PieceLook {
  readonly color: string;
  readonly shade?: string;
  readonly light: string;
  readonly ink?: keyof typeof INK | 'none';
  readonly shadow?: number;
  readonly cast?: string;
  readonly ground?: 'host';
  readonly over?: { readonly surfaces: ReadonlyArray<Surface>; readonly behind: string };
  readonly crease?: Crease;
  readonly rim?: number;
  readonly tones?: ReadonlyArray<Tone>;
}

interface Tone {
  readonly pts: ReadonlyArray<Pt>;
  readonly color: string;
  readonly alpha?: number;
  readonly soft?: boolean;
  readonly cubic?: true;
}

const FIGURE: PieceLook = {
  color: R.figure.base,
  shade: R.figure.shade,
  light: R.figure.light,
};

const CAST = 1.4;

const castAlpha = (lift: number) => Math.min(1, CAST * lift);

const INK = { outer: 5, small: 3.5, trim: 2.5 } as const;

const OUTSIDE = { outer: 6, small: 5 } as const;

const CORE = 1;

const edgeWidths = (d: Direction, weight: keyof typeof INK) => {
  const heavy = d.weight ?? 1;
  if (d.outline === 'line' || (d.outline === 'thick' && weight === 'trim'))
    return { under: 0, centred: INK[weight] * heavy, core: 0 };
  const core = d.outline === 'thick' ? 0 : CORE;
  const showing =
    d.outline === 'edge' ? 0 : (weight === 'trim' ? INK.trim / 2 : OUTSIDE[weight]) * heavy;
  return { under: showing > 0 ? 2 * (showing + core) : 0, centred: 0, core: 2 * core };
};

const silhouetteInk = (d: Direction, weight: keyof typeof INK) => {
  const w = edgeWidths(d, weight);
  return Math.max(w.under - w.core, w.centred);
};

const inkCover = (d: Direction, weight: keyof typeof INK | 'none') => {
  if (weight === 'none') return 0;
  const w = edgeWidths(d, weight);
  return Math.max(w.under, w.centred, w.core) / 2;
};

const edgeOf = (fig: Figure, weight: keyof typeof INK, light: string, cored: boolean) => {
  const d = fig.direction;
  const ink = (thickness: number, floor: number) =>
    el('Stroke', { thickness, join: 'round', cap: 'round', name: 'Ink' }, [
      solid(inkOf(d)),
      ...fig.inkBind(thickness, floor),
    ]);
  const w = edgeWidths(d, weight);
  return {
    under: w.under > 0 ? [ink(w.under, cored ? w.core : 0)] : [],
    over: [
      ...(w.centred > 0 ? [ink(w.centred, 0)] : []),
      ...(w.core > 0
        ? [
            el('Stroke', { thickness: w.core, join: 'round', cap: 'round', name: 'Core' }, [
              solid(light),
            ]),
          ]
        : []),
    ],
  };
};

const LIFT = { x: 3, y: 5, feather: 6 } as const;

const FEATHER_REACH = 1.5;
const AA = 1;

const castShows = (lift: number, cover: number) =>
  lift > 0 && Math.hypot(LIFT.x, LIFT.y) * lift + FEATHER_REACH * LIFT.feather * lift + AA > cover;

const shadowFill = (shade: string, lift: number) =>
  el('Fill', { fillRule: 'clockwise', name: 'Shadow' }, [
    solid(shade, castAlpha(lift)),
    el('Feather', {
      strength: LIFT.feather * lift,
      offsetX: LIFT.x * lift,
      offsetY: LIFT.y * lift,
      name: 'Lift',
    }),
  ]);

const liftOf = (look: PieceLook) => look.shadow ?? 0.35;

const castOf = (d: Direction, look: PieceLook) =>
  castShows(liftOf(look), inkCover(d, look.ink ?? 'outer'));

const paints = (fig: Figure, look: PieceLook, box: Box, inside = false): Element[] => {
  const d = fig.direction;
  const paper = el('Fill', { name: 'Paper' }, [
    look.shade === undefined
      ? solid(look.color)
      : look.crease?.crescent === undefined
        ? creased(look.color, look.shade, box, look.crease)
        : solid(look.shade),
  ]);
  if (inside) return [paper];
  const out: Element[] = [];
  if (castOf(d, look) && look.over === undefined && look.ground !== 'host')
    out.push(shadowFill(look.cast ?? R.paper.shade, liftOf(look)));
  const weight = look.ink ?? 'outer';
  const edge: { under: Element[]; over: Element[] } =
    weight === 'none'
      ? { under: [], over: [] }
      : edgeOf(fig, weight, look.light, look.rim === undefined);
  out.push(...edge.under, paper, ...(look.rim === undefined ? edge.over : []));
  return out;
};

type K = readonly [number, number, ('io' | 'out' | 'in' | 'linear' | 'hold')?];
type Tracks = Readonly<Record<string, Readonly<Record<string, ReadonlyArray<K>>>>>;

type Numbers = Readonly<Record<string, number>>;

export interface Figure {
  readonly name: string;
  readonly direction: Direction;
  readonly stage: number;
  readonly idOf: (name: string) => string;
  readonly bind: (knob: string, key: number) => Element;
  readonly inkBind: (full: number, floor: number) => ReadonlyArray<Element>;
  readonly converters: () => ReadonlyArray<Element>;
  readonly boil: (key: string, pts: ReadonlyArray<Pt>, amp: number) => void;
  readonly boilWhole: (key: string, pts: ReadonlyArray<Pt>, amp: number) => void;
  readonly echo: (key: string, like: string, n: number, shift?: ReadonlyArray<Pt>) => void;
  readonly boilTracks: () => Tracks;
}

const THICKNESS = 47;

export const figure = (
  next: () => string,
  name: string,
  seed: number,
  stage: number,
  direction: Direction,
): Figure => {
  const named = new Map<string, string>();
  const idOf = (key: string) => {
    const have = named.get(key);
    if (have !== undefined) return have;
    const made = next();
    named.set(key, made);
    return made;
  };
  const tracks: Record<string, Record<string, K[]>> = {};
  const r = rng(seed);
  const converters = new Map<string, Element>();
  const inkVia = (full: number, floor: number) => {
    const key = `ink:${num(floor)}:${num(full)}`;
    if (!converters.has(key))
      converters.set(
        key,
        el('DataConverterRangeMapper', {
          minInput: 0,
          maxInput: 1,
          minOutput: floor,
          maxOutput: full,
          name: 'Ink',
          id: idOf(key),
        }),
      );
    return idOf(key);
  };
  return {
    name,
    direction,
    stage,
    idOf,
    bind: (knob, key) =>
      el('DataBindContext', {
        sourcePathIds: `${idOf('vm')}-${idOf(`vm:${knob}`)}`,
        propertyKey: key,
      }),
    inkBind: (full, floor) =>
      direction.baked === true
        ? []
        : [
            el('DataBindContext', {
              sourcePathIds: `${idOf('vm')}-${idOf(`vm:${INK_NUMBER}`)}`,
              propertyKey: THICKNESS,
              converterId: inkVia(full, floor),
            }),
          ],
    converters: () => [...converters.values()],
    boil: (key, pts, amp) =>
      pts.forEach((p, i) => {
        const [dx, dy] = [crawl(r, amp), crawl(r, amp)];
        const keys = (c: number, d: (tick: number) => number): K[] =>
          Array.from({ length: BOIL.ticks }, (_, tick) => [tick / BOIL.fps, c + d(tick), 'hold']);
        tracks[`${key}.${i}`] = { x: keys(p[0], dx), y: keys(p[1], dy) };
      }),
    boilWhole: (key, pts, amp) => {
      const [dx, dy] = [crawl(r, amp), crawl(r, amp)];
      const keys = (c: number, d: (tick: number) => number): K[] =>
        Array.from({ length: BOIL.ticks }, (_, tick) => [tick / BOIL.fps, c + d(tick), 'hold']);
      pts.forEach((p, i) => {
        tracks[`${key}.${i}`] = { x: keys(p[0], dx), y: keys(p[1], dy) };
      });
    },
    echo: (key, like, n, shift) => {
      for (let i = 0; i < n; i++) {
        const track = tracks[`${like}.${i}`];
        const [dx, dy] = shift?.[i] ?? [0, 0];
        if (track !== undefined)
          tracks[`${key}.${i}`] =
            dx === 0 && dy === 0
              ? track
              : {
                  x: (track['x'] ?? []).map(([t, v, e]): K => [t, v + dx, e]),
                  y: (track['y'] ?? []).map(([t, v, e]): K => [t, v + dy, e]),
                };
      }
    },
    boilTracks: () => tracks,
  };
};

const BOIL = { fps: 12, seconds: 4, ticks: 48 } as const;

const CRAWL = [
  [1, 0.58],
  [2, 0.25],
  [3, 0.17],
] as const;

const crawl = (r: () => number, amp: number) => {
  const phases = CRAWL.map(() => r() * 2 * Math.PI);
  return (tick: number) =>
    CRAWL.reduce(
      (sum, [cycles, share], k) =>
        sum + amp * share * Math.sin((2 * Math.PI * cycles * tick) / BOIL.ticks + (phases[k] ?? 0)),
      0,
    );
};

export const boilTime = (tick: number) => (tick % BOIL.ticks) / BOIL.fps + 1e-4;

const vertex = (fig: Figure, name: string, p: Pt, around: readonly [Pt, Pt], tension: number) => {
  const dx = around[1][0] - around[0][0];
  const dy = around[1][1] - around[0][1];
  return el('CubicMirroredVertex', {
    x: p[0],
    y: p[1],
    rotation: Math.atan2(dy, dx),
    distance: (tension * Math.hypot(dx, dy)) / 6,
    name,
    id: fig.idOf(name),
  });
};

const smoothPath = (fig: Figure, key: string, pts: ReadonlyArray<Pt>, closed = true): Element => {
  const n = pts.length;
  const vertices = pts.map((p, i) => {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)] ?? p;
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)] ?? p;
    const tension = closed || (i > 0 && i < n - 1) ? 1 : 0;
    return vertex(fig, `${key}.${i}`, p, [prev, next], tension);
  });
  return el('PointsPath', { isClosed: closed, isClockwise: true, name: 'Path' }, vertices);
};

const handle = (from: Pt, to: Pt) => {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const distance = Math.hypot(dx, dy);
  return { rotation: distance === 0 ? 0 : Math.atan2(dy, dx), distance };
};

const cubicPath = (fig: Figure, key: string, chain: ReadonlyArray<Pt>): Element => {
  const n = Math.floor(chain.length / 3);
  const vertices = Array.from({ length: n }, (_, j) => {
    const a = chain[3 * j] ?? [0, 0];
    const into = handle(a, chain[(3 * j - 1 + 3 * n) % (3 * n)] ?? a);
    const out = handle(a, chain[3 * j + 1] ?? a);
    const name = `${key}.${j}`;
    return el('CubicDetachedVertex', {
      x: a[0],
      y: a[1],
      inRotation: into.rotation,
      inDistance: into.distance,
      outRotation: out.rotation,
      outDistance: out.distance,
      name,
      id: fig.idOf(name),
    });
  });
  return el('PointsPath', { isClosed: true, isClockwise: true, name: 'Path' }, vertices);
};

const pathOf = (fig: Figure, key: string, pts: ReadonlyArray<Pt>, cubic?: true) =>
  cubic === true ? cubicPath(fig, key, pts) : smoothPath(fig, key, pts);

const vertexPts = (pts: ReadonlyArray<Pt>, cubic?: true): ReadonlyArray<Pt> =>
  cubic === true ? pts.filter((_, i) => i % 3 === 0) : pts;

export const piece = (
  fig: Figure,
  key: string,
  pts: ReadonlyArray<Pt>,
  look: PieceLook,
  opts: { readonly boil?: number; readonly cubic?: true } = {},
): Element => paperOf(fig, { key, pts, look, ...opts }, false);

const paperOf = (fig: Figure, part: Part, inside: boolean): Element => {
  const { key, pts, look } = part;
  const boil = part.boil ?? 0.9;
  if (boil > 0 && part.crawl === 'whole') fig.boilWhole(key, vertexPts(pts, part.cubic), boil);
  else if (boil > 0) fig.boil(key, vertexPts(pts, part.cubic), boil);
  const box = boxOf(pts);
  const shape = el('Shape', { name: key, id: fig.idOf(key) }, [
    pathOf(fig, key, pts, part.cubic),
    ...paints(fig, look, box, inside),
  ]);
  const crescent = look.shade === undefined ? undefined : look.crease?.crescent;
  const onTop = [
    ...(look.rim === undefined ? [] : [rimOf(fig, part, look.rim, box, boil > 0)]),
    ...(look.tones ?? []).map((t, i) => toneOf(fig, key, t, i)).reverse(),
    ...(crescent === undefined ? [] : [litOf(fig, part, crescent, box, boil > 0)]),
  ];
  const cast = !inside && look.over !== undefined && castOf(fig.direction, look);
  if (onTop.length === 0 && !cast) return shape;
  return el('Node', { name: `${key}Piece` }, [
    ...onTop,
    shape,
    ...(cast && look.over !== undefined ? casts(fig, part, look.over, boil > 0) : []),
  ]);
};

const turning = (pts: ReadonlyArray<Pt>) =>
  pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length] ?? p;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);

const inset = (pts: ReadonlyArray<Pt>, by: number): Pt[] => {
  const n = pts.length;
  const side = turning(pts) > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n] ?? p;
    const next = pts[(i + 1) % n] ?? p;
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    return [p[0] - (side * ty * by) / len, p[1] + (side * tx * by) / len];
  });
};

const insetChain = (chain: ReadonlyArray<Pt>, by: number): Pt[] => {
  const anchors = chain.filter((_, i) => i % 3 === 0);
  const moved = inset(anchors, by);
  return chain.map((p, i) => {
    const j = ((Math.floor((i + 1) / 3) % anchors.length) + anchors.length) % anchors.length;
    const a = anchors[j] ?? p;
    const m = moved[j] ?? a;
    return [p[0] + m[0] - a[0], p[1] + m[1] - a[1]];
  });
};

const RIM_HOLD = 0.6;

const rimOf = (fig: Figure, part: Part, width: number, box: Box, boils: boolean): Element => {
  const name = `${part.key}Rim`;
  const pts = part.cubic === true ? insetChain(part.pts, width / 2) : inset(part.pts, width / 2);
  if (boils) {
    const [from, to] = [vertexPts(part.pts, part.cubic), vertexPts(pts, part.cubic)];
    fig.echo(
      name,
      part.key,
      to.length,
      to.map((p, i): Pt => [p[0] - (from[i]?.[0] ?? 0), p[1] - (from[i]?.[1] ?? 0)]),
    );
  }
  const { start, end, at } = creaseOf(box, part.look.crease);
  return el('Shape', { name, id: fig.idOf(name) }, [
    pathOf(fig, name, pts, part.cubic),
    el('Stroke', { thickness: width, join: 'round', cap: 'round', name: 'Rim' }, [
      el('LinearGradient', { startX: start[0], startY: start[1], endX: end[0], endY: end[1] }, [
        el('GradientStop', { colorValue: argb(part.look.light), position: 0 }),
        el('GradientStop', { colorValue: argb(part.look.light), position: at * RIM_HOLD }),
        el('GradientStop', { colorValue: argb(part.look.light, 0), position: at }),
        el('GradientStop', { colorValue: argb(part.look.light, 0), position: 1 }),
      ]),
    ]),
  ]);
};

const litOf = (fig: Figure, part: Part, share: number, box: Box, boils: boolean): Element => {
  const name = `${part.key}Lit`;
  const toward = part.look.crease?.toward ?? LIGHT.toward;
  const by: Pt = [
    (-Math.cos(toward) * share * (box.x1 - box.x0)) / 2,
    (-Math.sin(toward) * share * (box.y1 - box.y0)) / 2,
  ];
  const pts = part.pts.map(([x, y]): Pt => [x + by[0], y + by[1]]);
  const n = vertexPts(pts, part.cubic).length;
  if (boils)
    fig.echo(
      name,
      part.key,
      n,
      Array.from({ length: n }, () => by),
    );
  return el('Shape', { name, id: fig.idOf(name) }, [
    pathOf(fig, name, pts, part.cubic),
    el('Fill', { name: 'Lit' }, [solid(part.look.color)]),
    el('ClippingShape', { sourceId: fig.idOf(part.key), name: 'Clip' }),
  ]);
};

const toneOf = (fig: Figure, key: string, tone: Tone, i: number): Element => {
  const name = `${key}Tone${i}`;
  const box = boxOf(tone.pts);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const alpha = tone.alpha ?? 1;
  const paint = tone.soft
    ? el(
        'RadialGradient',
        { startX: cx, startY: cy, endX: cx + Math.max(box.x1 - cx, box.y1 - cy), endY: cy },
        [
          el('GradientStop', { colorValue: argb(tone.color, alpha), position: 0 }),
          el('GradientStop', { colorValue: argb(tone.color, alpha * 0.6), position: 0.55 }),
          el('GradientStop', { colorValue: argb(tone.color, 0), position: 1 }),
        ],
      )
    : solid(tone.color, alpha);
  return el('Shape', { name, id: fig.idOf(name) }, [
    pathOf(fig, name, tone.pts, tone.cubic),
    el('Fill', { name: 'Tone' }, [paint]),
    el('ClippingShape', { sourceId: fig.idOf(key), name: 'Clip' }),
  ]);
};

export interface Part {
  readonly key: string;
  readonly pts: ReadonlyArray<Pt>;
  readonly look: PieceLook;
  readonly boil?: number;
  readonly cubic?: true;
  readonly crawl?: 'whole';
  readonly frames?: ReadonlyArray<Frame>;
}

interface Frame {
  readonly at: Pt;
  readonly knob: string;
  readonly name: string;
}

const framed = (fig: Figure, part: Part, role: string, inner: Element): Element =>
  (part.frames ?? []).reduceRight<Element>((held, f) => {
    const name = `${part.key}${f.name}${role}`;
    return el('Node', { x: f.at[0], y: f.at[1], name, id: fig.idOf(name) }, [
      fig.bind(f.knob, KEY.rotation),
      el('Node', { x: -f.at[0], y: -f.at[1], name: `${name}At` }, [held]),
    ]);
  }, inner);

const isPart = (layer: Part | Element): layer is Part => 'pts' in layer;

export const silhouette = (
  fig: Figure,
  key: string,
  layers: ReadonlyArray<Part | Element>,
  opts: {
    readonly ink?: keyof typeof INK;
    readonly shadow?: number;
    readonly behind?: string;
  } = {},
): Element => {
  const parts = layers.filter(isPart);
  const drawn = layers.map((l) => (isPart(l) ? framed(fig, l, 'Paper', paperOf(fig, l, true)) : l));
  const name = `${key}Ink`;
  const paths = parts.map((p) => {
    const at = `${name}${p.key}`;
    if ((p.boil ?? 0.9) > 0) fig.echo(at, p.key, vertexPts(p.pts, p.cubic).length);
    return framed(fig, p, `${key}Ink`, pathOf(fig, at, p.pts, p.cubic));
  });
  const d = fig.direction;
  const weight = opts.ink ?? 'outer';
  const lift = opts.shadow ?? 0.35;
  const look = parts[0]?.look;
  const shadow =
    look !== undefined && castShows(lift, inkCover(d, weight)) && look.ground !== 'host'
      ? [shadowFill(look.cast ?? R.paper.shade, lift)]
      : [];
  const ink = el('Shape', { name, id: fig.idOf(name) }, [
    ...paths,
    ...shadow,
    el(
      'Stroke',
      { thickness: silhouetteInk(d, weight), join: 'round', cap: 'round', name: 'Ink' },
      [solid(inkOf(d)), ...fig.inkBind(silhouetteInk(d, weight), 0)],
    ),
    ...(opts.behind === undefined ? [] : [behindOf(fig, name, opts.behind)]),
  ]);
  return el('Node', { name: key, id: fig.idOf(key) }, [...drawn, ink]);
};

const behindOf = (fig: Figure, name: string, target: string): Element =>
  el(
    'DrawRules',
    { drawTargetId: fig.idOf(`${name}:at`), name: 'Rules', id: fig.idOf(`${name}:rules`) },
    [
      el('DrawTarget', {
        drawableId: fig.idOf(target),
        placementValue: 'after',
        name: 'At',
        id: fig.idOf(`${name}:at`),
      }),
    ],
  );

const casts = (
  fig: Figure,
  part: Part,
  over: NonNullable<PieceLook['over']>,
  boils: boolean,
): Element[] => {
  const { key, pts, look } = part;
  const lift = look.shadow ?? 0.35;
  const cast = (
    name: string,
    shade: string,
    target: { readonly key: string; readonly placement: 'before' | 'after' },
    clip?: string,
  ) => {
    if (boils) fig.echo(name, key, vertexPts(pts, part.cubic).length);
    return el('Shape', { name, id: fig.idOf(name) }, [
      pathOf(fig, name, pts, part.cubic),
      shadowFill(shade, lift),
      ...(clip === undefined
        ? []
        : [el('ClippingShape', { sourceId: fig.idOf(clip), name: 'Clip' })]),
      el(
        'DrawRules',
        { drawTargetId: fig.idOf(`${name}:at`), name: 'Rules', id: fig.idOf(`${name}:rules`) },
        [
          el('DrawTarget', {
            drawableId: fig.idOf(target.key),
            placementValue: target.placement,
            name: 'At',
            id: fig.idOf(`${name}:at`),
          }),
        ],
      ),
    ]);
  };
  return [
    ...over.surfaces.map((s) =>
      cast(`${key}CastOn${s.key}`, s.shade, { key: s.key, placement: 'before' }, s.key),
    ),
    cast(`${key}Cast`, look.cast ?? R.paper.shade, { key: over.behind, placement: 'after' }),
  ];
};

const handOutline = (r: number): Pt[] => ellipse(0, 0, r, r, 12);

const HAND_LIFT = 0.3;

export const hand = (fig: Figure, key: string, r: number, look: PieceLook = FIGURE): Element =>
  piece(fig, key, handOutline(r), { ink: 'small', shadow: HAND_LIFT, ...look }, { boil: 0.6 });

export const reachAbout = (shoulder: Pt, rest: Pt, to: Pt, reach: number): Pt => {
  const k = Math.max(0, Math.min(1, reach));
  const a0 = Math.atan2(rest[1] - shoulder[1], rest[0] - shoulder[0]);
  let a1 = Math.atan2(to[1] - shoulder[1], to[0] - shoulder[0]);
  if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
  if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
  const r0 = Math.hypot(rest[0] - shoulder[0], rest[1] - shoulder[1]);
  const r1 = Math.hypot(to[0] - shoulder[0], to[1] - shoulder[1]);
  const a = a0 + (a1 - a0) * k;
  const r = r0 + (r1 - r0) * k;
  return [shoulder[0] + Math.cos(a) * r, shoulder[1] + Math.sin(a) * r];
};

export const FACE = {
  gazeX: 0,
  gazeY: 0,
  follow: 0,
  eyes: 1,
  eyeW: 1,
  browY: 0,
  browTilt: 0,
  mouth: 0,
  mouthLine: 1,
  mouthOpen: 0,
} as const;
export type FaceKnob = keyof typeof FACE;

const KIT: FaceShape = {
  eyes: [-12, 13],
  eyeY: -7,
  eye: [6.8, 8.8],
  roam: 3,
  turn: 4,
  turnPull: 0.05,
  brows: [-13, 13],
  browY: -21,
  browHalf: 8,
  brow: 3.4,
  mouth: [1, 15],
  mouthHalf: 6.5,
  mouthLine: 3,
};

interface FaceShape {
  readonly eyes: readonly [number, number];
  readonly eyeY: number;
  readonly eye: readonly [number, number];
  readonly roam: number;
  readonly turn: number;
  readonly turnPull: number;
  readonly brows: readonly [number, number];
  readonly browY: number;
  readonly browHalf: number;
  readonly brow: number;
  readonly mouth: readonly [number, number];
  readonly mouthHalf: number;
  readonly mouthLine: number;
}

export const kitMarks = (shape: Partial<FaceShape> = {}): FaceShape => ({ ...KIT, ...shape });

const KEY = {
  x: 13,
  y: 14,
  rotation: 15,
  scaleX: 16,
  scaleY: 17,
  opacity: 18,
  vertexY: 25,
} as const;

const brow = (fig: Figure, k: FaceShape, side: 'L' | 'R', x: number) =>
  el('Node', { x, y: k.browY, scaleX: side === 'L' ? -1 : 1, name: `brow${side}Side` }, [
    el('Shape', { name: `brow${side}`, id: fig.idOf(`brow${side}`) }, [
      smoothPath(
        fig,
        `brow${side}`,
        [
          [-k.browHalf, 1],
          [0, -0.8],
          [k.browHalf, 1],
        ],
        false,
      ),
      el('Stroke', { thickness: k.brow, cap: 'round', name: 'Ink' }, [
        solid(inkOf(fig.direction)),
        ...fig.inkBind(k.brow, 0),
      ]),
      fig.bind('browTilt', KEY.rotation),
    ]),
  ]);

const ellipsePath = (w: number, h: number) =>
  el('Ellipse', { width: w, height: h, originX: 0.5, originY: 0.5, name: 'Path' });

const eye = (fig: Figure, k: FaceShape, side: 'L' | 'R', x: number, scale: number) =>
  el('Shape', { x, y: k.eyeY, name: `eye${side}`, id: fig.idOf(`eye${side}`) }, [
    ellipsePath(k.eye[0], k.eye[1]),
    el('Fill', { name: 'Ink' }, [solid(inkOf(fig.direction))]),
    el('TranslationConstraint', { targetId: fig.idOf('gaze'), strength: 0.03, name: 'Look' }),
    el('DistanceConstraint', {
      targetId: fig.idOf(`socket${side}`),
      distance: k.roam * scale,
      modeValue: 'closer',
      name: 'Socket',
    }),
    fig.bind('eyes', KEY.scaleY),
    fig.bind('eyeW', KEY.scaleX),
  ]);

const mouth = (fig: Figure, k: FaceShape, extra: ReadonlyArray<ExtraFaceKnob>) =>
  el('Node', { x: k.mouth[0], y: k.mouth[1], name: 'mouth', id: fig.idOf('mouth') }, [
    el('Shape', { scaleX: 0, scaleY: 0, name: 'mouthOh', id: fig.idOf('mouthOh') }, [
      ellipsePath(8, 10.5),
      el('Fill', { name: 'Ink' }, [solid(inkOf(fig.direction))]),
      fig.bind('mouthOpen', KEY.scaleX),
      fig.bind('mouthOpen', KEY.scaleY),
    ]),
    el('Shape', { name: 'mouthLine', id: fig.idOf('mouthLine') }, [
      el('PointsPath', { isClosed: false, isClockwise: true, name: 'Path' }, [
        el('StraightVertex', { x: -k.mouthHalf, y: 0, name: 'mouthL' }),
        el(
          'CubicMirroredVertex',
          { x: 0, y: 0, rotation: 0, distance: k.mouthHalf * 0.55, name: 'mouthMid' },
          [fig.bind('mouth', KEY.vertexY)],
        ),
        el('StraightVertex', { x: k.mouthHalf, y: 0, name: 'mouthR' }),
      ]),
      el('Stroke', { thickness: k.mouthLine, cap: 'round', join: 'round', name: 'Ink' }, [
        solid(inkOf(fig.direction)),
        ...fig.inkBind(k.mouthLine, 0),
      ]),
      fig.bind('mouthLine', KEY.opacity),
      ...(extra.includes('mouthW') ? [fig.bind('mouthW', KEY.scaleX)] : []),
    ]),
  ]);

export const EXTRA_FACE = { wince: 0, glad: 0, marksY: 0, mouthY: 0, mouthW: 1 } as const;

const GLAD_MOUTH = { half: 1.75, lift: 0.12, dip: 0.42 } as const;

const SHUT_EYE = { chevron: 0.3, gladEnds: 0.1, gladMiddle: 0.1 } as const;
export type ExtraFaceKnob = keyof typeof EXTRA_FACE;

const markShape = (
  fig: Figure,
  key: string,
  path: Element,
  thickness: number,
  knob: ExtraFaceKnob,
) =>
  el('Shape', { name: key, id: fig.idOf(key) }, [
    path,
    el('Stroke', { thickness, cap: 'round', join: 'round', name: 'Ink' }, [
      solid(inkOf(fig.direction)),
      ...fig.inkBind(thickness, 0),
    ]),
    fig.bind(knob, KEY.opacity),
  ]);

const straightPath = (pts: ReadonlyArray<Pt>) =>
  el(
    'PointsPath',
    { isClosed: false, isClockwise: true, name: 'Path' },
    pts.map(([x, y], i) => el('StraightVertex', { x, y, name: `p${i}` })),
  );

const extraMarks = (fig: Figure, k: FaceShape, extra: ReadonlyArray<ExtraFaceKnob>): Element[] => {
  const [w, h] = k.eye;
  const sides = [
    ['L', k.eyes[0], 1],
    ['R', k.eyes[1], -1],
  ] as const;
  const marks: Record<ExtraFaceKnob, () => Element[]> = {
    marksY: () => [],
    mouthY: () => [],
    mouthW: () => [],
    wince: () => [
      ...sides.map(([side, x, toward]) =>
        el('Node', { x, y: k.eyeY, name: `wince${side}Side` }, [
          markShape(
            fig,
            `wince${side}`,
            straightPath([
              [-w * toward, -SHUT_EYE.chevron * h],
              [0.8 * w * toward, 0],
              [-w * toward, SHUT_EYE.chevron * h],
            ]),
            k.brow,
            'wince',
          ),
        ]),
      ),
      el('Node', { x: k.mouth[0], y: k.mouth[1], name: 'winceMouthAt' }, [
        markShape(
          fig,
          'winceMouth',
          smoothPath(
            fig,
            'winceMouth',
            [-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((t, i): Pt => [
              t * k.mouthHalf * 1.15,
              (i % 2 === 0 ? 0.5 : -0.5) * k.mouthLine,
            ]),
            false,
          ),
          k.mouthLine,
          'wince',
        ),
      ]),
    ],
    glad: () => [
      el('Node', { x: k.mouth[0], y: k.mouth[1], name: 'gladMouthAt' }, [
        markShape(
          fig,
          'gladMouth',
          smoothPath(
            fig,
            'gladMouth',
            [
              [-GLAD_MOUTH.half * k.mouthHalf, -GLAD_MOUTH.lift * k.mouthHalf],
              [0, GLAD_MOUTH.dip * k.mouthHalf],
              [GLAD_MOUTH.half * k.mouthHalf, -GLAD_MOUTH.lift * k.mouthHalf],
            ],
            false,
          ),
          k.mouthLine,
          'glad',
        ),
      ]),
      ...sides.map(([side, x]) =>
        el('Node', { x, y: k.eyeY, name: `glad${side}Side` }, [
          markShape(
            fig,
            `glad${side}`,
            smoothPath(
              fig,
              `glad${side}`,
              [
                [-1.1 * w, SHUT_EYE.gladEnds * h],
                [0, -SHUT_EYE.gladMiddle * h],
                [1.1 * w, SHUT_EYE.gladEnds * h],
              ],
              false,
            ),
            k.brow,
            'glad',
          ),
        ]),
      ),
    ],
  };
  return extra.flatMap((m) => marks[m]());
};

export const faceKit = (
  fig: Figure,
  at: { x: number; y: number; scale?: number },
  shape: Partial<FaceShape> = {},
  extra: ReadonlyArray<ExtraFaceKnob> = [],
) => {
  const scale = at.scale ?? 1;
  const k = kitMarks(shape);
  const slid = (knob: 'marksY' | 'mouthY', name: string, inner: ReadonlyArray<Element>) =>
    extra.includes(knob)
      ? [el('Node', { name, id: fig.idOf(name) }, [fig.bind(knob, KEY.y), ...inner])]
      : inner;
  return el(
    'Node',
    { x: at.x, y: at.y, scaleX: at.scale, scaleY: at.scale, name: 'face', id: fig.idOf('face') },
    slid('marksY', 'marksSlide', [
      el('Node', { name: 'features', id: fig.idOf('features') }, [
        el('TranslationConstraint', {
          targetId: fig.idOf('gaze'),
          strength: k.turnPull,
          name: 'Turn',
        }),
        el('DistanceConstraint', {
          targetId: fig.idOf('faceRest'),
          distance: k.turn * scale,
          modeValue: 'closer',
          name: 'Within',
        }),
        el('Node', { name: 'brows', id: fig.idOf('brows') }, [
          fig.bind('browY', KEY.y),
          brow(fig, k, 'L', k.brows[0]),
          brow(fig, k, 'R', k.brows[1]),
        ]),
        eye(fig, k, 'L', k.eyes[0], scale),
        eye(fig, k, 'R', k.eyes[1], scale),
        ...slid('mouthY', 'mouthSlide', [mouth(fig, k, extra)]),
        ...extraMarks(fig, k, extra),
        el('Node', { x: k.eyes[0], y: k.eyeY, name: 'socketL', id: fig.idOf('socketL') }),
        el('Node', { x: k.eyes[1], y: k.eyeY, name: 'socketR', id: fig.idOf('socketR') }),
      ]),
      el('Node', { name: 'faceRest', id: fig.idOf('faceRest') }),
    ]),
  );
};

export const gazeTarget = (fig: Figure, knobs: Numbers) =>
  el('Node', { x: knobs['gazeX'], y: knobs['gazeY'], name: 'gaze', id: fig.idOf('gaze') }, [
    fig.bind('gazeX', KEY.x),
    fig.bind('gazeY', KEY.y),
  ]);

const FPS = 60;

const CURVES = {
  io: [0.42, 0, 0.58, 1],
  out: [0.15, 0.6, 0.35, 1],
  in: [0.5, 0, 0.85, 0.4],
} as const;

const keyframes = (keys: ReadonlyArray<K>, fps: number): Element[] =>
  keys.map(([s, value, how = 'io']) => {
    const frame = Math.round(s * fps);
    if (how === 'hold' || how === 'linear')
      return el('KeyFrameDouble', { value, frame, interpolationType: how });
    const [x1, y1, x2, y2] = CURVES[how];
    return el('KeyFrameDouble', { value, frame, interpolationType: 'cubic' }, [
      el('CubicEaseInterpolator', { x1, y1, x2, y2 }),
    ]);
  });

export const timeline = (
  fig: Figure,
  name: string,
  seconds: number,
  tracks: Tracks,
  opts: { readonly fps?: number; readonly loop?: boolean } = {},
) => {
  const fps = opts.fps ?? FPS;
  return el(
    'LinearAnimation',
    {
      fps,
      duration: Math.round(seconds * fps),
      loopValue: opts.loop === true ? 'loop' : 'oneShot',
      name,
      id: fig.idOf(`anim:${name}`),
    },
    Object.entries(tracks).map(([object, props]) =>
      el(
        'KeyedObject',
        { objectId: fig.idOf(object) },
        Object.entries(props).map(([property, keys]) =>
          el('KeyedProperty', { property }, keyframes(keys, fps)),
        ),
      ),
    ),
  );
};

export const boilTimeline = (fig: Figure) =>
  timeline(fig, 'boil', BOIL.seconds, fig.boilTracks(), { fps: BOIL.fps, loop: true });

export const artboard = (
  fig: Figure,
  size: { readonly width: number; readonly height: number },
  content: ReadonlyArray<Element>,
  timelines: ReadonlyArray<Element>,
  given?: Numbers,
): Element[] => {
  const knobs = fig.direction.baked === true ? given : { ...given, [INK_NUMBER]: 1 };
  const vm = knobs === undefined ? undefined : fig.idOf('vm');
  const board = el(
    'Artboard',
    {
      viewModelId: vm,
      viewModelInstanceId: knobs === undefined ? undefined : fig.idOf('vm:default'),
      x: fig.stage,
      y: 0,
      width: size.width,
      height: size.height,
      clip: false,
      name: fig.name,
      id: fig.idOf('artboard'),
    },
    [...content, ...timelines],
  );
  if (knobs === undefined) return [board];
  const names = Object.keys(knobs);
  return [
    board,
    ...fig.converters(),
    el('ViewModel', { defaultInstanceId: fig.idOf('vm:default'), name: fig.name, id: vm }, [
      ...names.map((k) => el('ViewModelPropertyNumber', { name: k, id: fig.idOf(`vm:${k}`) })),
      el(
        'ViewModelInstance',
        { exports: true, name: 'Default', id: fig.idOf('vm:default') },
        names.map((k) =>
          el('ViewModelInstanceNumber', {
            propertyValue: knobs[k] ?? 0,
            viewModelPropertyId: fig.idOf(`vm:${k}`),
          }),
        ),
      ),
    ]),
  ];
};
