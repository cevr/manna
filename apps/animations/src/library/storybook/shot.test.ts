import { rng } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { hexOf, type Palette, paintsOf, rgbAt, type Rgb, rgbOfHex } from './sheet.ts';
import {
  AT_REST,
  BLINK,
  BLINK_GAP,
  blinkingHold,
  BREATH,
  BREATH_PERIOD,
  chromaOf,
  drawnKeyOf,
  drawOrder,
  figure,
  type Figure,
  figuresOf,
  frameAt,
  hold,
  keyRun,
  type Layer,
  type Light,
  lit,
  plateAt,
  type PlateKey,
  revealAt,
  scaleOf,
  type Shot,
  type Span,
  SQUASH,
  timesOf,
  turn,
  walk,
} from './shot.ts';
import { feastCourtyard } from './shots/feast-courtyard.ts';

const KEYS = ['a', 'b', 'c', 'd'] as const;

type Key = (typeof KEYS)[number];

/** One span of a generated figure and the time it holds the figure, from its start to the next span's. */
interface Window {
  readonly span: Span<Key>;
  readonly from: number;
  readonly to: number;
}

/** A generated figure: the figure, its layer's depth, its sheet's head and its spans' windows. */
interface Generated {
  readonly figure: Figure<Key>;
  readonly z: number;
  readonly head: number;
  readonly windows: ReadonlyArray<Window>;
}

/** The cell the span's own rule names at `t`, read from the span alone. */
const cellOf = (s: Span<Key>, t: number): Key => {
  switch (s._tag) {
    case 'Hold':
    case 'Walk':
      return s.cell;
    case 'Turn':
      if (t < s.at + 0.4 * s.dur) return s.from;
      return s.to;
    case 'Keys':
      return (s.keys.filter(([at]) => at <= t).at(-1) ?? s.keys[0])[1];
  }
};

const pick = <A>(draw: () => number, xs: ReadonlyArray<A>, fallback: A): A =>
  xs[Math.floor(draw() * xs.length)] ?? fallback;

const spanIn = (draw: () => number, from: number, to: number): Span<Key> => {
  const key = () => pick(draw, KEYS, 'a');
  const first = key();
  const other = pick(
    draw,
    KEYS.filter((k) => k !== first),
    'b',
  );
  const len = to - from;
  const offsets = Array.from({ length: Math.floor(draw() * 4) }, () => from + draw() * len).sort(
    (a, b) => a - b,
  );
  const kinds: ReadonlyArray<() => Span<Key>> = [
    () => hold(from, to, first),
    () => blinkingHold(from, to, first, other),
    () => turn(from, len * (0.3 + draw() * 0.7), first, other),
    () => keyRun<Key>([[from, first], ...offsets.map((t) => [t, key()] as const)]),
    () =>
      walk<Key>({
        from,
        to,
        cell: first,
        x0: draw() * 400 - 200,
        x1: draw() * 400 + 200,
        bob: draw() * 8,
        rate: 1 + draw() * 2,
      }),
  ];
  return pick(draw, kinds, kinds[0] ?? (() => hold(from, to, first)))();
};

const generatedFigure = (draw: () => number, name: string, duration: number): Generated => {
  const windows: Array<Window> = [];
  for (let from = 0; from < duration;) {
    const to = from + 0.5 + draw() * 2;
    windows.push({ span: spanIn(draw, from, to), from, to });
    from = to;
  }
  const [first, ...rest] = windows.map((w) => w.span);
  return {
    figure: figure(KEYS, {
      name,
      member: 'm',
      sheet: 's',
      at: { x: draw() * 1000, ground: 400 + draw() * 300 },
      spans: [first ?? hold(0, duration, 'a'), ...rest],
    }),
    z: 0.6 + draw() * 2.7,
    head: 80 + draw() * 320,
    windows,
  };
};

const LIGHT: Light = {
  tint: { colour: '#ffd79a', amount: 0.1 },
  shade: { colour: '#5b4a8c', amount: 0.1 },
};

