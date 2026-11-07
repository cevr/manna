import * as BunServices from '@effect/platform-bun/BunServices';
import { clamp, ease } from '@manna/film/core';
import { Effect, Layer } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { filmFolder, type PlacedShot, shotsOf } from '../../../library/storybook/films.ts';
import type { Over, PaintingFrame } from '../../../library/storybook/scene.ts';
import { timesOf } from '../../../library/storybook/shot.ts';
import { fonts } from '../palette.ts';
import { script } from '../script.ts';
import { GRID } from './grid.ts';
import { inItsOrder } from './index.ts';
import { LETTER_WORDS } from './shots/cold.ts';
import { BOOK_WORDS, milkPour, PRESENT } from './shots/milk.ts';
import { COLD_STORY, MILK_STORY, STORIES, TITLE_STORY } from './stories.ts';

/** One glyph a drawing over a shot put down: its character, its centre on the frame, how much of it the pen has written (its write clip's share of its width, 1 when unclipped), and the font it is set in. */
interface Glyph {
  readonly ch: string;
  readonly x: number;
  readonly y: number;
  readonly shown: number;
  readonly font: string;
}

/** What a drawing over a shot did on one frame: the glyphs it lettered, the hands it lettered them with, and the fills it laid. */
interface Drawn {
  readonly glyphs: Array<Glyph>;
  readonly hands: Array<string>;
  readonly fills: { n: number };
  readonly ellipses: Array<{ readonly x: number; readonly y: number; readonly rx: number }>;
  readonly strokes: Array<ReadonlyArray<readonly [number, number]>>;
}

/** How far each of milk-pour's cues has run, as a drawing over it reads them: the pour laid, the cup filled, the stream stopped and the cup brought forward. */
const pourAt =
  (pour: number, fill: number, full: number, present = 0) =>
  (cue: string): number =>
    new Map([
      ['milk-pour:pour', pour],
      ['milk-pour:fill', fill],
      ['milk-pour:full', full],
      ['milk-pour:present', present],
    ]).get(cue) ?? 0;

/** The frame's size. */
const [W, H] = [GRID.size.width, GRID.size.height];

/**
 * A context that draws nothing and records each glyph `write` lays (its
 * centre: the translate it lays it at; the share of its width its write
 * clip shows, the clip `write` lays from half its width and 4 px left of
 * its centre; and its font), tracking translate and scale; a glyph's width
 * is half its type's size.
 */
const recording = (drawn: Drawn) => {
  const stack: Array<readonly [number, number, number, number]> = [];
  let m: readonly [number, number, number, number] = [1, 1, 0, 0];
  let font = '';
  let shown = 1;
  let path: Array<readonly [number, number]> = [];
  const sizeOf = () => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 0);
  return {
    save: () => stack.push(m),
    restore: () => {
      m = stack.pop() ?? m;
    },
    translate: (x: number, y: number) => {
      m = [m[0], m[1], m[2] + m[0] * x, m[3] + m[1] * y];
    },
    scale: (sx: number, sy: number) => {
      m = [m[0] * sx, m[1] * sy, m[2], m[3]];
    },
    rotate: () => {},
    beginPath: () => {
      path = [];
    },
    moveTo: (x: number, y: number) => path.push([x, y]),
    lineTo: (x: number, y: number) => path.push([x, y]),
    closePath: () => {},
    arc: () => {},
    ellipse: (x: number, y: number, rx: number) =>
      drawn.ellipses.push({ x: m[2] + m[0] * x, y: m[3] + m[1] * y, rx: m[0] * rx }),
    fill: () => {
      drawn.fills.n += 1;
    },
    stroke: () => drawn.strokes.push(path),
    rect: (x: number, _y: number, w: number) => {
      shown = [1, w / (-2 * x)][Number(x < 0)] ?? 1;
    },
    clip: () => {},
    fillRect: () => {
      drawn.fills.n += 1;
    },
    createLinearGradient: () => ({ addColorStop: () => {} }),
    measureText: (text: string) => ({
      width: Array.from(text).length * sizeOf() * 0.5,
      actualBoundingBoxAscent: sizeOf() * 0.8,
      actualBoundingBoxDescent: sizeOf() * 0.2,
    }),
    fillText: (ch: string) => {
      drawn.glyphs.push({ ch, x: m[2], y: m[3], shown, font });
      shown = 1;
    },
    strokeText: () => {},
    get font() {
      return font;
    },
    set font(f: string) {
      font = f;
    },
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    textBaseline: '',
    textAlign: '',
    lineWidth: 1,
    lineJoin: '',
    lineCap: '',
    direction: '',
  } as unknown as CanvasRenderingContext2D;
};

