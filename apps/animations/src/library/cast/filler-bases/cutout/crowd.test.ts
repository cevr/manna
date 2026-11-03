import { describe, expect, test } from 'bun:test';
import { ramp } from '@manna/film/canvas';
import { keyLight, shading } from '@manna/film/style';
import { Option } from 'effect';
import {
  BODIES,
  CLOTHS,
  type Figure,
  type Placement,
  ROBE_WHITE,
  bustAt,
  crowdOf,
  dressOf,
  idleAt,
  lookOf,
  rowsOf,
} from './crowd.ts';
import { FRAMES } from './frames.ts';
import { HEAD_COVERED, PUPPETS } from './puppets.ts';

type Pt = readonly [number, number];

const SEEDS = Array.from({ length: 1000 }, (_, i) => i);

/** The most busts one plane lays (the feast's crowd plane holds 14, `C-plan.md` §1), and two more. */
const COUNT = 16;

/** Representative placements: the baby's far table, the feast's crowd plane, and the title's guests plane, at the scales they span. */
const PLACEMENTS: ReadonlyArray<Placement> = [
  { x: 300, top: 560, scale: 0.25 },
  { x: 700, top: 600, scale: 0.3 },
  { x: 960, top: 640, scale: 0.4 },
  { x: 1200, top: 820, scale: 0.5 },
  { x: 1600, top: 880, scale: 0.6 },
];

const SMALLEST = Math.min(...PLACEMENTS.map((p) => p.scale));

const CROWDS = SEEDS.map((seed) => crowdOf(seed, COUNT));

const FIGURES = CROWDS.flat();

const RAD = Math.PI / 180;

/** `p` turned `deg` clockwise on screen about `c`. */
const turn = (p: Pt, c: Pt, deg: number): Pt => {
  const [cos, sin] = [Math.cos(deg * RAD), Math.sin(deg * RAD)];
  const [dx, dy] = [p[0] - c[0], p[1] - c[1]];
  return [c[0] + cos * dx - sin * dy, c[1] + sin * dx + cos * dy];
};

/**
 * Where a torso point `p` of `figure`'s bust (a sheet point on the lean)
 * lands on screen at `at`, time `t`: turned by the lean about the root, laid
 * by the pose about the root less the origin, then by the canvas transform.
 */
const torsoAt = (figure: Figure, at: Placement, t: number) => {
  const { pose, transform } = bustAt(figure, at, t);
  const { lean } = idleAt(figure.idle, t);
  const { root } = rowsOf(figure.body);
  const origin = PUPPETS[figure.body].origin;
  const [a, b, c, d, e, f] = transform;
  return (p: Pt): Pt => {
    const w = turn(p, root, lean);
    const local: Pt = [
      pose.root[0] + pose.scale * (w[0] - root[0]) - origin[0],
      pose.root[1] + pose.scale * (w[1] - root[1]) - origin[1],
    ];
    return [a * local[0] + c * local[1] + e, b * local[0] + d * local[1] + f];
  };
};

/** A body's lowest drawn points, the kept box's two foot corners, and its hands' row at the same two sides, in its part sheet's frame. */
const lowOf = (figure: Figure): ReadonlyArray<Pt> => {
  const { root, hands } = rowsOf(figure.body);
  const frame = FRAMES[figure.body];
  const [left, right] = [frame.pad[0], frame.pad[0] + frame.kept[2] - frame.kept[0]];
  return [
    [left, root[1]],
    [right, root[1]],
    [left, hands],
    [right, hands],
  ];
};

/** A figure's mantle, or `none`. */
const mantleOf = (f: Figure) => Option.getOrElse(f.mantle, () => 'none');