/** A generated shot of one to three layers, one or two figures each, with each figure's spans and sheet head. */
const generatedShot = (seed: number) => {
  const draw = rng(seed);
  const duration = 6 + Math.floor(draw() * 6);
  const figures: Array<Generated> = [];
  const layers: Array<Layer> = Array.from({ length: 1 + Math.floor(draw() * 3) }, (_, l) => {
    const made = Array.from({ length: 1 + Math.floor(draw() * 2) }, (_, f) =>
      generatedFigure(draw, `f${l}-${f}`, duration),
    );
    const z = made[0]?.z ?? 1;
    figures.push(...made.map((g) => ({ ...g, z })));
    return { name: `l${l}`, z, blur: 0, items: made.map((g) => g.figure) };
  });
  const shot: Shot = {
    id: `s${seed}`,
    size: { width: 1280, height: 720 },
    fps: 24,
    duration,
    headPx: 100 + draw() * 100,
    light: LIGHT,
    camera: [
      { t: 0, x: 640, y: 360, zoom: 1 },
      { t: duration, x: 600 + draw() * 80, y: 360, zoom: 1 + draw() * 0.2 },
    ],
    layers,
  };
  const heads = new Map(figures.map((g) => [g.figure.name, g.head] as const));
  return { shot, figures, heads };
};

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

/** No figure's head share named: every member's head a grown adult's. */
const ADULTS: ReadonlyMap<string, number> = new Map();

/** The span a generated figure is in at `t` by its windows, none for a figure not generated. */
const spanOfWindow = (figures: ReadonlyArray<Generated>, name: string, t: number) =>
  Option.fromUndefinedOr(
    figures
      .find((g) => g.figure.name === name)
      ?.windows.filter((w) => w.from <= t)
      .at(-1)?.span,
  );

