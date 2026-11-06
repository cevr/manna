import { describe, expect, test } from 'effect-bun-test';
import type { Over, PaintingFrame } from '../../../library/storybook/scene.ts';
import { script } from '../script.ts';
import { GRID } from './grid.ts';
import { LETTER_WORDS } from './shots/cold.ts';
import { BOOK_CITE, POUR_PATH } from './shots/milk.ts';
import { COLD_STORY, MILK_STORY, STORIES, TITLE_STORY } from './stories.ts';

/** One glyph a drawing over a shot put down: its character and its centre on the frame. */
interface Glyph {
  readonly ch: string;
  readonly x: number;
  readonly y: number;
}

/** What a drawing over a shot did on one frame: the glyphs it lettered, the hands it lettered them with, and the fills it laid. */
interface Drawn {
  readonly glyphs: Array<Glyph>;
  readonly hands: Array<string>;
  readonly fills: { n: number };
}

/** The frame's size. */
const [W, H] = [GRID.size.width, GRID.size.height];

/**
 * A context that draws nothing and records each glyph `write` lays (its
 * centre: the translate it lays it at), tracking translate and scale; a
 * glyph's width is half its type's size.
 */
const recording = (drawn: Drawn) => {
  const stack: Array<readonly [number, number, number, number]> = [];
  let m: readonly [number, number, number, number] = [1, 1, 0, 0];
  let font = '';
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
    beginPath: () => {},
    rect: () => {},
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
      drawn.glyphs.push({ ch, x: m[2], y: m[3] });
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
    direction: '',
  } as unknown as CanvasRenderingContext2D;
};

/** What `over` draws on a frame whose cues have run as `at` gives them. */
const drawnBy = (over: Over, at: (cue: string) => number): Drawn => {
  const drawn: Drawn = { glyphs: [], hands: [], fills: { n: 0 } };
  const f: PaintingFrame = {
    ctx: recording(drawn),
    t: 0,
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

/** The act's two lettered quotations: their scene, shot, the words the take speaks for them, and the reference lettered after them. */
const QUOTES = [
  {
    story: COLD_STORY,
    shot: 'cold-letter',
    words: spoken('cold', 'quote'),
    cite: LETTER_WORDS.cite,
  },
  { story: MILK_STORY, shot: 'milk-pour', words: spoken('milk', 'newborn'), cite: BOOK_CITE.text },
] as const;

describe("In Its Order's drawings over its shots", () => {
  test('lays no card in act 1: the quotes come off the black cards (the owner, ask a11de5e2b65)', () => {
    expect(STORIES.map((s) => s.cards.length)).toEqual([0, 0, 0]);
  });

  test('letters each act-1 quotation in its shot, word for word as the take speaks it, through the film’s lettering hand: every glyph inside its drawing’s box, which leaves at least two thirds of the frame to the scene around it', () => {
    const wrong = QUOTES.flatMap(({ story, shot, words, cite }) => {
      const over = story.over.find((o) => o.shot === shot);
      if (!over) return [`${shot}: no drawing over it`];
      const drawn = drawnBy(over, (cue) => Number(cue !== 'milk-pour:clear'));
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

  test('draws nothing over cold-letter or milk-pour before its quote begins', () => {
    const early = QUOTES.flatMap(({ story, shot }) =>
      story.over
        .filter((o) => o.shot === shot)
        .map((o) => drawnBy(o, () => 0))
        .filter((d) => d.glyphs.length > 0 || d.fills.n > 0)
        .map(() => shot),
    );
    expect(early).toEqual([]);
  });

  test('keeps the verse over the book inside its drawing’s box wherever milk-pour’s camera stands while it shows, and clears it once the milk pours', () => {
    const over = MILK_STORY.over.find((o) => o.shot === 'milk-pour');
    if (!over) return expect(over).toBeDefined();
    const shown = POUR_PATH.slice(0, 3);
    const off = shown.flatMap(([move], k) =>
      [0, 0.25, 0.5, 0.75, 1].flatMap((u) => {
        const done = new Set(POUR_PATH.slice(0, k).map(([m]) => `milk-pour:${m}`));
        const at = (cue: string) => {
          if (cue === 'milk-pour:clear') return 0;
          if (done.has(cue) || cue === 'milk-pour:write') return 1;
          return u;
        };
        const drawn = drawnBy(over, at);
        return [
          ...[`${move}@${u}: ${drawn.glyphs.length} glyphs`].filter(
            () => drawn.glyphs.length === 0,
          ),
          ...strays(over, drawn).map((g) => `${move}@${u}: ${g.ch} at ${g.x.toFixed(0)}`),
        ];
      }),
    );
    const poured = drawnBy(over, () => 1).glyphs.map((g) => `poured: ${g.ch}`);
    expect([...off, ...poured]).toEqual([]);
  });

  test('keeps the title’s drawing under a tenth of the frame, so the parity reads the rest', () => {
    expect(TITLE_STORY.over.reduce((sum, o) => sum + o.box.w * o.box.h, 0)).toBeLessThan(
      0.1 * W * H,
    );
  });
});
