// The clip rules (`clips.ts`): a clip passes when its figure keeps its height
// and its feet line, every band's chain IoU reaches its bar and every band
// that expects drawings names them on enough of its frames; the holds are
// the longest start and end runs over the hold bar; a fal call is allowed
// while the member's and the week's spend stay within their limits; and a
// committed clip is adopted only when its provenance is the request's and its
// mp4 is the one the provenance names, else it is missing, with the request.

import { describe, expect, test as it } from 'bun:test';
import { DateTime, Option, Schema } from 'effect';
import {
  CLIP_BARS,
  ClipMissing,
  type ClipNumbers,
  type ClipRequest,
  FAL_LIMITS,
  type LedgerEntry,
  adoptClip,
  clipRequestOf,
  clipVerdict,
  falSpendAllowed,
  holdsOf,
} from './clips.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-01T12:00:00Z');
const iso = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));
const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

/** Clip B as the base lock reads it: its height and feet range, its two bands and the whole clip. */
const CLIP_B: ClipNumbers = {
  heightRatio: [0.991, 1.0015],
  feetPx: [0, 1],
  bands: [
    {
      from: 0,
      to: 40,
      iou: 0.9098,
      expect: ['lead-feast/turnaround-front'],
      named: { 'lead-feast/turnaround-front': 39, 'lead-feast/single-single-1': 2 },
    },
    {
      from: 41,
      to: 123,
      iou: 0.9132,
      expect: ['lead-feast/single-single-1'],
      named: { 'lead-feast/single-single-1': 83 },
    },
    {
      from: 0,
      to: 123,
      iou: 0.9121,
      expect: [],
      named: { 'lead-feast/turnaround-front': 39, 'lead-feast/single-single-1': 85 },
    },
  ],
};

/** reader8-base on clip B: front named on all 124 frames, the end band's IoU 0.8851. */
const READER8_BASE: ClipNumbers = {
  ...CLIP_B,
  bands: [
    { ...CLIP_B.bands[0]!, named: { 'lead-feast/turnaround-front': 41 } },
    { ...CLIP_B.bands[1]!, iou: 0.8851, named: { 'lead-feast/turnaround-front': 83 } },
    { ...CLIP_B.bands[2]!, named: { 'lead-feast/turnaround-front': 124 } },
  ],
};

/** The bar each failure names: its first word. */
const barsOf = (fails: ReadonlyArray<string>) =>
  [...new Set(fails.map((f) => f.split(/[:\s]/)[0]))].toSorted();

describe('clip bars', () => {
  it('are the spec numbers, and the fal limits in USD', () => {
    expect(CLIP_BARS).toEqual({ heightRatio: 0.03, feetPx: 4, named: 0.9, iou: 0.88, hold: 0.95 });
    expect(FAL_LIMITS).toEqual({ member: 5, week: 15 });
  });

  it('pass clip B as the base lock measured it', () => {
    expect(clipVerdict(CLIP_B)).toEqual({ pass: true, fails: [] });
  });

  it('fail reader8-base, which names front on every frame, on the named bar only', () => {
    const v = clipVerdict(READER8_BASE);
    expect(v.pass).toBe(false);
    expect(barsOf(v.fails)).toEqual(['named']);
  });

  it('hold at each edge and fail one step past it', () => {
    const lo = 1 - CLIP_BARS.heightRatio;
    const hi = 1 + CLIP_BARS.heightRatio;
    expect(clipVerdict({ ...CLIP_B, heightRatio: [lo, hi] }).pass).toBe(true);
    expect(barsOf(clipVerdict({ ...CLIP_B, heightRatio: [lo - 1e-9, 1] }).fails)).toEqual([
      'heightRatio',
    ]);
    expect(barsOf(clipVerdict({ ...CLIP_B, heightRatio: [1, hi + 1e-9] }).fails)).toEqual([
      'heightRatio',
    ]);
    expect(clipVerdict({ ...CLIP_B, feetPx: [-4, 4] }).pass).toBe(true);
    expect(barsOf(clipVerdict({ ...CLIP_B, feetPx: [-4.001, 0] }).fails)).toEqual(['feetPx']);
    expect(barsOf(clipVerdict({ ...CLIP_B, feetPx: [0, 4.001] }).fails)).toEqual(['feetPx']);
    const band = (iou: number, named: number) => ({
      ...CLIP_B,
      bands: [{ from: 0, to: 9, iou, expect: ['m/a'], named: { 'm/a': named, 'm/b': 10 - named } }],
    });
    expect(clipVerdict(band(0.88, 9)).pass).toBe(true);
    expect(barsOf(clipVerdict(band(0.88 - 1e-9, 9)).fails)).toEqual(['iou']);
    expect(barsOf(clipVerdict(band(0.88, 8)).fails)).toEqual(['named']);
    expect(barsOf(clipVerdict(band(0.5, 0)).fails)).toEqual(['iou', 'named']);
  });

  it('name every failed bar, and a frame that is not a number fails its bar', () => {
    const v = clipVerdict({
      heightRatio: [Number.NaN],
      feetPx: [Number.NaN],
      bands: [{ from: 0, to: 0, iou: Number.NaN, expect: ['m/a'], named: {} }],
    });
    expect(v.pass).toBe(false);
    expect(barsOf(v.fails)).toEqual(['feetPx', 'heightRatio', 'iou', 'named']);
  });

  it("count only the expected drawings' frames, over the band's own length", () => {
    const v = clipVerdict({
      heightRatio: [1],
      feetPx: [0],
      bands: [
        {
          from: 10,
          to: 19,
          iou: 0.9,
          expect: ['m/a', 'm/b'],
          named: { 'm/a': 5, 'm/b': 4, 'm/c': 1 },
        },
      ],
    });
    expect(v.pass).toBe(true);
  });
});