/** What `over` draws on a frame whose cues have run as `at` gives them. */
const drawnBy = (over: Over, at: (cue: string) => number, t = 0): Drawn => {
  const drawn: Drawn = { glyphs: [], hands: [], fills: { n: 0 }, ellipses: [], strokes: [] };
  const f: PaintingFrame = {
    ctx: recording(drawn),
    t,
    w: W,
    h: H,
    at,
    hand: (key) => {
      drawn.hands.push(String(key));
      return { boil: 0, seed: 1 };
    },
    painting: () => {},
  };
  over.draw(f);
  return drawn;
};

/** The words a beat's narration speaks from mark `from` to the next `{/}` or `{//}`, its marks taken out, without spaces. */
const spoken = (beat: string, from: string): string => {
  const say = script.find((b) => b.id === beat)?.say ?? '';
  const after = say.slice(say.indexOf(`{${from}}`));
  const end = after.search(/\{\/\/?\}/);
  return after
    .slice(0, end)
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, '');
};

/** A box's share of the frame. */
const shareOfFrame = (o: Over) => (o.box.w * o.box.h) / (W * H);

/** The glyphs of `drawn` outside `over`'s box or the frame. */
const strays = (over: Over, drawn: Drawn) =>
  drawn.glyphs.filter(
    (g) =>
      g.x < Math.max(0, over.box.x) ||
      g.x > Math.min(W, over.box.x + over.box.w) ||
      g.y < Math.max(0, over.box.y) ||
      g.y > Math.min(H, over.box.y + over.box.h),
  );

/** The act's two lettered quotations: their scene, the insert they are lettered on, the words the take speaks for them, the reference lettered after them, the cue that writes them and the cue that cuts away from them. */
const QUOTES = [
  {
    story: COLD_STORY,
    shot: 'cold-scroll',
    words: spoken('cold', 'quote'),
    cite: 'Hebrews 5:12',
    lines: LETTER_WORDS,
  },
  {
    story: MILK_STORY,
    shot: 'milk-book',
    words: spoken('milk', 'newborn'),
    cite: '1 Peter 2:2',
    lines: BOOK_WORDS,
  },
] as const;

// oxlint-disable-next-line effect/noAsyncFunction -- read once at module evaluation, so no case pays the read inside its time limit (film/no-lazy-test-fixture)
const placed = await Effect.runPromise(
  shotsOf(inItsOrder).pipe(
    Effect.provide([filmFolder.pipe(Layer.provide(BunServices.layer)), BunServices.layer]),
  ),
);

/** How far each cue of a laid-out shot's scene has run at the shot's own time `t`, eased as the film's frame eases it (`cueProgress`): what the film hands a drawing over the shot as `f.at`. */
const cuesAt =
  (p: PlacedShot, t: number) =>
  (name: string): number => {
    const c = p.scene.cues.get(name);
    if (!c) return 0;
    const now = (p.shot.from ?? 0) + t;
    if (c.dur <= 0) return Number(now >= c.start);
    return ease[c.ease](clamp((now - c.start) / c.dur));
  };

/** What `over` draws at each frame of its laid-out shot, as the film draws it there: each frame's time and the glyphs it lettered. */
const framesOf = (over: Over, p: PlacedShot) =>
  timesOf(p.shot).map((t) => ({ t, glyphs: drawnBy(over, cuesAt(p, t), t).glyphs }));