describe('frameAt over generated shots', () => {
  test('draws each figure at every frame in the cell its span names', () => {
    const misses = SEEDS.flatMap((seed) => {
      const { shot, figures, heads } = generatedShot(seed);
      return timesOf(shot).flatMap((t) =>
        frameAt(shot, heads, t, ADULTS).figures.flatMap((f) => {
          const want = Option.match(spanOfWindow(figures, f.name, t), {
            onNone: () => 'none',
            onSome: (s) => cellOf(s, t),
          });
          if (f.cell === want) return [];
          return [`seed ${seed} t ${t}: ${f.name} draws ${f.cell}, its span names ${want}`];
        }),
      );
    });
    expect(misses.slice(0, 5)).toEqual([]);
  });

  test("shows its cell's own eyes but in a blinking hold, and there only its blink key's, a blink at a time", () => {
    const misses = SEEDS.flatMap((seed) => {
      const { shot, figures, heads } = generatedShot(seed);
      const run = new Map<string, number>();
      return timesOf(shot).flatMap((t) =>
        frameAt(shot, heads, t, ADULTS).figures.flatMap((f) => {
          const blink = Option.flatMap(spanOfWindow(figures, f.name, t), (s) => {
            if (s._tag !== 'Hold') return Option.none();
            return Option.fromUndefinedOr(s.blink);
          });
          run.set(f.name, ((run.get(f.name) ?? 0) + 1) * Number(f.eyes !== f.cell));
          const ok =
            f.eyes === f.cell ||
            (Option.contains(blink, f.eyes) &&
              drawnKeyOf(f) === `${f.cell}~${f.eyes}` &&
              (run.get(f.name) ?? 0) <= Math.round(BLINK * shot.fps));
          if (ok) return [];
          return [`seed ${seed} t ${t}: ${f.name} in ${f.cell} shows ${f.eyes}'s eyes`];
        }),
      );
    });
    expect(misses.slice(0, 5)).toEqual([]);
  });

  test('changes the drawn cell exactly once in a turn, squashing within its bounds and back', () => {
    const misses = SEEDS.flatMap((seed) => {
      const { shot, figures, heads } = generatedShot(seed);
      return figures.flatMap((g) =>
        g.windows.flatMap((w) => {
          if (w.span._tag !== 'Turn') return [];
          const end = w.span.at + w.span.dur;
          const frames = Array.from(
            { length: 241 },
            (_, i) => w.from + ((end - w.from) * i) / 240,
          ).flatMap((t) =>
            frameAt(shot, heads, t, ADULTS).figures.filter((f) => f.name === g.figure.name),
          );
          const swaps = frames.filter((f, i) => i > 0 && f.cell !== frames[i - 1]?.cell).length;
          const last = frames.at(-1);
          const settled = [last?.sx, last?.sy];
          if (swaps === 1 && settled.join() === '1,1') return [];
          return [`seed ${seed} ${g.figure.name}: ${swaps} swaps, ends at ${settled.join()}`];
        }),
      );
    });
    expect(misses.slice(0, 5)).toEqual([]);
  });

  test('keeps every squash within 6 % across and 3 % up, and only a turn squashes', () => {
    const misses = SEEDS.flatMap((seed) => {
      const { shot, figures, heads } = generatedShot(seed);
      return timesOf(shot).flatMap((t) =>
        frameAt(shot, heads, t, ADULTS).figures.flatMap((f) => {
          const turning = Option.exists(spanOfWindow(figures, f.name, t), (s) => s._tag === 'Turn');
          const bounded =
            f.sx >= 1 - SQUASH.x - 1e-12 && f.sx <= 1 && f.sy >= 1 && f.sy <= 1 + SQUASH.y + 1e-12;
          const still = f.sx === 1 && f.sy === 1;
          if (bounded && (turning || still)) return [];
          return [`seed ${seed} t ${t}: ${f.name} sx ${f.sx} sy ${f.sy}`];
        }),
      );
    });
    expect(misses.slice(0, 5)).toEqual([]);
  });

  test('moves a figure only in a walk, and a walk moves only its x and its bob, never its drawing', () => {
    const misses = SEEDS.flatMap((seed) => {
      const { shot, figures, heads } = generatedShot(seed);
      return timesOf(shot).flatMap((t) =>
        frameAt(shot, heads, t, ADULTS).figures.flatMap((f) => {
          const at = figures.find((x) => x.figure.name === f.name)?.figure.at ?? {
            x: Number.NaN,
            ground: Number.NaN,
          };
          const span = Option.getOrElse(spanOfWindow(figures, f.name, t), () => hold(0, 0, 'a'));
          if (span._tag === 'Walk') {
            const inside =
              f.cell === span.cell &&
              f.sx === 1 &&
              f.sy === 1 &&
              f.y <= at.ground &&
              f.y >= at.ground - span.bob - 1e-9 &&
              f.x >= Math.min(span.x0, span.x1) - 1e-9 &&
              f.x <= Math.max(span.x0, span.x1) + 1e-9;
            if (inside) return [];
          }
          if (span._tag !== 'Walk' && f.x === at.x && f.y === at.ground) return [];
          return [`seed ${seed} t ${t}: ${f.name} in ${span._tag} at ${f.x},${f.y}`];
        }),
      );
    });
    expect(misses.slice(0, 5)).toEqual([]);
  });

  test("derives every figure's head from the shot's head over its layer's depth, so heads go as 1/z", () => {
    for (const seed of SEEDS) {
      const { shot, figures, heads } = generatedShot(seed);
      const frame = frameAt(shot, heads, shot.duration / 2, ADULTS);
      const drawn = figures.map((g) => {
        const f = frame.figures.find((x) => x.name === g.figure.name);
        return { z: g.z, head: (f?.scale ?? 0) * g.head };
      });
      for (const d of drawn) expect(d.head).toBeCloseTo(shot.headPx / d.z, 9);
      const [a, b] = drawn;
      if (a && b) expect(a.head / b.head).toBeCloseTo(b.z / a.z, 9);
    }
    expect(scaleOf(150, 2, 300)).toBe(0.25);
  });

  test('is a pure function of t: two calls agree, whatever was drawn between them', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const { shot, heads } = generatedShot(seed);
      const first = timesOf(shot).map((t) => frameAt(shot, heads, t, ADULTS));
      const shuffled = timesOf(shot).toReversed();
      const again = new Map(shuffled.map((t) => [t, frameAt(shot, heads, t, ADULTS)] as const));
      expect(timesOf(shot).map((t) => again.get(t))).toEqual(first);
    }
  });

  test('breathes only on a hold, the crown rising no more than BREATH of the height, never squashing, and from one frame to the next in holds no further than a breath moves in a frame, across a key change from hold to hold too (critique 1, item 5; critique 4, C)', () => {
    const misses = SEEDS.flatMap((seed) => {
      const { shot, figures, heads } = generatedShot(seed);
      const step = (BREATH * Math.PI) / BREATH_PERIOD[0] / shot.fps;
      const last = new Map<string, number>();
      return timesOf(shot).flatMap((t) =>
        frameAt(shot, heads, t, ADULTS).figures.flatMap((f) => {
          const span = spanOfWindow(figures, f.name, t);
          const holding = Option.exists(span, (s) => s._tag === 'Hold');
          const before = last.get(f.name) ?? f.breath;
          last.set(f.name, f.breath);
          const smooth = Math.abs(f.breath - before) <= step * 1.0001;
          const ok =
            (holding && f.breath >= 1 && f.breath <= 1 + BREATH && smooth) ||
            (!holding && f.breath === 1);
          if (ok) return [];
          return [
            `seed ${seed} t ${t}: ${f.name} breath ${f.breath} after ${before}, holding ${holding}`,
          ];
        }),
      );
    });
    expect(misses.slice(0, 5)).toEqual([]);
  });
});