describe('clip holds', () => {
  it('are the longest prefix over the hold bar against the first frame and the longest suffix against the last', () => {
    const first = [1, 0.99, ...Array.from({ length: 10 }, () => 0.96), 0.9499, 0.99, 0.5];
    const last = [0.99, 0.5, 0.9, 0.95, 0.97, 1];
    expect(holdsOf(first, last)).toEqual({ start: 12, end: 3 });
    expect(holdsOf([], [])).toEqual({ start: 0, end: 0 });
    expect(holdsOf([0.95, 0.95], [0.95, 0.95])).toEqual({ start: 2, end: 2 });
    expect(holdsOf([0.9], [0.9])).toEqual({ start: 0, end: 0 });
  });
});

describe('fal spend', () => {
  const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
    at: iso(NOW - DAY),
    member: 'sower',
    clip: 'sow/clip-a',
    endpoint: 'minimax/h3-max/image-to-video',
    requestId: 'r',
    seconds: 5,
    usd: 1,
    kept: true,
    ...over,
  });

  it("is allowed up to the member's limit and refused past it", () => {
    const four = [1, 2, 3, 4].map(() => entry({}));
    expect(falSpendAllowed(four, 'sower', 1, NOW)).toBe(true);
    expect(falSpendAllowed(four, 'sower', 1.01, NOW)).toBe(false);
    expect(falSpendAllowed(four, 'feast-mother', 5, NOW)).toBe(true);
  });

  it("is allowed up to the week's limit, external spend included, and refused past it", () => {
    const week = [
      entry({ member: 'a', usd: 5 }),
      entry({ member: 'b', usd: 5, external: true }),
      entry({ member: 'c', usd: 4 }),
    ];
    expect(falSpendAllowed(week, 'd', 1, NOW)).toBe(true);
    expect(falSpendAllowed(week, 'd', 1.01, NOW)).toBe(false);
  });

  it('counts a call in the week only after the seven days before now begin', () => {
    const at = (ms: number) => [
      entry({ member: 'a', usd: 5, at: iso(ms) }),
      entry({ member: 'b', usd: 5 }),
      entry({ member: 'c', usd: 5 }),
    ];
    expect(falSpendAllowed(at(NOW - 7 * DAY), 'd', 1, NOW)).toBe(true);
    expect(falSpendAllowed(at(NOW - 7 * DAY + 1), 'd', 1, NOW)).toBe(false);
  });

  it('counts every call of the member in its limit, however old', () => {
    const old = [entry({ usd: 4.5, at: '2026-01-01T00:00:00Z', external: true })];
    expect(falSpendAllowed(old, 'sower', 0.5, NOW)).toBe(true);
    expect(falSpendAllowed(old, 'sower', 0.51, NOW)).toBe(false);
  });
});