describe("In Its Order's drawings over its shots", () => {
  test('holds each lettered verse whole on its insert at least 0.25 s a word before the cut, read on the drawing at every frame of its laid-out shot (every glyph down and wholly written), its writing starting on the verse’s first word, the shot’s first frame (orchestrator ruling, round 2: 1 Pet 2:2 ≥ 3.75 s whole; verifier r2, M1)', () => {
    const short = QUOTES.flatMap(({ story, shot, lines }) => {
      const over = story.over.find((o) => o.shot === shot);
      const p = placed.find((q) => q.shot.id === shot);
      if (!over || !p) return [`${shot}: no drawing over it, or no shot`];
      const all = drawnBy(over, () => 1).glyphs.length;
      const frames = framesOf(over, p).map(({ t, glyphs }) => ({
        t,
        some: glyphs.length > 0,
        whole: glyphs.length === all && glyphs.every((g) => g.shown >= 1),
      }));
      const firstInk = frames.find((f) => f.some)?.t ?? Number.POSITIVE_INFINITY;
      const whole = frames.findLastIndex((f) => !f.whole);
      const from = frames[whole + 1]?.t ?? p.shot.duration;
      const words = lines
        .slice(0, -1)
        .flatMap((l) => l.text.split(/\s+/))
        .filter((w) => w !== '').length;
      const held = p.shot.duration - from;
      return [
        ...[`${shot}: first ink at ${firstInk.toFixed(2)} s`].filter(
          () => firstInk > 1 / p.shot.fps + 1e-6,
        ),
        ...[`${shot}: whole ${held.toFixed(2)} s for ${words} words`].filter(
          () => held < 0.25 * words,
        ),
      ];
    });
    expect(short).toEqual([]);
  });

  test('sets every glyph of both verses in the film’s inked hand, never the cards’ serif, at every frame of its laid-out shot (the orchestrator’s round-2 ruling: “lettered in an inked hand (not the cards’ serif)”; verifier r2, M2)', () => {
    const wrong = QUOTES.flatMap(({ story, shot }) => {
      const over = story.over.find((o) => o.shot === shot);
      const p = placed.find((q) => q.shot.id === shot);
      if (!over || !p) return [`${shot}: no drawing over it, or no shot`];
      const faces = new Set(framesOf(over, p).flatMap(({ glyphs }) => glyphs.map((g) => g.font)));
      return [
        ...[`${shot}: no glyph`].filter(() => faces.size === 0),
        ...[...faces].filter((f) => !f.includes(`"${fonts.hand}"`)).map((f) => `${shot}: ${f}`),
      ];
    });
    expect(wrong).toEqual([]);
  });

  test('lays no card in act 1: the quotes come off the black cards (the owner, ask a11de5e2b65)', () => {
    expect(STORIES.map((s) => s.cards.length)).toEqual([0, 0, 0]);
  });

  test('letters each act-1 quotation in its shot, word for word as the take speaks it, through the film’s lettering hand: every glyph inside its drawing’s box, which leaves at least two thirds of the frame to the scene around it', () => {
    const wrong = QUOTES.flatMap(({ story, shot, words, cite }) => {
      const over = story.over.find((o) => o.shot === shot);
      if (!over) return [`${shot}: no drawing over it`];
      const drawn = drawnBy(over, () => 1);
      const lettered = drawn.glyphs.map((g) => g.ch).join('');
      return [
        ...[`${words}${cite.replace(/\s+/g, '')}`].filter((w) => w !== lettered),
        ...[`${shot}: no hand`].filter(() => drawn.hands.length === 0),
        ...strays(over, drawn).map(
          (g) => `${shot}: ${g.ch} at ${g.x.toFixed(0)}, ${g.y.toFixed(0)}`,
        ),
        ...[`${shot}: box ${shareOfFrame(over).toFixed(2)} of the frame`].filter(
          () => shareOfFrame(over) > 1 / 3,
        ),
      ];
    });
    expect(wrong).toEqual([]);
  });

  test('draws nothing over cold-scroll or milk-book before its quote begins', () => {
    const early = QUOTES.flatMap(({ story, shot }) =>
      story.over
        .filter((o) => o.shot === shot)
        .map((o) => drawnBy(o, () => 0))
        .filter((d) => d.glyphs.length > 0 || d.fills.n > 0)
        .map(() => shot),
    );
    expect(early).toEqual([]);
  });

  test('keeps each verse inside its drawing’s box wherever its insert’s push stands', () => {
    const off = QUOTES.flatMap(({ story, shot }) => {
      const over = story.over.find((o) => o.shot === shot);
      if (!over) return [`${shot}: no drawing over it`];
      return [0, 0.25, 0.5, 0.75, 1].flatMap((u) => {
        const drawn = drawnBy(over, (cue) => Number(cue.endsWith(':write')) || u);
        return strays(over, drawn).map((g) => `${shot}@${u}: ${g.ch} at ${g.x.toFixed(0)}`);
      });
    });
    expect(off).toEqual([]);
  });

  test('carries the full cup’s milk forward with the cup in milk-pour once the pour stops: the milk’s mouth stretched as the cup’s plate is at its last key (`PRESENT`), and moved (critique 1, finding 1: the full cup brought to the viewer)', () => {
    const over = MILK_STORY.over.find((o) => o.shot === 'milk-pour');
    if (!over) return expect(over).toBeDefined();
    const [still, forward] = [0, 1].map((p) => drawnBy(over, pourAt(1, 1, 1, p)).ellipses[0]);
    expect((forward?.rx ?? 0) / (still?.rx ?? 1)).toBeCloseTo(PRESENT.s, 6);
    expect(Math.abs((forward?.y ?? 0) - (still?.y ?? 0))).toBeGreaterThan(10);
    const cup = milkPour
      .build({ duration: 10, cue: () => ({ start: 1, end: 2 }) })
      .layers.flatMap((l) => l.items)
      .find((i) => i._tag === 'Plate' && i.file.endsWith('/milk-cup-close.png'));
    expect(cup?._tag === 'Plate' && cup.moves?.at(-1)?.[1].sx).toBe(PRESENT.s);
  });

  test('pours milk that moves and fills the cup in milk-pour (critique 1, finding 1): nothing before the pour; once poured, a stream whose light streaks run down it from one frame to the next; the milk in the cup rising from the pour to the brim on "unmixed", where the stream stops', () => {
    const over = MILK_STORY.over.find((o) => o.shot === 'milk-pour');
    if (!over) return expect(over).toBeDefined();
    const at = (pour: number, fill: number, full: number) => pourAt(pour, fill, full);
    const before = drawnBy(over, at(0, 0, 0));
    expect(before.ellipses.length + before.strokes.length).toBe(0);
    const pouring = [0.3, 0.32].map((t) => drawnBy(over, at(1, 0.4, 0), t));
    expect(pouring.map((d) => d.strokes.length > 0)).toEqual([true, true]);
    expect(pouring[0]?.strokes).not.toEqual(pouring[1]?.strokes);
    const face = (fill: number) => drawnBy(over, at(1, fill, 0)).ellipses[1];
    const [low, high] = [face(0.2), face(1)];
    expect((high?.y ?? 0) < (low?.y ?? 0) && (high?.rx ?? 0) > (low?.rx ?? 0)).toBe(true);
    const mouth = drawnBy(over, at(1, 1, 1)).ellipses[0];
    expect(high?.rx).toBeCloseTo(mouth?.rx ?? 0, 6);
    expect(high?.y).toBeCloseTo(mouth?.y ?? 0, 6);
    expect(drawnBy(over, at(1, 1, 1)).strokes.length).toBeLessThanOrEqual(1);
  });

  test('keeps the title’s drawing under a tenth of the frame, so the parity reads the rest', () => {
    expect(TITLE_STORY.over.reduce((sum, o) => sum + o.box.w * o.box.h, 0)).toBeLessThan(
      0.1 * W * H,
    );
  });
});