describe('drawOrder', () => {
  test('draws the farthest layer first and layers of one depth in their given order, the later over the earlier, as a stable sort by depth does', () => {
    const layers = [
      { name: 'a', z: 1 },
      { name: 'b', z: 3 },
      { name: 'c', z: 1.4 },
      { name: 'd', z: 3 },
      { name: 'e', z: 1.4 },
    ];
    expect(drawOrder(layers).map((l) => l.name)).toEqual(['b', 'd', 'c', 'e', 'a']);
  });
});

describe('a hold', () => {
  const still = (name: string) =>
    figure(['a', 'b'], {
      name,
      member: 'm',
      sheet: 's',
      at: { x: 0, ground: 0 },
      spans: [blinkingHold(0, 12, 'a', 'b')],
    });
  const shotOf = (figures: ReadonlyArray<Figure>): Shot => ({
    id: 'hold',
    size: { width: 100, height: 100 },
    fps: 240,
    duration: 12,
    headPx: 100,
    light: LIGHT,
    camera: [{ t: 0, x: 0, y: 0, zoom: 1 }],
    layers: [{ name: 'l', z: 1, blur: 0, items: figures }],
  });
  const runsOf = (
    name: string,
    made: Figure = still(name),
  ): ReadonlyArray<readonly [number, number]> => {
    const shot = shotOf([made]);
    const runs: Array<[number, number]> = [];
    for (const t of timesOf(shot)) {
      const f = frameAt(shot, new Map(), t, ADULTS).figures[0];
      if (f?.eyes !== 'b') continue;
      const last = runs.at(-1);
      if (last && t - last[1] < 0.01) last[1] = t;
      else runs.push([t, t]);
    }
    return runs;
  };

  test('breathes a full breath and back over its length, the same at every call, each figure at its own pace (critique 1, item 5)', () => {
    const shot = shotOf([still('one'), still('two')]);
    const breaths = (i: number) =>
      timesOf(shot).map((t) => frameAt(shot, new Map(), t, ADULTS).figures[i]?.breath ?? 0);
    const one = breaths(0);
    expect(Math.max(...one)).toBeGreaterThan(1 + BREATH * 0.99);
    expect(Math.min(...one)).toBe(1);
    expect(breaths(0)).toEqual(one);
    expect(breaths(1)).not.toEqual(one);
    const f = frameAt(shot, new Map(), 5, ADULTS).figures[0];
    expect([f?.sx, f?.sy]).toEqual([1, 1]);
  });

  test('breathes on across a key change from hold to hold, no frame stepping further than a breath moves in one frame, and starts from rest after a turn (critique 4, C)', () => {
    const changing = figure(['a', 'b'], {
      name: 'guest',
      member: 'm',
      sheet: 's',
      at: { x: 0, ground: 0 },
      spans: [hold(0, 2.3, 'a'), hold(2.3, 5.1, 'b'), blinkingHold(5.1, 12, 'a', 'b')],
    });
    const turning = figure(['a', 'b'], {
      name: 'lead',
      member: 'm',
      sheet: 's',
      at: { x: 0, ground: 0 },
      spans: [hold(0, 7, 'a'), turn(7, 0.5, 'a', 'b'), hold(7.5, 12, 'b')],
    });
    const shot = shotOf([changing, turning]);
    const step = (BREATH * Math.PI) / BREATH_PERIOD[0] / shot.fps;
    const breaths = (i: number) =>
      timesOf(shot).map(
        (t) => [t, frameAt(shot, new Map(), t, ADULTS).figures[i]?.breath ?? 0] as const,
      );
    const guest = breaths(0);
    const jumps = guest
      .slice(1)
      .filter(([, b], i) => Math.abs(b - (guest[i]?.[1] ?? b)) > step * 1.0001)
      .map(([t]) => t);
    const at = (rows: typeof guest, t: number) =>
      rows.filter(([u]) => Math.abs(u - t) < 1e-9).map(([, b]) => b);
    expect([jumps, at(guest, 2.3).map((b) => b > 1), at(breaths(1), 7.5)]).toEqual([
      [],
      [true],
      [1],
    ]);
  });

  test('shows its blink key on a seeded schedule: blinks of BLINK s, two or more in 12 s, 2 s or more apart, none in its first half second, the same at every call (critique 1, item 5)', () => {
    const runs = runsOf('one');
    expect(runs.length).toBeGreaterThanOrEqual(2);
    for (const [from, to] of runs) expect(to - from + 1 / 240).toBeCloseTo(BLINK, 2);
    for (const [[, end], [start]] of runs.slice(1).map((r, i) => [runs[i] ?? r, r] as const))
      expect(start - end).toBeGreaterThan(2);
    expect(runs[0]?.[0]).toBeGreaterThan(0.5);
    expect(runsOf('one')).toEqual(runs);
    expect(runsOf('two')).not.toEqual(runs);
  });

  test('keeps one schedule across cuts from hold to hold, so no gap between blinks passes BLINK_GAP however the holds are cut, the first within 1.8 s (critique 2, item 4)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const draw = rng(seed);
      const cuts = [0];
      while ((cuts.at(-1) ?? 12) < 12)
        cuts.push(Math.min(12, (cuts.at(-1) ?? 0) + 0.4 + draw() * 4.6));
      const holds = cuts
        .slice(1)
        .map((to, i) => blinkingHold<'a' | 'b'>(cuts[i] ?? 0, to, 'a', 'b'));
      const made = figure(['a', 'b'], {
        name: `cut ${seed}`,
        member: 'm',
        sheet: 's',
        at: { x: 0, ground: 0 },
        spans: [holds[0] ?? blinkingHold(0, 12, 'a', 'b'), ...holds.slice(1)],
      });
      const starts = runsOf(`cut ${seed}`, made).map(([from]) => from);
      const gaps = [
        starts[0] ?? 12,
        ...starts.slice(1).map((s, i) => s - (starts[i] ?? 0)),
        12 - (starts.at(-1) ?? 0),
      ];
      expect([seed, (starts[0] ?? 12) <= 1.8 + 1e-9]).toEqual([seed, true]);
      expect([seed, Math.max(...gaps) <= BLINK_GAP[1] + 1e-9]).toEqual([seed, true]);
    }
  });
});

