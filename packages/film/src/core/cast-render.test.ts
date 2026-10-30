import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import {
  type CastRender,
  type CastViewRendered,
  CastRenderJson,
  answerFinding,
  castRenderMarkdown,
  castViewLines,
  fitHeld,
} from './cast-render.ts';
import type { FitRow } from './fit-rows.ts';

const FRONT: CastViewRendered = {
  kind: 'turnaround',
  view: 'front',
  box: [18, 194, 265, 857],
  files: {
    concept: 'turnaround-front.concept.png',
    render: 'turnaround-front.render.png',
    side: 'turnaround-front.side.png',
    table: 'turnaround-front.md',
    critique: 'turnaround-front.critique.md',
  },
  rows: [{ name: 'jaw width', unit: 'ratio', concept: 0.8, scene: 0.9, diff: 12.5, flagged: true }],
  critique: 'taken',
  unmatched: Option.none(),
  skipped: Option.none(),
  findings: [
    {
      id: 'f1',
      aspect: 'palette',
      what: 'The sash is a shade warmer.',
      where: Option.none(),
      stands: Option.none(),
    },
  ],
};

const BACK: CastViewRendered = {
  kind: 'turnaround',
  view: 'back',
  box: [761, 194, 1018, 857],
  files: {
    concept: 'turnaround-back.concept.png',
    render: 'turnaround-back.render.png',
    side: 'turnaround-back.side.png',
    table: 'turnaround-back.md',
    critique: 'turnaround-back.critique.md',
  },
  rows: [],
  unmatched: Option.some('the kept view reads no figure: no pair of eyes'),
  critique: 'skipped',
  skipped: Option.some('asked with --no-critique'),
  findings: [],
};

const RENDER: CastRender = {
  film: 'in-its-order',
  member: 'lead-feast',
  n: 2,
  at: '2026-10-26T20:00:00.000Z',
  riv: 'ab'.repeat(32),
  kinds: { turnaround: { scale: 1.43, sheet: 'turnaround.render.png' } },
  views: [FRONT, BACK],
};

describe('a cast render', () => {
  test('prints each view: why it is unmatched only when it is, then its findings', () => {
    expect(RENDER.views.map(castViewLines)).toEqual([
      [
        'turnaround-front: rows=1 flagged=jaw width critique=taken findings=1',
        '  turnaround-front/f1 palette: The sash is a shade warmer.',
      ],
      [
        'turnaround-back: rows=0 flagged=none unmatched="the kept view reads no figure: no pair of eyes" critique=skipped findings=0',
      ],
    ]);
  });

  test('answers a finding it holds, in its record, and keeps every other as it was', () => {
    const answered = Result.getOrThrow(
      answerFinding(RENDER, 'turnaround-front/f1', ' The sheet paints it so. '),
    );
    expect(answered.views[0]?.findings[0]?.stands).toEqual(Option.some('The sheet paints it so.'));
    expect(answered.views[1]).toEqual(RENDER.views[1]);
    expect(Schema.decodeSync(CastRenderJson)(Schema.encodeSync(CastRenderJson)(answered))).toEqual(
      answered,
    );
  });

  test('writes a reason only where it has one: an unmatched view its why, a measured one none', () => {
    const written = Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(
      Schema.encodeSync(CastRenderJson)(RENDER),
    );
    expect(written).toMatchObject({
      views: [
        { view: 'front', critique: 'taken', findings: [{ id: 'f1', aspect: 'palette' }] },
        {
          view: 'back',
          unmatched: 'the kept view reads no figure: no pair of eyes',
          skipped: 'asked with --no-critique',
        },
      ],
    });
    expect(written).not.toHaveProperty('views.0.unmatched');
  });

  test('refuses an answer to a finding it does not hold, and one that says no why', () => {
    expect(Result.isFailure(answerFinding(RENDER, 'turnaround-front/f2', 'why'))).toBe(true);
    expect(Result.isFailure(answerFinding(RENDER, 'turnaround-back/f1', 'why'))).toBe(true);
    expect(Result.isFailure(answerFinding(RENDER, 'turnaround-front/f1', '  '))).toBe(true);
  });

  test('says each view in its summary: its side-by-side, its flagged rows, each finding open or answered, a skip as a skip', () => {
    const open = castRenderMarkdown(RENDER);
    expect(open).toContain('![turnaround front](turnaround-front.side.png)');
    expect(open).toContain('- jaw width: concept 0.8, render 0.9');
    expect(open).toContain('- f1 **palette**: The sash is a shade warmer. — open');
    expect(open).toContain('skipped (asked with --no-critique)');
    expect(open).toContain('Unmatched: the kept view reads no figure: no pair of eyes');
    const answered = Result.getOrThrow(
      answerFinding(RENDER, 'turnaround-front/f1', 'The sheet paints it so.'),
    );
    expect(castRenderMarkdown(answered)).toContain('— stands: The sheet paints it so.');
  });
});

