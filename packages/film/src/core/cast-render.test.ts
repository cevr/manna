import { describe, expect, test } from 'bun:test';
import { Option, Result, Schema } from 'effect';
import {
  type CastRender,
  CastRenderJson,
  answerFinding,
  castRenderMarkdown,
  nextRender,
} from './cast-render.ts';

const RENDER: CastRender = {
  film: 'in-its-order',
  member: 'lead-feast',
  n: 2,
  at: '2026-10-26T20:00:00.000Z',
  riv: 'ab'.repeat(32),
  kinds: { turnaround: { scale: 1.43, sheet: 'turnaround.render.png' } },
  views: [
    {
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
      rows: [
        { name: 'jaw width', unit: 'ratio', concept: 0.8, scene: 0.9, diff: 12.5, flagged: true },
      ],
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
    },
    {
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
    },
  ],
};

describe('a cast render', () => {
  test('counts up from one past the highest render made', () => {
    expect(nextRender([])).toBe(1);
    expect(nextRender([1, 3, 2])).toBe(4);
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