describe('the feast courtyard', () => {
  test('frames every figure from the keys of its own sheet', () => {
    const heads = new Map([
      ['lead', 147],
      ['man', 335],
      ['woman', 373],
    ]);
    const used = new Map<string, Set<string>>();
    for (const t of timesOf(feastCourtyard))
      for (const f of frameAt(feastCourtyard, heads, t, ADULTS).figures)
        used.set(f.name, (used.get(f.name) ?? new Set<string>()).add(f.cell).add(f.eyes));
    expect([...(used.get('lead') ?? [])].toSorted()).toEqual(
      [
        'front',
        'lift',
        'offer',
        'side',
        'threeQuarter',
        'threeQuarterBlink',
        'wave-1',
        'wave-2',
      ].toSorted(),
    );
    const guest = ['neutral', 'neutralBlink', 'smile', 'turn'];
    expect([...(used.get('man') ?? [])].toSorted()).toEqual(guest);
    expect([...(used.get('woman') ?? [])].toSorted()).toEqual(guest);
  });

  test('blinks in every hold, the guests from the first frame to the last, with eyes open no longer than BLINK_GAP between blinks (critique 2, item 4)', () => {
    const holds = figuresOf(feastCourtyard).flatMap(({ figure: f }) =>
      f.spans.flatMap((s) => {
        if (s._tag !== 'Hold') return [];
        return [{ name: f.name, s }];
      }),
    );
    expect(holds.filter(({ s }) => s.blink === s.cell || !s.blink).map((h) => h.name)).toEqual([]);
    for (const guest of ['man', 'woman'])
      expect(
        holds
          .filter((h) => h.name === guest)
          .map((h) => [h.s.from, h.s.to])
          .flat()
          .filter((t) => t === 0 || t === feastCourtyard.duration),
      ).toEqual([0, feastCourtyard.duration]);
    const open = new Map<string, number>();
    const longest = new Map<string, number>();
    for (const t of timesOf(feastCourtyard))
      for (const f of frameAt(feastCourtyard, new Map(), t, ADULTS).figures) {
        const holding = holds.some((h) => h.name === f.name && h.s.from <= t && t < h.s.to);
        if (!holding || f.eyes !== f.cell) open.delete(f.name);
        else open.set(f.name, open.get(f.name) ?? t);
        longest.set(
          f.name,
          Math.max(
            longest.get(f.name) ?? 0,
            t + 1 / feastCourtyard.fps - (open.get(f.name) ?? t + 1),
          ),
        );
      }
    expect([...longest].map(([name, s]) => [name, s <= BLINK_GAP[1]])).toEqual([
      ['man', true],
      ['woman', true],
      ['lead', true],
    ]);
  });

  test('lights its shade with a hue as coloured as its tint, never black or grey (CRAFT rule 12)', () => {
    const { tint, shade } = feastCourtyard.light;
    expect(chromaOf(rgbOfHex(shade.colour))).toBeGreaterThanOrEqual(
      chromaOf(rgbOfHex(tint.colour)),
    );
    expect(chromaOf(rgbOfHex(shade.colour))).toBeGreaterThan(20);
  });

  test('a figure names no cell its sheet does not hold', () => {
    const made = figure(['a', 'b'], {
      name: 'x',
      member: 'm',
      sheet: 's',
      at: { x: 0, ground: 0 },
      // @ts-expect-error -- 'z' is no key of the figure's sheet
      spans: [hold(0, 1, 'z')],
    });
    expect(made._tag).toBe('Figure');
  });
});