const row = (
  name: string,
  value: number,
  pass: boolean,
  band: FitRow['band'] = 'figure',
): FitRow => ({
  name,
  band,
  part: 'figure',
  value,
  bar: { max: 3 },
  pass,
});

describe('fit rows in a cast render', () => {
  test('hold a critique back with each failing row, or with none measured, and never one whose rows pass', () => {
    expect(fitHeld([row('silhouette.edge', 1.5, true, 'head')])).toEqual(Option.none());
    expect(
      fitHeld([
        row('silhouette.edge', 5.49, false, 'head'),
        row('holes', 0, true),
        row('slivers', 9, false),
      ]),
    ).toEqual(Option.some('fit: silhouette.edge/head 5.49 (bar ≤ 3), slivers 9 (bar ≤ 3)'));
    expect(fitHeld([])).toEqual(Option.some('fit: no rows (a crop reads no figure)'));
  });

  test('are printed with each view and summed up at the top of its summary, the failing first', () => {
    const front = { ...FRONT, fit: [row('holes', 0, true)] };
    const back = { ...BACK, fit: [row('silhouette.edge', 5.49, false, 'head')] };
    const fitted: CastRender = { ...RENDER, views: [front, back] };
    expect(castViewLines(back)[0]).toContain('fit=silhouette.edge/head');
    expect(castViewLines(front)[0]).toContain('fit=pass');
    const md = castRenderMarkdown(fitted);
    expect(md.indexOf('## Fit rows')).toBeLessThan(md.indexOf('## turnaround front'));
    expect(md.indexOf('| turnaround back | silhouette.edge/head | 5.49')).toBeLessThan(
      md.indexOf('| turnaround front | holes | 0'),
    );
    expect(md).toContain('1 of 2 views pass every bar');
  });

  test("name the house's bar beside a bar of the view's own, and none beside the house's", () => {
    const md = castRenderMarkdown({
      ...RENDER,
      views: [{ ...FRONT, fit: [row('holes', 0, true), row('silhouette.edge', 1, true, 'head')] }],
    });
    expect(md).toContain('| turnaround front | holes | 0 | ≤ 3 (house ≤ 8) |');
    expect(md).toContain('| turnaround front | silhouette.edge/head | 1 | ≤ 3 |');
  });

  test('a record made before them decodes with none, and one with them keeps them', () => {
    const plain = Schema.decodeSync(CastRenderJson)(Schema.encodeSync(CastRenderJson)(RENDER));
    expect(plain.views.map((v) => 'fit' in v)).toEqual([false, false]);
    const kept = { ...RENDER, views: [{ ...FRONT, fit: [row('holes', 0, true)] }] };
    expect(
      Schema.decodeSync(CastRenderJson)(Schema.encodeSync(CastRenderJson)(kept)).views[0]?.fit,
    ).toEqual([row('holes', 0, true)]);
  });

  test('a cut-out view keeps the ground its fit rows read over, and a view without one has none', () => {
    const kept = { ...RENDER, views: [{ ...FRONT, ground: [251, 246, 233] as const }, FRONT] };
    const read = Schema.decodeSync(CastRenderJson)(Schema.encodeSync(CastRenderJson)(kept)).views;
    expect(read.map((v) => 'ground' in v)).toEqual([true, false]);
    expect(read[0]?.ground).toEqual([251, 246, 233]);
  });
});