describe('clip adoption', () => {
  const first = { path: 'cast/sower/cutout/sow/clip/clip-a.first.png', sha256: 'a'.repeat(64) };
  const last = { path: 'cast/sower/cutout/sow/clip/clip-a.last.png', sha256: 'd'.repeat(64) };
  const request: ClipRequest = clipRequestOf({ prompt: 'p', seed: 7, first, last: Option.none() });
  const withLast: ClipRequest = clipRequestOf({
    prompt: 'p',
    seed: 7,
    first,
    last: Option.some(last),
  });
  const output = { width: 704, height: 1440, fps: 24, frames: 124, sha256: 'b'.repeat(64) };
  const provenanceOf = (r: ClipRequest) => ({
    ...structuredClone(r),
    requestId: 'r1',
    made: '2026-11-01',
    usd: 0.1625,
    output,
    map: { x0: -182, y0: 68, scale: 2 },
  });
  const CLIP = 'sower/sow/clip-a';

  it('builds a request at the house settings', () => {
    expect(request).toEqual({
      endpoint: 'minimax/h3-max/image-to-video',
      input: {
        prompt: 'p',
        prompt_expansion_mode: 'disabled',
        duration: 5,
        resolution: '768P',
        seed: 7,
      },
      frames: { first },
    });
    expect(withLast.frames.last).toEqual(last);
  });

  it('adopts a committed clip whose provenance is the request and whose mp4 is the one it names', () => {
    for (const r of [request, withLast]) {
      const got = adoptClip(CLIP, r, { provenance: provenanceOf(r), mp4Sha256: output.sha256 });
      expect(got._tag).toBe('Adopt');
      if (got._tag === 'Adopt') expect(got.provenance.requestId).toBe('r1');
    }
  });

  it('is ClipMissing, carrying the request as JSON, when the clip or its provenance is absent or differs', () => {
    const p = provenanceOf(request);
    const firstAs = (f: Partial<typeof first>) => ({ ...p, frames: { first: { ...first, ...f } } });
    const cases: ReadonlyArray<readonly [string, ClipRequest, Parameters<typeof adoptClip>[2]]> = [
      ['nothing committed', request, {}],
      ['an mp4 with no provenance', request, { mp4Sha256: output.sha256 }],
      ['a provenance with no mp4', request, { provenance: provenanceOf(request) }],
      ['another mp4', request, { provenance: provenanceOf(request), mp4Sha256: 'c'.repeat(64) }],
      [
        'a provenance that is not one',
        request,
        { provenance: { requestId: 'r1' }, mp4Sha256: output.sha256 },
      ],
      [
        'another seed',
        request,
        { provenance: { ...p, input: { ...p.input, seed: 11 } }, mp4Sha256: output.sha256 },
      ],
      [
        'another prompt',
        request,
        { provenance: { ...p, input: { ...p.input, prompt: 'q' } }, mp4Sha256: output.sha256 },
      ],
      [
        'another endpoint',
        request,
        { provenance: { ...p, endpoint: 'x' }, mp4Sha256: output.sha256 },
      ],
      [
        'another first frame',
        request,
        { provenance: firstAs({ sha256: 'e'.repeat(64) }), mp4Sha256: output.sha256 },
      ],
      [
        'a first frame at another path',
        request,
        { provenance: firstAs({ path: 'x.png' }), mp4Sha256: output.sha256 },
      ],
      [
        'a last frame the request lacks',
        request,
        { provenance: provenanceOf(withLast), mp4Sha256: output.sha256 },
      ],
      [
        'no last frame where the request has one',
        withLast,
        { provenance: provenanceOf(request), mp4Sha256: output.sha256 },
      ],
    ];
    for (const [why, r, found] of cases) {
      const got = adoptClip(CLIP, r, found);
      expect([why, Schema.is(ClipMissing)(got)]).toEqual([why, true]);
      if (got._tag !== 'ClipMissing') continue;
      expect(got.clip).toBe(CLIP);
      expect(got.reason.length).toBeGreaterThan(0);
      expect(decodeJson(got.request)).toEqual(r);
    }
  });
});