/** A one-row picture of `colours`, opaque. */
const rowOf = (colours: ReadonlyArray<Rgb>): Raster => {
  const rgba = new Uint8Array(colours.length * 4);
  colours.forEach((c, i) => rgba.set([...c, 255], i * 4));
  return { width: colours.length, height: 1, rgba };
};

const colourOf = (draw: () => number): Rgb => [
  Math.floor(draw() * 256),
  Math.floor(draw() * 256),
  Math.floor(draw() * 256),
];

describe('lit', () => {
  test('maps a colour two palettes share the same way in both, the ink unchanged', () => {
    for (const seed of SEEDS) {
      const draw = rng(seed);
      const ink = colourOf(draw);
      const base = colourOf(draw);
      const shade = colourOf(draw);
      const shared = { name: 'shared', base: hexOf(base), shade: hexOf(shade) };
      const a: Palette = {
        ink: hexOf(ink),
        parts: [shared, { name: 'own', base: hexOf(colourOf(draw)) }],
      };
      const b: Palette = {
        ink: hexOf(ink),
        parts: [{ name: 'own', base: hexOf(colourOf(draw)) }, shared],
      };
      const light: Light = {
        tint: { colour: hexOf(colourOf(draw)), amount: draw() * 0.3 },
        shade: { colour: hexOf(colourOf(draw)), amount: draw() * 0.3 },
      };
      const cell = rowOf([ink, base, shade]);
      const litA = lit(cell, light, paintsOf(a));
      const litB = lit(cell, light, paintsOf(b));
      expect([0, 1, 2].map((q) => rgbAt(litA, q))).toEqual([0, 1, 2].map((q) => rgbAt(litB, q)));
      expect(rgbAt(litA, 0)).toEqual(ink);
    }
  });
});

