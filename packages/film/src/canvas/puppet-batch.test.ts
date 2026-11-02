// What decides when consecutive puppets share one copy onto the frame
// (`canvas/puppet-batch.ts`): a puppet drawn on the same context under the
// same filter, alpha, compositing and shadow joins the pending copy and grows
// its box; any of those changed, or another context, makes the pending copy
// first, under its own state; and a batch closes, copied, when its draw
// returns or throws.

import { describe, expect, test } from 'bun:test';
import { recorder } from './fixtures/stand-in.ts';
import { type Box, applyCopyKey, batched, copyKeyOf, isBatched, joinCopy } from './puppet-batch.ts';

const A: Box = [10, 20, 40, 60];
const B: Box = [30, 5, 90, 50];

describe('a puppet draw and the pending copy', () => {
  test('with none pending, starts one in its own box and makes none', () => {
    const { ctx } = recorder();
    const joined = joinCopy(undefined, copyKeyOf(ctx), A);
    expect(joined.flush).toBeUndefined();
    expect(joined.pending.box).toEqual(A);
  });

  test('on the same context in the same state, joins it, the box grown to hold both', () => {
    const { ctx } = recorder();
    ctx.filter = 'blur(2px) contrast(0.8)';
    const first = joinCopy(undefined, copyKeyOf(ctx), A).pending;
    const joined = joinCopy(first, copyKeyOf(ctx), B);
    expect(joined.flush).toBeUndefined();
    expect(joined.pending.box).toEqual([10, 5, 90, 60]);
    expect(joined.pending.key).toBe(first.key);
  });

  const changes: ReadonlyArray<readonly [string, (ctx: CanvasRenderingContext2D) => void]> = [
    ['filter', (ctx) => (ctx.filter = 'blur(3px)')],
    ['alpha', (ctx) => (ctx.globalAlpha = 0.5)],
    ['compositing', (ctx) => (ctx.globalCompositeOperation = 'multiply')],
    ['shadow colour', (ctx) => (ctx.shadowColor = 'rgba(0, 0, 0, 0.5)')],
    ['shadow blur', (ctx) => (ctx.shadowBlur = 4)],
    ['shadow offset', (ctx) => (ctx.shadowOffsetY = 2)],
  ];

  test.each(changes)(
    'under another %s, makes the pending copy first and starts a new one',
    (_, change) => {
      const { ctx } = recorder();
      const first = joinCopy(undefined, copyKeyOf(ctx), A).pending;
      change(ctx);
      const joined = joinCopy(first, copyKeyOf(ctx), B);
      expect(joined.flush).toBe(first);
      expect(joined.pending.box).toEqual(B);
      expect(joined.pending.key).toEqual(copyKeyOf(ctx));
    },
  );

  test('on another context, makes the pending copy first', () => {
    const [one, two] = [recorder().ctx, recorder().ctx];
    const first = joinCopy(undefined, copyKeyOf(one), A).pending;
    const joined = joinCopy(first, copyKeyOf(two), B);
    expect(joined.flush).toBe(first);
    expect(joined.pending.key.ctx).toBe(two);
  });

  test("a pending copy's state is set back on its context to be made, whatever the scene set since", () => {
    const { ctx } = recorder();
    ctx.filter = 'blur(2px)';
    ctx.globalAlpha = 0.7;
    const key = copyKeyOf(ctx);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 3;
    applyCopyKey(ctx, key);
    expect(copyKeyOf(ctx)).toEqual(key);
  });
});

describe('a batch', () => {
  test('is open on its context while its draw runs, on no other, and closes once when it returns', () => {
    const [ctx, other] = [recorder().ctx, recorder().ctx];
    const seen: Array<readonly [boolean, boolean]> = [];
    let closed = 0;
    batched(
      ctx,
      () => seen.push([isBatched(ctx), isBatched(other)]),
      () => (closed += 1),
    );
    expect(seen).toEqual([[true, false]]);
    expect(closed).toBe(1);
    expect(isBatched(ctx)).toBe(false);
  });

  test('closes, copied, when its draw throws, and leaves no batch open for the next frame', () => {
    const { ctx } = recorder();
    let closed = 0;
    expect(() =>
      batched(
        ctx,
        () => {
          // oxlint-disable-next-line effect/noThrowStatement, effect/noNewError -- a scene's draw that throws, as `f.puppet` throws for a dress it cannot wear
          throw new Error('a scene that fails');
        },
        () => (closed += 1),
      ),
    ).toThrow('a scene that fails');
    expect(closed).toBe(1);
    expect(isBatched(ctx)).toBe(false);
  });

  test('opened inside another on its context closes with a copy, the outer still open until it returns', () => {
    const { ctx } = recorder();
    const closes: boolean[] = [];
    const close = () => closes.push(isBatched(ctx));
    batched(ctx, () => batched(ctx, () => undefined, close), close);
    expect(closes).toEqual([true, false]);
  });
});
