import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import type { Hand } from './ink.ts';
import { type SceneSpec, createFilm } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';

const W = 64;
const H = 36;
const DUR = 10;
const KEYS = ['x', 'robe', 'heart'] as const;

describe('f.handsOf', () => {
  test("gives another scene's hands as its own f.hand gives them, on this frame's boil, and refuses a drawing the film does not draw", () => {
    let own: ReadonlyArray<Hand> = [];
    let borrowed: ReadonlyArray<Hand> = [];
    let taker: ReadonlyArray<Hand> = [];
    let unknown: string | undefined;
    const giver = {
      draw: ((f) => {
        own = KEYS.map((k) => f.hand(k));
      }) satisfies SceneSpec['draw'],
    };
    const elsewhere = { draw: (() => undefined) satisfies SceneSpec['draw'] };
    const takes: SceneSpec['draw'] = (f) => {
      const hands = f.handsOf(giver);
      borrowed = KEYS.map((k) => hands(k));
      taker = KEYS.map((k) => f.hand(k));
      unknown = Effect.runSync(
        Effect.try({
          try: () => f.handsOf(elsewhere),
          catch: (e) => (e instanceof Error ? e.message : String(e)),
        }).pipe(
          Effect.match({ onFailure: (m): string | undefined => m, onSuccess: () => undefined }),
        ),
      );
    };
    withDom(() => {
      const film = createFilm({
        fps: 30,
        title: 'hands',
        width: W,
        height: H,
        paper: { base: '#ffffff', tone: '#ffffff', seed: 1 },
        shade: '#ffffff',
        finish: { vignette: 0, grain: 0 },
        scenes: [
          { id: 'giver', min: DUR, draw: giver.draw },
          { id: 'taker', min: DUR, draw: takes },
        ],
      });
      const { ctx } = recorder(W, H);
      film.render(ctx, 0.5 * DUR);
      film.render(ctx, 1.5 * DUR);
    });
    expect(own).toHaveLength(3);
    expect(borrowed.map((h) => h.seed)).toEqual(own.map((h) => h.seed));
    expect(borrowed.map((h) => h.boil)).toEqual(taker.map((h) => h.boil));
    expect(borrowed.map((h) => h.boil)).not.toEqual(own.map((h) => h.boil));
    expect(borrowed.map((h) => h.seed)).not.toEqual(taker.map((h) => h.seed));
    expect(unknown).toContain('scene taker');
    expect(unknown).toContain('0 scenes draw it');
  });
});