describe('a shot on its scene’s frames', () => {
  test('draws exactly the scene frames k with from ≤ k / fps < from + duration, each at k / fps − from, over generated starts, lengths and rates; a shot from 0 draws i / fps', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const draw = rng(seed);
      const fps = [24, 25, 30][Math.floor(draw() * 3)] ?? 30;
      const from = draw() * 20;
      const duration = 0.2 + draw() * 8;
      const times = timesOf({ ...feastCourtyard, fps, from, duration });
      const frames = times.map((t) => Math.round((t + from) * fps));
      expect(frames.every((k, i) => Math.abs((times[i] ?? 0) + from - k / fps) < 1e-9)).toBe(true);
      expect(frames.every((k, i) => i === 0 || k === (frames[i - 1] ?? 0) + 1)).toBe(true);
      expect(frames[0]).toBe(Math.ceil(from * fps - 1e-6));
      expect((frames.at(-1) ?? 0) + 1).toBe(Math.ceil((from + duration) * fps - 1e-6));
    }
    expect(timesOf(feastCourtyard)).toEqual(
      Array.from({ length: 288 }, (_, i) => i / feastCourtyard.fps),
    );
  });
});

describe('a moving plate', () => {
  const key = (x: number, alpha = 1): PlateKey => ({ x, y: 0, sx: 1, sy: 1, alpha });

  test('rests with no keys, holds its first key before it and its last after, and eases (smoothstep) from one to the next, a pure function of t', () => {
    expect(plateAt({}, 3)).toEqual(AT_REST);
    const moves = [
      [1, key(0, 0)],
      [2, key(100)],
      [4, key(40)],
    ] as const;
    expect(plateAt({ moves }, 0)).toEqual(key(0, 0));
    expect(plateAt({ moves }, 9)).toEqual(key(40));
    expect(plateAt({ moves }, 1.5)).toEqual(key(50, 0.5));
    expect(plateAt({ moves }, 3).x).toBeCloseTo(70, 9);
    expect(plateAt({ moves }, 2.25).x).toBeGreaterThan(plateAt({ moves }, 2.5).x);
  });

  test('lays its brush from its foot: nothing before its start, the whole brush after its end, and between, points along it to the eased share of its length', () => {
    const brush = [
      [0, 100, 5],
      [0, 0, 5],
      [100, 0, 9],
    ] as const;
    const reveal = { brush, from: 1, to: 3 };
    expect(revealAt(reveal, 0.5)).toEqual([]);
    expect(revealAt(reveal, 4)).toEqual(brush);
    expect(revealAt(reveal, 2)).toEqual([
      [0, 100, 5],
      [0, 0, 5],
    ]);
    const quarter = revealAt(reveal, 1 + 2 * 0.3263518223);
    expect(quarter.length).toBe(2);
    expect(quarter[1]?.[1]).toBeCloseTo(50, 3);
  });
});

describe('head shares', () => {
  test('a figure is drawn at the grown head times its member’s share over its depth: the scale is proportional to the share, 1 when none is named', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const draw = rng(seed);
      const [head, z, sheet, share] = [
        80 + draw() * 200,
        0.5 + draw() * 2,
        50 + draw() * 300,
        0.4 + draw() * 0.6,
      ];
      expect(scaleOf(head, z, sheet, share)).toBeCloseTo(scaleOf(head, z, sheet) * share, 12);
      expect(scaleOf(head, z, sheet, share) * sheet * z).toBeCloseTo(head * share, 9);
    }
    const shares = new Map([['man', 0.5]]);
    const heads = new Map([
      ['man', 300],
      ['woman', 300],
      ['lead', 158],
    ]);
    const plain = frameAt(feastCourtyard, heads, 1, ADULTS);
    const halved = frameAt(feastCourtyard, heads, 1, shares);
    const scale = (f: typeof plain, name: string) =>
      f.figures.find((x) => x.name === name)?.scale ?? 0;
    expect(scale(halved, 'man')).toBeCloseTo(scale(plain, 'man') / 2, 12);
    expect(scale(halved, 'woman')).toBe(scale(plain, 'woman'));
  });

  test('reports each figure’s plane zoom as the camera’s zoom to the power 1 / z', () => {
    const frame = frameAt(feastCourtyard, new Map(), 12, ADULTS);
    for (const f of frame.figures) {
      const z = feastCourtyard.layers.find((l) => l.name === f.layer)?.z ?? 1;
      expect(f.zoom).toBeCloseTo(frame.camera.zoom ** (1 / z), 12);
    }
  });
});