describe('the crowd kit', () => {
  test('no two neighbours share body, mantle and headwear', () => {
    const shared = CROWDS.flatMap((row) =>
      row
        .slice(1)
        .filter(
          (b, i) =>
            row[i]!.body === b.body &&
            row[i]!.headwear === b.headwear &&
            mantleOf(row[i]!) === mantleOf(b),
        ),
    );
    expect(shared).toEqual([]);
  });

  test('every figure wears its body’s own house parts, its band only with its tied headcloth, a woman’s mantle only over her head, each cloth the kit’s', () => {
    const cloths = new Set<string>(Object.keys(CLOTHS));
    const wrong = FIGURES.filter((f) => {
      const drawn = BODIES[f.body];
      const worn = [f.mantle, f.band].flatMap((c) => Option.toArray(c));
      return (
        !(f.headwear === 'bare' || f.headwear === drawn.headwear) ||
        f.hair !== drawn.hair ||
        (drawn.beard === 0 && f.beard) ||
        (drawn.over && Option.isSome(f.mantle) !== (f.headwear === 'over')) ||
        Option.isSome(f.band) !== (f.headwear === 'tied') ||
        worn.some((c) => !cloths.has(c))
      );
    });
    expect(wrong).toEqual([]);
  });

  test('every choice falls somewhere: each body, each facing, each headwear, bare heads, beards, each mantle cloth and none', () => {
    const seen = new Set(
      FIGURES.flatMap((f) => [
        `body ${f.body}`,
        `facing ${f.facing}`,
        `headwear ${f.headwear}`,
        `beard ${f.beard}`,
        `mantle ${mantleOf(f)}`,
      ]),
    );
    expect(seen.size).toBe(4 + 2 + 4 + 2 + 5);
  });

  test('nobody wears robe white: not the hair, nor any ramp a dress dyes to', () => {
    const dressed = {
      parts: ['headwear', 'band', 'beard', 'mantle', 'head', 'torso'].map((name) => ({
        name,
        png: '/nonexistent/crowd-probe.png',
        ramp: ramp('#d1c6b4', keyLight, shading),
      })),
    };
    const kinds = new Map(
      FIGURES.map((f) => [`${f.hair} ${mantleOf(f)} ${Option.getOrElse(f.band, () => 'none')}`, f]),
    );
    const worn = new Set(
      [...kinds.values()].flatMap((f) => [
        f.hair,
        ...Object.values(
          Option.getOrElse(Option.fromUndefinedOr(dressOf(f, dressed).dye), () => ({})),
        ).flatMap((r) => [r.shade, r.base, r.light]),
      ]),
    );
    expect(worn.size).toBeGreaterThan(4);
    expect([...worn]).not.toContain(ROBE_WHITE);
  });

  test('a dress hides and dyes the house parts a puppet has, and on each bust only its own', () => {
    const dressed = {
      parts: ['headwear', 'band', 'beard', 'mantle', 'head', 'torso'].map((name) => ({
        name,
        png: '/nonexistent/crowd-probe.png',
        ramp: ramp('#d1c6b4', keyLight, shading),
      })),
    };
    const bare = FIGURES.find((f) => f.headwear === 'bare' && !f.beard && Option.isNone(f.mantle))!;
    expect(dressOf(bare, dressed)).toEqual({
      hide: ['headwear', 'band', 'beard', 'mantle'],
      dye: {},
    });
    const tied = FIGURES.find((f) => f.headwear === 'tied' && Option.isSome(f.mantle))!;
    expect(Object.keys(dressOf(tied, dressed).dye ?? {})).toEqual(['mantle', 'band']);
    const own = Object.fromEntries(
      Object.entries(PUPPETS).map(([view, p]) => [
        view,
        p.parts.map((part) => part.name).filter((name) => name !== 'head' && name !== 'torso'),
      ]),
    );
    expect(own).toEqual({
      'poses-1': ['beard', 'band', 'headwear', 'mantle'],
      'poses-2': ['mantle'],
      'poses-3': ['beard', 'headwear', 'mantle'],
      'poses-4': ['mantle'],
    });
    const wrong = FIGURES.filter((f) => {
      const { hide = [], dye = {} } = dressOf(f, PUPPETS[f.body]);
      const worn = (name: string) => !hide.includes(name) && own[f.body]!.includes(name);
      return (
        hide.some((name) => !own[f.body]!.includes(name)) ||
        worn('mantle') !== Option.isSome(f.mantle) ||
        (own[f.body]!.includes('headwear') && worn('headwear') === (f.headwear === 'bare')) ||
        (own[f.body]!.includes('beard') && worn('beard') !== f.beard) ||
        (own[f.body]!.includes('band') && worn('band') !== (f.headwear === 'tied')) ||
        Object.keys(dye).sort().join() !== ['band', 'mantle'].filter(worn).join()
      );
    });
    expect(wrong).toEqual([]);
  });

  test('a figure in headwear lays its bust’s covered head, a bare head or a bust without one keeps its drawn head', () => {
    const wrong = FIGURES.filter((f) => {
      const swaps = lookOf(f, PUPPETS[f.body]).swaps ?? [];
      const has = (PUPPETS[f.body].drawings ?? []).some((d) => d.name === HEAD_COVERED);
      const want = has && f.headwear !== 'bare';
      return (
        swaps.length !== Number(want) ||
        swaps.some((s) => s.part !== 'head' || s.drawing !== HEAD_COVERED)
      );
    });
    expect(wrong).toEqual([]);
    expect(
      FIGURES.some(
        (f) => f.headwear !== 'bare' && (lookOf(f, PUPPETS[f.body]).swaps ?? []).length === 1,
      ),
    ).toBe(true);
    expect(
      Object.keys(PUPPETS).filter(
        (v) => (PUPPETS[v as keyof typeof PUPPETS].drawings ?? []).length > 0,
      ),
    ).toEqual(['poses-1', 'poses-3']);
  });

  test('every head tip moves at least 2 screen px in every 2 s window at the smallest scale', () => {
    const [step, size, samples] = [0.2, 10, 160];
    const xs = new Float64Array(samples);
    const [upLo, upHi, downLo, downHi] = [
      new Float64Array(samples),
      new Float64Array(samples),
      new Float64Array(samples),
      new Float64Array(samples),
    ];
    let least = Number.POSITIVE_INFINITY;
    for (const f of FIGURES) {
      const { root, pivot } = rowsOf(f.body);
      const tip = PUPPETS[f.body].skeleton.bones[1]!.tip;
      const [hx, hy] = [tip[0] - pivot[0], tip[1] - pivot[1]];
      const [px, py] = [pivot[0] - root[0], pivot[1] - root[1]];
      for (let k = 0; k < samples; k++) {
        const { lean, head } = idleAt(f.idle, k * step);
        const ch = Math.cos(head * RAD);
        const sh = Math.sin(head * RAD);
        const wx = px + ch * hx - sh * hy;
        const wy = py + sh * hx + ch * hy;
        xs[k] = SMALLEST * (root[0] + Math.cos(lean * RAD) * wx - Math.sin(lean * RAD) * wy);
      }
      for (let k = 0; k < samples; k++) {
        const x = xs[k]!;
        upLo[k] = x;
        upHi[k] = x;
        if (k % size === 0) continue;
        upLo[k] = Math.min(x, upLo[k - 1]!);
        upHi[k] = Math.max(x, upHi[k - 1]!);
      }
      for (let k = samples - 1; k >= 0; k--) {
        const x = xs[k]!;
        downLo[k] = x;
        downHi[k] = x;
        if (k % size === size - 1 || k === samples - 1) continue;
        downLo[k] = Math.min(x, downLo[k + 1]!);
        downHi[k] = Math.max(x, downHi[k + 1]!);
      }
      for (let s = 0; s + size <= samples; s++) {
        const e = s + size - 1;
        least = Math.min(least, Math.max(downHi[s]!, upHi[e]!) - Math.min(downLo[s]!, upLo[e]!));
      }
    }
    expect(least).toBeGreaterThanOrEqual(2);
  });

  test('the head turns on its neck within the 4 degrees its cut is held to', () => {
    const most = Math.max(...FIGURES.map(({ idle }) => idle.breath.deg + idle.tilt.deg));
    expect(most).toBeLessThanOrEqual(4);
    let over = Number.NEGATIVE_INFINITY;
    for (const { idle } of CROWDS[0]!)
      for (let t = 0; t < 32; t += 0.05)
        over = Math.max(over, Math.abs(idleAt(idle, t).head) - idle.breath.deg - idle.tilt.deg);
    expect(over).toBeLessThanOrEqual(1e-12);
  });

  test('every table top lies above its figure’s foot and hands, at the breath’s farthest either way', () => {
    let least = Number.POSITIVE_INFINITY;
    for (const f of FIGURES) {
      const { breath } = f.idle;
      const low = lowOf(f);
      const peaks = [Math.PI / 2, (3 * Math.PI) / 2].map(
        (a) => ((a - breath.phase) * breath.period) / (2 * Math.PI),
      );
      for (const at of PLACEMENTS)
        for (const t of peaks) {
          const on = torsoAt(f, at, t);
          for (const p of low) least = Math.min(least, on(p)[1] - at.top);
        }
    }
    expect(least).toBeGreaterThan(0);
  });

  test('the table top crosses each bust at its shown row, under the neck’s centre at x', () => {
    for (const f of CROWDS[0]!.slice(0, 4))
      for (const at of PLACEMENTS) {
        const { root, table } = rowsOf(f.body);
        const [x, y] = torsoAt(f, at, 0)([root[0], table]);
        const reach = at.scale * (root[1] - table);
        const swing = f.idle.breath.deg * RAD;
        expect(Math.abs(y - at.top)).toBeLessThanOrEqual(reach * (1 - Math.cos(swing)) + 1e-9);
        expect(Math.abs(x - at.x)).toBeLessThanOrEqual(reach * Math.sin(swing) + 1e-9);
      }
  });
});
