import { Array as Arr, Predicate, Result } from 'effect';
import { CodeTooLong } from '../../errors.ts';
import type { SoundUse } from '../../sfx.ts';
import { boundOf } from '../graph/bound.ts';
import { filterResponse, noisePower } from '../graph/kernels.ts';
import type { CodeSound, Node } from '../graph/nodes.ts';
import { MAX_CODE_SECS, MAX_CODE_WORK, SYNTH_RATE } from '../graph/units.ts';
import type { EarshotModel, Modal, Point, Sines, Spectral } from './model.ts';

export type FitSize = 'small' | 'full';

interface FitOptions {
  readonly size: FitSize;
  readonly use: SoundUse;
  readonly rumble: number;
}

export interface Fitted {
  readonly sound: CodeSound;
  readonly kind: EarshotModel['kind'];
  readonly modes: number;
  readonly tracks: number;
  readonly bands: number;
  readonly points: number;
  readonly merged: number | undefined;
  readonly highpass: boolean;
  readonly work: number;
  readonly left: ReadonlyArray<string>;
}

const NYQ = SYNTH_RATE / 2;
const RATIO_SPAN = 99;
const FLOOR = 1e-4;
const DROP_DB = 80;
const RUMBLE_HZ = 30;
const QUIET_RUMBLE = 0.01;
const BED_CROSSFADE = 0.5;
const SEAM_SECS = 3;
const VALLEY_DB = 50;

const BUDGETS: Record<FitSize, Budget> = {
  small: { modes: 16, tracks: 8, merge: 2.2, tol: 2 },
  full: { modes: Infinity, tracks: Infinity, merge: undefined, tol: 0 },
};

interface Budget {
  readonly modes: number;
  readonly tracks: number;
  readonly merge: number | undefined;
  readonly tol: number;
}

interface Mode {
  readonly f: number;
  readonly tau: number;
  readonly a: number;
  readonly ph: number;
}

interface Strike {
  readonly t: number;
  readonly ramp: number;
  readonly modes: ReadonlyArray<Mode>;
}

interface Track {
  readonly t0: number;
  readonly rise: number;
  readonly t1: number;
  readonly end: number;
  readonly ph: number;
  readonly freq: ReadonlyArray<Point>;
  readonly amp: ReadonlyArray<Point>;
}

interface Band {
  readonly lo: number;
  readonly hi: number;
  readonly pts: ReadonlyArray<Point>;
  readonly color: Color;
}

type Color = 'white' | 'pink' | 'brown';

interface Ridge {
  readonly t: ReadonlyArray<number>;
  readonly f: ReadonlyArray<number>;
  readonly db: ReadonlyArray<number>;
}

interface Parts {
  readonly secs: number;
  readonly strikes: ReadonlyArray<Strike>;
  readonly tracks: ReadonlyArray<Track>;
  readonly ridges: ReadonlyArray<Ridge>;
  readonly bands: ReadonlyArray<Band>;
  readonly fadeOut: number;
  readonly most: number;
  readonly left: ReadonlyArray<string>;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const db20 = (a: number) => 20 * Math.log10(Math.max(a, 1e-30));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const interp = (pts: ReadonlyArray<Point>, t: number): number => {
  const first = pts[0];
  if (first === undefined) return 0;
  if (t <= first[0]) return first[1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i] ?? first;
    if (t <= t1) {
      const [t0, v0] = pts[i - 1] ?? first;
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return (pts[pts.length - 1] ?? first)[1];
};

const energyOf = (pts: ReadonlyArray<Point>, from: number, to: number): number => {
  const all: Array<Point> = [
    [from, interp(pts, from)],
    ...pts.filter(([t]) => t > from && t < to),
    [to, interp(pts, to)],
  ];
  let e = 0;
  for (let i = 1; i < all.length; i++) {
    const [t0, a] = all[i - 1] ?? [0, 0];
    const [t1, b] = all[i] ?? [0, 0];
    const w = t1 - t0;
    if (w <= 0) continue;
    const k = ((b - a) * Math.LN10) / 10;
    e += Math.abs(k) < 1e-9 ? w * 10 ** (a / 10) : (w * (10 ** (b / 10) - 10 ** (a / 10))) / k;
  }
  return e;
};

const rdp = (pts: ReadonlyArray<Point>, tol: number): ReadonlyArray<number> => {
  const n = pts.length;
  if (n <= 2) return pts.map((_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: Array<readonly [number, number]> = [[0, n - 1]];
  for (let span = stack.pop(); span !== undefined; span = stack.pop()) {
    const [a, b] = span;
    if (b - a < 2) continue;
    const [ta, va] = pts[a] ?? [0, 0];
    const [tb, vb] = pts[b] ?? [0, 0];
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [t, v] = pts[i] ?? [0, 0];
      const line = tb === ta ? va : va + ((vb - va) * (t - ta)) / (tb - ta);
      const d = Math.abs(v - line);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.flatMap((_, i) => (keep[i] === 1 ? [i] : []));
};

const simplify = (
  pts: ReadonlyArray<Point>,
  tol: number,
  most: number,
  from: number,
  to: number,
): ReadonlyArray<Point> => {
  let kept: ReadonlyArray<Point> = pts;
  for (let t = Math.max(tol, 0.01); ; t *= 1.25) {
    kept = rdp(pts, t).flatMap((i) => (pts[i] === undefined ? [] : [pts[i]]));
    if (kept.length <= most) break;
  }
  const by = dbApart(energyOf(pts, from, to), energyOf(kept, from, to));
  return kept.map(([t, v]): Point => [t, v + by]);
};

const dbApart = (from: number, to: number): number =>
  from > 0 && to > 0 ? 10 * Math.log10(from / to) : 0;

const eqOf = (gains: ReadonlyArray<number>) => {
  const at: ReadonlyArray<Point> = gains.map((g, i): Point => [Math.log2(1000) + (i - 15) / 3, g]);
  return (hz: number): number => (at.length === 0 ? 0 : interp(at, Math.log2(Math.max(hz, 1))));
};

const eqIn = (model: EarshotModel) => eqOf(model.post?.eq_db ?? []);

const modeOf =
  (eq: (hz: number) => number) =>
  ([f, tau, a, ph]: readonly [number, number, number, number]): Mode => ({
    f,
    tau,
    a: Math.abs(a) * 10 ** (eq(f) / 20),
    ph: a < 0 ? ph + Math.PI : ph,
  });

const stereoOf = (m: { readonly channels?: number }) => (m.channels === 2 ? 'its stereo side' : '');

const leftOut = (model: EarshotModel, named: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...named, model.post?.pre == null ? '' : 'the attack clamp of its post stage'].filter(
    (s) => s !== '',
  );

const modalParts = (m: Modal): Parts => {
  const eq = eqIn(m);
  const edges = m.noise.edges;
  const loOf = (b: number) => (b === 0 ? 0 : (edges[b - 1] ?? 0));
  const hiOf = (b: number) => (b >= edges.length ? NYQ : (edges[b] ?? NYQ));
  const centreOf = (b: number) => {
    if (b === 0) return (edges[0] ?? 50) / Math.SQRT2;
    if (b >= edges.length) return Math.sqrt(loOf(b) * 22000);
    return Math.sqrt(loOf(b) * hiOf(b));
  };
  const strikes = m.strikes.flatMap((s): ReadonlyArray<Strike> => [
    { t: s.t, ramp: s.ramp_ms / 1000, modes: s.modes.map(modeOf(eq)) },
    { t: s.t, ramp: 0, modes: (s.attack ?? []).map(modeOf(eq)) },
  ]);
  const bands = m.noise.env.map((pts, b): Band => ({
    lo: loOf(b),
    hi: hiOf(b),
    pts: pts.map(([t, v]): Point => [t, v + eq(centreOf(b))]),
    color: 'white',
  }));
  return {
    secs: m.length_s,
    strikes,
    tracks: [],
    ridges: [],
    bands,
    fadeOut: m.fade_out_s ?? 0,
    most: 6 + 3 * m.strikes.length,
    left: leftOut(m, [m.sub == null ? '' : 'its sub wave under 20 Hz', stereoOf(m)]),
  };
};

const sinesParts = (m: Sines): Parts => {
  const eq = eqIn(m);
  const tracks = m.partials.map((p): Track => ({
    t0: p.t0,
    rise: p.rise,
    t1: p.t1,
    end: p.t1 + p.rel,
    ph: p.ph,
    freq: p.freq,
    amp: p.amp.map(([t, v]): Point => [t, v + eq(interp(p.freq, t))]),
  }));
  const strikes = m.transients.map((tr): Strike => ({
    t: Math.max(0, tr.t),
    ramp: 0,
    modes: tr.atoms.map(modeOf(eq)),
  }));
  const { bands: centres, times } = m.residual;
  const bands = m.residual.db.map((row, b): Band => {
    const c = centres[b] ?? 1000;
    return {
      lo: b === 0 ? 0 : Math.sqrt((centres[b - 1] ?? c) * c),
      hi: b === centres.length - 1 ? NYQ : Math.sqrt(c * (centres[b + 1] ?? c)),
      pts: row.map((v, j): Point => [times[j] ?? 0, v + eq(c)]),
      color: 'white',
    };
  });
  return {
    secs: m.duration,
    strikes,
    tracks,
    ridges: [],
    bands: bands.filter((band) => Math.max(...band.pts.map(([, v]) => v)) > -149),
    fadeOut: 0,
    most: 6 + 3 * Math.max(1, m.onsets?.length ?? 1),
    left: leftOut(m, [stereoOf(m)]),
  };
};

const WARP = 80;
const warp = (f: number) => Math.log1p(f / WARP);
const unwarp = (e: number) => Math.expm1(e) * WARP;

const weightOf = (e: number, ec: ReadonlyArray<number>, b: number): number => {
  const at = (i: number) => ec[i] ?? 0;
  const lo = b === 0 ? at(0) - (at(1) - at(0)) : at(b - 1);
  if (e >= lo && e < at(b)) return Math.sin((0.5 * Math.PI * (e - lo)) / (at(b) - lo)) ** 2;
  if (b === ec.length - 1) return e >= at(b) ? 1 : 0;
  const hi = at(b + 1);
  if (e >= at(b) && e < hi) return Math.cos((0.5 * Math.PI * (e - at(b))) / (hi - at(b))) ** 2;
  return 0;
};

const EARSHOT_HALF = 24000;

const spectralParts = (m: Spectral): Parts => {
  const eq = eqIn(m);
  const n = m.bands.n;
  const e0 = warp(m.bands.f_lo);
  const e1 = warp(m.bands.f_hi);
  const ec = Array.from({ length: n }, (_, i) => e0 + ((e1 - e0) * i) / (n - 1));
  const steps = 24000;
  const sq = ec.map((_, b) => {
    let s = 0;
    for (let k = 1; k < steps; k++) s += weightOf(warp((k * EARSHOT_HALF) / steps), ec, b) ** 2;
    return (s * EARSHOT_HALF) / steps;
  });
  const half = (ec[1] ?? 0) - (ec[0] ?? 0);
  const bands = ec.map((c, b): Band => ({
    lo: b === 0 ? unwarp(Math.max(0, c - half / 2)) : unwarp(((ec[b - 1] ?? c) + c) / 2),
    hi: b === n - 1 ? NYQ : unwarp((c + (ec[b + 1] ?? c)) / 2),
    pts: m.env.t.map((t, k): Point => [
      t,
      (m.env.db[k]?.[b] ?? -150) + 10 * Math.log10((sq[b] ?? 1) / EARSHOT_HALF) + eq(unwarp(c)),
    ]),
    color: 'white',
  }));
  const ridges = (m.ridges ?? []).map((r): Ridge => ({
    t: r.t,
    f: r.f,
    db: r.db.map((v, i) => v + eq(r.f[i] ?? 1000)),
  }));
  return {
    secs: m.dur,
    strikes: [],
    tracks: [],
    ridges,
    bands,
    fadeOut: 0,
    most: 24,
    left: leftOut(m, [
      m.texture?.am == null && m.texture?.grains == null ? '' : 'its texture (grains, AM)',
      m.stereo == null ? '' : 'its stereo image',
    ]),
  };
};

const partsOf = (model: EarshotModel): Parts => {
  switch (model.kind) {
    case 'modal':
      return modalParts(model);
    case 'sines':
      return sinesParts(model);
    case 'spectral_noise':
      return spectralParts(model);
  }
};

const mergeModes = (modes: ReadonlyArray<Mode>): ReadonlyArray<Mode> => {
  const sorted = [...modes].sort((x, y) => x.f - y.f);
  const out: Array<Mode> = [];
  let group: Array<Mode> = [];
  const flush = () => {
    if (group.length === 0) return;
    let re = 0;
    let im = 0;
    let w = 0;
    let f = 0;
    let tau = 0;
    for (const m of group) {
      re += m.a * Math.cos(m.ph);
      im += m.a * Math.sin(m.ph);
      const e = m.a ** 2 * m.tau;
      w += e;
      f += e * m.f;
      tau += e * m.tau;
    }
    if (w > 0) out.push({ f: f / w, tau: tau / w, a: Math.hypot(re, im), ph: Math.atan2(im, re) });
    group = [];
  };
  for (const m of sorted) {
    const last = group[group.length - 1];
    const apart = (a: Mode, b: Mode) =>
      b.f - a.f > Math.max(1 / (Math.PI * Math.min(a.tau, b.tau)), 0.005 * b.f);
    if (last !== undefined && apart(last, m)) flush();
    group.push(m);
  }
  flush();
  return out;
};

const energy = (m: Mode) => m.a ** 2 * m.tau;

const HEARD_SECS = 0.4;

const heard = (m: Mode) => energy(m) * (1 - Math.exp((-2 * HEARD_SECS) / m.tau));

interface Placed {
  readonly t: number;
  readonly mode: Mode;
}

const crossEnergy = (x: Mode, y: Mode, secs: number): number => {
  const alpha = 1 / x.tau + 1 / y.tau;
  const fade = Math.exp(-alpha * secs);
  const part = (w: number, ph: number) => {
    const re = Math.cos(ph) - fade * Math.cos(ph + w * secs);
    const im = Math.sin(ph) - fade * Math.sin(ph + w * secs);
    return (alpha * re - w * im) / (alpha ** 2 + w ** 2);
  };
  return (
    ((x.a * y.a) / 2) *
    (part(2 * Math.PI * (x.f - y.f), x.ph - y.ph) + part(2 * Math.PI * (x.f + y.f), x.ph + y.ph))
  );
};

const carried = ({ t, mode }: Placed, at: number): Mode => ({
  ...mode,
  a: mode.a * Math.exp(-(at - t) / mode.tau),
  ph: mode.ph + 2 * Math.PI * mode.f * (at - t),
});

const placedEnergy = (modes: ReadonlyArray<Placed>, end: number): number =>
  Math.max(
    0,
    modes.reduce(
      (sum, x) =>
        sum +
        modes.reduce((s, y) => {
          const [first, last] = x.t <= y.t ? [x, y] : [y, x];
          return s + crossEnergy(carried(first, last.t), last.mode, Math.max(0, end - last.t));
        }, 0),
      0,
    ),
  );

interface Residue {
  readonly band: number;
  readonly t: number;
  readonly energy: number;
  readonly tau: number;
}

interface Reduced {
  readonly strikes: ReadonlyArray<Strike>;
  readonly residue: ReadonlyArray<Residue>;
}

const thirdOf = (mode: Mode) => Math.round(3 * Math.log2(Math.max(mode.f, 1) / 1000));

const reduceStrikes = (
  strikes: ReadonlyArray<Strike>,
  most: number,
  bands: ReadonlyArray<Band>,
  secs: number,
): Reduced => {
  if (!Number.isFinite(most)) return { strikes, residue: [] };
  const merged = strikes.map((s) => ({ ...s, modes: mergeModes(s.modes) }));
  const kept = new Set(
    merged
      .flatMap((s) => s.modes)
      .sort((x, y) => heard(y) - heard(x))
      .slice(0, most),
  );
  const scale = cancelledScales(strikes, merged, kept, secs);
  const reduced = merged.map((s) => ({
    ...s,
    modes: s.modes.flatMap((m) => (kept.has(m) ? [{ ...m, a: m.a * (scale.get(m) ?? 1) }] : [])),
  }));
  const gone = placed(merged).filter(({ mode }) => !kept.has(mode));
  return { strikes: reduced, residue: residueOf(strikes, reduced, gone, bands, secs) };
};

const placed = (ss: ReadonlyArray<Strike>): ReadonlyArray<Placed> =>
  ss.flatMap((s) => s.modes.map((mode) => ({ t: s.t, mode })));

const cancelledScales = (
  strikes: ReadonlyArray<Strike>,
  merged: ReadonlyArray<Strike>,
  kept: ReadonlySet<Mode>,
  secs: number,
): ReadonlyMap<Mode, number> => {
  const struck = ({ t, mode }: Placed) => `${t}|${thirdOf(mode)}`;
  const truths = Arr.groupBy(placed(strikes), struck);
  const reduceds = Arr.groupBy(placed(merged), struck);
  const scale = new Map<Mode, number>();
  for (const [key, truth] of Object.entries(truths)) {
    const left = (reduceds[key] ?? []).filter(({ mode }) => kept.has(mode));
    const want = placedEnergy(truth, secs);
    const have = placedEnergy(left, secs);
    if (have > want) for (const { mode } of left) scale.set(mode, Math.sqrt(want / have));
  }
  return scale;
};

const residueOf = (
  strikes: ReadonlyArray<Strike>,
  reduced: ReadonlyArray<Strike>,
  gone: ReadonlyArray<Placed>,
  bands: ReadonlyArray<Band>,
  secs: number,
): ReadonlyArray<Residue> => {
  const third = ({ mode }: Placed) => String(thirdOf(mode));
  const wholes = Arr.groupBy(placed(strikes), third);
  const keeps = Arr.groupBy(placed(reduced), third);
  const rings = ({ t, mode }: Placed) =>
    energy(mode) * (1 - Math.exp((-2 * Math.max(0, secs - t)) / mode.tau));
  return Object.entries(Arr.groupBy(gone, third)).flatMap(([key, lost]) => {
    const short = placedEnergy(wholes[key] ?? [], secs) - placedEnergy(keeps[key] ?? [], secs);
    const total = lost.reduce((w, p) => w + rings(p), 0);
    if (short <= 0 || total <= 0) return [];
    return Object.values(Arr.groupBy(lost, ({ t }) => String(t))).flatMap((at) => {
      const weight = at.reduce((w, p) => w + rings(p), 0);
      if (weight <= 0) return [];
      const f = at.reduce((w, p) => w + rings(p) * p.mode.f, 0) / weight;
      const tau = at.reduce((w, p) => w + rings(p) * p.mode.tau, 0) / weight;
      const band = bands.findIndex((b) => f >= b.lo && f < b.hi);
      if (band < 0) return [];
      return [{ band, t: at[0].t, energy: (short * weight) / total, tau }];
    });
  });
};

const DECAYS = [0, 0.5, 1, 2, 3.5, 7];

const foldResidue = (
  bands: ReadonlyArray<Band>,
  residue: ReadonlyArray<Residue>,
  secs: number,
): ReadonlyArray<Band> =>
  bands.map((band, b) => {
    const ins = residue.filter((r) => r.band === b);
    if (ins.length === 0) return band;
    const start = (r: Residue) =>
      (2 * r.energy) / (r.tau * (1 - Math.exp((-2 * Math.max(secs - r.t, 1e-6)) / r.tau)));
    const at = (t: number) =>
      ins.reduce(
        (sum, r) => (t < r.t ? sum : sum + start(r) * Math.exp((-2 * (t - r.t)) / r.tau)),
        10 ** (interp(band.pts, t) / 10),
      );
    const times = [
      ...new Set([
        ...band.pts.map(([t]) => t),
        ...ins.flatMap((r) => [
          Math.max(0, r.t - 1e-4),
          ...DECAYS.map((k) => r.t + k * r.tau).filter((x) => x < secs),
        ]),
        secs,
      ]),
    ].sort((x, y) => x - y);
    return { ...band, pts: times.map((t): Point => [t, 10 * Math.log10(at(t))]) };
  });

const trackEnergy = (t: Track) => energyOf(t.amp, t.t0, t.end);

const reduceTracks = (tracks: ReadonlyArray<Track>, most: number): ReadonlyArray<Track> => {
  if (!Number.isFinite(most)) return tracks;
  return [...tracks]
    .sort((x, y) => trackEnergy(y) - trackEnergy(x))
    .slice(0, most)
    .map((t) => ({
      ...t,
      amp: simplify(t.amp, 3, 8, t.t0, t.end),
      freq: simplify(
        t.freq.map(([s, f]): Point => [s, 1200 * Math.log2(f)]),
        20,
        6,
        t.t0,
        t.end,
      ).map(([s, c]): Point => [s, 2 ** (c / 1200)]),
    }));
};

const perOctave = (band: Band, secs: number) =>
  10 *
  Math.log10(
    energyOf(band.pts, 0, secs) / Math.log2(Math.min(band.hi, 20000) / Math.max(band.lo, 20)),
  );

const mergeBands = (
  bands: ReadonlyArray<Band>,
  secs: number,
  width: number,
  tol: number,
  most: number,
): ReadonlyArray<Band> => {
  const groups: Array<ReadonlyArray<Band>> = [];
  for (let i = 0; i < bands.length;) {
    const lo = bands[i]?.lo ?? 0;
    let j = i + 1;
    if (lo > 0)
      while (
        j < bands.length &&
        (bands[j]?.lo ?? 0) > 0 &&
        Math.min(bands[j]?.hi ?? NYQ, NYQ) / lo <= width
      )
        j++;
    groups.push(bands.slice(i, j));
    i = j;
  }
  return groups.map((group): Band => {
    const times = [...new Set(group.flatMap((g) => g.pts.map(([t]) => t)))].sort((a, b) => a - b);
    const summed = times.map((t): Point => [
      t,
      10 * Math.log10(group.reduce((s, g) => s + 10 ** (interp(g.pts, t) / 10), 0)),
    ]);
    const top = Math.max(...summed.map(([, v]) => v));
    const held = summed.map(([t, v]): Point => [t, Math.max(v, top - VALLEY_DB)]);
    const end = Math.max(secs, times[times.length - 1] ?? 0);
    const kept = simplify(held, tol, most, 0, end);
    const by = dbApart(energyOf(summed, 0, end), energyOf(kept, 0, end));
    const xs = group.map((g) => Math.log2(Math.sqrt(Math.max(g.lo, 20) * Math.min(g.hi, 20000))));
    const ys = group.map((g) => perOctave(g, end));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const slope = den > 0 ? xs.reduce((a, x, k) => a + (x - mx) * ((ys[k] ?? 0) - my), 0) / den : 0;
    let color: Color = 'brown';
    if (slope > 1.5) color = 'white';
    else if (slope > -1.5) color = 'pink';
    return {
      lo: group[0]?.lo ?? 0,
      hi: group[group.length - 1]?.hi ?? NYQ,
      pts: kept.map(([t, v]): Point => [t, v + by]),
      color,
    };
  });
};

const SEAM_STEP = 0.02;
const COHERENT_HZ = 2;

const phasorAt = ({ t: from, mode }: Placed, t: number) =>
  t < from
    ? undefined
    : {
        a: mode.a * Math.exp(-(t - from) / mode.tau),
        ph: 2 * Math.PI * mode.f * (t - from) + mode.ph,
      };

const powerOf = (parts: Parts) => {
  const placed = parts.strikes
    .flatMap((s) => s.modes.map((mode): Placed => ({ t: s.t, mode })))
    .sort((x, y) => x.mode.f - y.mode.f);
  const pairs: Array<readonly [Placed, Placed]> = [];
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const x = placed[i];
      const y = placed[j];
      if (x === undefined || y === undefined || y.mode.f - x.mode.f >= COHERENT_HZ) break;
      pairs.push([x, y]);
    }
  const ridges = parts.ridges.map((ridge) =>
    ridge.t.map((x, i): Point => [x, ridge.db[i] ?? -150]),
  );
  return (t: number): number => {
    let p = 0;
    for (const band of parts.bands) p += 10 ** (interp(band.pts, t) / 10);
    for (const one of placed) p += (phasorAt(one, t)?.a ?? 0) ** 2 / 2;
    for (const [x, y] of pairs) {
      const u = phasorAt(x, t);
      const v = phasorAt(y, t);
      if (u !== undefined && v !== undefined) p += u.a * v.a * Math.cos(u.ph - v.ph);
    }
    for (const track of parts.tracks)
      if (t >= track.t0 && t <= track.end) p += 10 ** (interp(track.amp, t) / 10) / 2;
    for (const pts of ridges) {
      const t0 = pts[0]?.[0] ?? 0;
      const t1 = pts[pts.length - 1]?.[0] ?? t0;
      if (t >= t0 && t <= t1) p += 10 ** (interp(pts, t) / 10) / 2;
    }
    return Math.max(p, 1e-30);
  };
};

const seamTilt = (parts: Parts): number => {
  const end = parts.secs - BED_CROSSFADE;
  const window = Math.min(SEAM_SECS, end / 2);
  const steps = Math.max(1, Math.floor(window / SEAM_STEP));
  const ts = Array.from({ length: steps }, (_, i) => (i + 0.5) * SEAM_STEP);
  const powerAt = powerOf(parts);
  const head = ts.map((t) => [t, powerAt(t), powerAt(end + t)] as const);
  const tail = ts.map((t) => [end - window + t, powerAt(end - window + t)] as const);
  const apart = (k: number) => {
    const g = (t: number) => 10 ** ((k * t) / 10);
    let h = 0;
    for (const [t, p, under] of head) {
      const x = Math.min(1, t / BED_CROSSFADE);
      h += x * p * g(t) + (1 - x) * under * g(end + t);
    }
    let e = 0;
    for (const [t, p] of tail) e += p * g(t);
    return 10 * Math.log10(e / h);
  };
  let k0 = 0;
  let f0 = apart(k0);
  let k1 = -f0 / Math.max(1, end - window);
  for (let i = 0; i < 8 && Math.abs(f0) > 0.01; i++) {
    const f1 = apart(k1);
    if (f1 === f0) break;
    const k2 = k1 - (f1 * (k1 - k0)) / (f1 - f0);
    [k0, f0, k1] = [k1, f1, k2];
  }
  return k0;
};

interface Layered {
  readonly node: Node;
  readonly at?: number;
  readonly db?: number;
}

const stagesOf = (band: Band) => {
  const butter = Math.SQRT1_2;
  if (band.lo <= 0)
    return [
      { type: 'lowpass', hz: band.hi, q: butter },
      { type: 'lowpass', hz: band.hi, q: butter },
    ] as const;
  if (band.hi >= 0.49 * SYNTH_RATE)
    return [
      { type: 'highpass', hz: band.lo, q: butter },
      { type: 'highpass', hz: band.lo, q: butter },
    ] as const;
  if (band.hi / band.lo >= 1.6)
    return [
      { type: 'highpass', hz: band.lo, q: butter },
      { type: 'highpass', hz: band.lo, q: butter },
      { type: 'lowpass', hz: band.hi, q: butter },
      { type: 'lowpass', hz: band.hi, q: butter },
    ] as const;
  const centre = Math.sqrt(band.lo * band.hi);
  const q = (0.644 * centre) / (band.hi - band.lo);
  return [
    { type: 'bandpass', hz: centre, q },
    { type: 'bandpass', hz: centre, q },
  ] as const;
};

const GRID = Array.from({ length: 4000 }, (_, i) => 0.5 * (NYQ / 0.5) ** (i / 3999));

const powerThrough = (color: Color, stages: ReturnType<typeof stagesOf>): number => {
  const responses = stages.map((s) => filterResponse(s.type, s.hz, s.q, 0));
  let sum = 0;
  for (let i = 1; i < GRID.length; i++) {
    const f0 = GRID[i - 1] ?? 0;
    const f1 = GRID[i] ?? 0;
    const f = (f0 + f1) / 2;
    sum += responses.reduce((p, r) => p * r(f), noisePower(color, f)) * (f1 - f0);
  }
  return sum / NYQ;
};

const bandLayer = (band: Band, secs: number): Layered => {
  const stages = stagesOf(band);
  const top = Math.max(...band.pts.map(([, v]) => v));
  let node: Node = { _tag: 'Noise', color: band.color, secs: round(secs, 4) };
  for (const s of stages)
    node = {
      _tag: 'Filter',
      type: s.type,
      hz: round(clamp(s.hz, 1, 22050), 2),
      q: round(s.q, 4),
      of: node,
    };
  const points = band.pts.map(([t, v]): readonly [number, number] => [
    round(clamp(t, 0, secs), 5),
    round(Math.max(FLOOR, 10 ** ((v - top) / 20)), 6),
  ]);
  const [first, ...rest] = points;
  return {
    node: { _tag: 'Envelope', curve: 'exponential', points: [first ?? [0, 1], ...rest], of: node },
    db: round(top - 10 * Math.log10(powerThrough(band.color, stages)), 2),
  };
};

const turnsOf = (ph: number) => round(((((ph + Math.PI / 2) / (2 * Math.PI)) % 1) + 1) % 1, 5);

const strikeLayers = (strike: Strike, secs: number, quiet: number): ReadonlyArray<Layered> => {
  const most = Math.max(0.001, secs - strike.t);
  const rung = strike.modes
    .filter((m) => m.f > 0 && m.f < NYQ && m.a > quiet)
    .map((m) => ({ m, len: Math.min(most, m.tau * Math.log(m.a / quiet)) }));
  const octaves = new Map<number, Array<(typeof rung)[number]>>();
  for (const one of rung) {
    const key = Math.floor(Math.log2(Math.max(one.len, 0.001)));
    octaves.set(key, [...(octaves.get(key) ?? []), one]);
  }
  const out: Array<Layered> = [];
  for (const key of [...octaves.keys()].sort((x, y) => y - x)) {
    const sorted = (octaves.get(key) ?? []).sort((x, y) => x.m.f - y.m.f);
    for (let i = 0; i < sorted.length;) {
      const low = sorted[i]?.m.f ?? 1;
      const group: typeof sorted = [];
      for (; i < sorted.length && (sorted[i]?.m.f ?? 0) <= low * RATIO_SPAN; i++) {
        const one = sorted[i];
        if (one !== undefined) group.push(one);
      }
      const loudest = Math.max(...group.map(({ m }) => m.a));
      const set = group.map(({ m }) => ({
        ratio: round(m.f / low, 5),
        level: round(m.a / loudest, 6),
        decay: round(clamp(m.tau, 0.0001, MAX_CODE_SECS), 5),
        phase: turnsOf(m.ph),
      }));
      const [first, ...rest] = set;
      if (first === undefined) continue;
      out.push({
        node: {
          _tag: 'Partials',
          pitch: round(low, 3),
          set: [first, ...rest],
          attack: round(strike.ramp, 5),
          secs: round(Math.max(0.001, ...group.map(({ len }) => len)), 4),
        },
        at: round(strike.t, 5),
        db: round(db20(loudest), 2),
      });
    }
  }
  return out;
};

const trackLayer = (track: Track): Layered => {
  const len = Math.max(0.001, track.end - track.t0);
  const shifted = (pts: ReadonlyArray<Point>): ReadonlyArray<Point> => [
    [0, interp(pts, track.t0)],
    ...pts
      .filter(([t]) => t > track.t0 && t <= track.end)
      .map(([t, v]): Point => [t - track.t0, v]),
  ];
  const top = Math.max(...track.amp.map(([, v]) => v));
  const amp = shifted(track.amp).map(([t, v]): readonly [number, number] => [
    round(t, 5),
    round(Math.max(FLOOR, 10 ** ((v - top) / 20)), 6),
  ]);
  const pitch = shifted(track.freq).map(([t, f]): readonly [number, number] => [
    round(t, 5),
    round(clamp(f, 1, NYQ - 1), 3),
  ]);
  const [a0, ...aRest] = amp;
  const [p0, ...pRest] = pitch;
  const osc: Node = {
    _tag: 'Osc',
    wave: 'sine',
    pitch:
      pRest.length > 0 && p0 !== undefined
        ? { _tag: 'Points', points: [p0, ...pRest], curve: 'exponential' }
        : (p0?.[1] ?? 440),
    secs: round(len, 5),
    phase: turnsOf(track.ph),
  };
  return {
    node: {
      _tag: 'Envelope',
      curve: 'linear',
      points: [
        [0, 0],
        [round(Math.max(track.rise, 1e-5), 5), 1],
        [round(Math.max(track.t1 - track.t0, track.rise), 5), 1],
        [round(len, 5), 0],
      ],
      of: { _tag: 'Envelope', curve: 'exponential', points: [a0 ?? [0, 1], ...aRest], of: osc },
    },
    at: round(track.t0, 5),
    db: round(top, 2),
  };
};

const ridgeLayer = (ridge: Ridge): Layered => {
  const t0 = ridge.t[0] ?? 0;
  const len = Math.max(0.01, (ridge.t[ridge.t.length - 1] ?? t0) - t0);
  const top = Math.max(...ridge.db);
  const level = ridge.t.map((t, i): readonly [number, number] => [
    round(t - t0, 5),
    round(Math.max(FLOOR, 10 ** (((ridge.db[i] ?? top) - top) / 20)), 6),
  ]);
  const pitch = ridge.t.map((t, i): readonly [number, number] => [
    round(t - t0, 5),
    round(clamp(ridge.f[i] ?? 440, 1, NYQ - 1), 3),
  ]);
  const [l0, ...lRest] = level;
  const [p0, ...pRest] = pitch;
  return {
    node: {
      _tag: 'Fade',
      in: 0.005,
      out: 0.005,
      of: {
        _tag: 'Envelope',
        curve: 'exponential',
        points: [l0 ?? [0, 1], ...lRest],
        of: {
          _tag: 'Osc',
          wave: 'sine',
          pitch: { _tag: 'Points', points: [p0 ?? [0, 440], ...pRest], curve: 'linear' },
          secs: round(len, 5),
        },
      },
    },
    at: round(t0, 5),
    db: round(top, 2),
  };
};

const layerOf = (of: ReadonlyArray<Layered>, secs: number): Node => {
  const [first, ...rest] = of;
  if (first === undefined) return { _tag: 'Noise', color: 'white', secs: 0 };
  return { _tag: 'Layer', secs: round(secs, 4), of: [first, ...rest] };
};

const highpassed = (node: Node): Node => {
  const once = (of: Node): Node => ({
    _tag: 'Filter',
    type: 'highpass',
    hz: RUMBLE_HZ,
    q: round(Math.SQRT1_2, 4),
    of,
  });
  return once(once(node));
};

interface Written {
  readonly sound: CodeSound;
  readonly modes: number;
  readonly tracks: number;
  readonly bands: number;
  readonly points: number;
}

const written = (parts: Parts, options: FitOptions): Written => {
  const { secs } = parts;
  const loudest = Math.max(...parts.bands.map((b) => Math.max(...b.pts.map(([, v]) => v))));
  const peak = Math.max(
    ...parts.strikes.flatMap((s) => s.modes.map((m) => m.a)),
    Math.sqrt(2 * 10 ** (loudest / 10)),
  );
  const quiet = peak * 10 ** (-DROP_DB / 20);
  const modes = parts.strikes.flatMap((s) => strikeLayers(s, secs, quiet));
  const quietLow = options.rumble <= QUIET_RUMBLE;
  const bands = parts.bands
    .filter((b) => Math.max(...b.pts.map(([, v]) => v)) > loudest - DROP_DB)
    .filter((b) => !quietLow || b.hi > RUMBLE_HZ * 1.25)
    .map((b) => (quietLow && b.lo < RUMBLE_HZ ? { ...b, lo: RUMBLE_HZ } : b));
  const noise = bands.map((b) => bandLayer(b, secs));
  let struck: ReadonlyArray<Layered> = [];
  if (modes.length > 0) {
    const layer = layerOf(modes, secs);
    struck = [
      {
        node: parts.fadeOut > 0 ? { _tag: 'Fade', out: round(parts.fadeOut, 4), of: layer } : layer,
      },
    ];
  }
  let play = layerOf(
    [...struck, ...parts.tracks.map(trackLayer), ...parts.ridges.map(ridgeLayer), ...noise],
    secs,
  );
  if (options.use === 'bed') {
    const tilt = seamTilt(parts);
    const gain = (t: number) => round(10 ** ((tilt * t - Math.max(0, tilt * secs)) / 20), 6);
    play = {
      _tag: 'Envelope',
      curve: 'exponential',
      points: [
        [0, gain(0)],
        [round(secs, 4), gain(secs)],
      ],
      of: play,
    };
  }
  if (quietLow) play = highpassed(play);
  if (options.use === 'bed') play = { _tag: 'Loop', crossfade: BED_CROSSFADE, of: play };
  return {
    sound: { play },
    modes: modes.reduce(
      (n, l) =>
        n + (l.node._tag === 'Partials' && !Predicate.isString(l.node.set) ? l.node.set.length : 0),
      0,
    ),
    tracks: parts.tracks.length,
    bands: noise.length,
    points: bands.reduce((n, b) => n + b.pts.length, 0),
  };
};

interface Rung {
  readonly merge: number | undefined;
  readonly modes: number;
}

const WIDTHS = [2.2, 4.4, 8.8, 17.6, 35.2, 1e9];

const rungsOf = (budget: Budget): ReadonlyArray<Rung> => {
  const wider = (than: number | undefined) => WIDTHS.filter((w) => w > (than ?? 0));
  const first = wider(budget.merge).filter((w) => w <= 8.8);
  const mid = first[first.length - 1] ?? budget.merge;
  const halves = (from: number, to: number) => {
    const out: Array<number> = [];
    for (let n = Math.min(from, 512); n >= to; n = Math.floor(n / 2)) out.push(n);
    return out;
  };
  const capped = Math.min(budget.modes, 1024);
  return [
    { merge: budget.merge, modes: budget.modes },
    ...first.map((merge) => ({ merge, modes: budget.modes })),
    ...halves(capped, 16).map((modes) => ({ merge: mid, modes })),
    ...wider(mid).map((merge) => ({ merge, modes: Math.min(16, budget.modes) })),
    ...halves(Math.min(8, budget.modes), 1).map((modes) => ({ merge: 1e9, modes })),
    { merge: 1e9, modes: 0 },
  ];
};

export const fitSound = (
  name: string,
  model: EarshotModel,
  options: FitOptions,
): Result.Result<Fitted, CodeTooLong> => {
  const parts = partsOf(model);
  if (parts.secs > MAX_CODE_SECS)
    return Result.fail(
      CodeTooLong.make({ sound: name, measure: 'length', secs: parts.secs, limit: MAX_CODE_SECS }),
    );
  const budget = BUDGETS[options.size];
  const tracks = reduceTracks(parts.tracks, budget.tracks);
  let work = Infinity;
  for (const rung of rungsOf(budget)) {
    const { strikes, residue } = reduceStrikes(parts.strikes, rung.modes, parts.bands, parts.secs);
    const folded = foldResidue(parts.bands, residue, parts.secs);
    const bands =
      rung.merge === undefined
        ? folded
        : mergeBands(folded, parts.secs, rung.merge, Math.max(budget.tol, 2), parts.most);
    const made = written({ ...parts, strikes, tracks, bands }, options);
    work = boundOf(made.sound.play, () => ({ secs: 0, work: 0 })).work;
    if (work <= MAX_CODE_WORK)
      return Result.succeed({
        ...made,
        kind: model.kind,
        merged: rung.merge,
        highpass: options.rumble <= QUIET_RUMBLE,
        work: round(work, 1),
        left: parts.left,
      });
  }
  return Result.fail(
    CodeTooLong.make({ sound: name, measure: 'work', secs: work, limit: MAX_CODE_WORK }),
  );
};
