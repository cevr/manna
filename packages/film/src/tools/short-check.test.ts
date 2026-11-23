import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import { hashText } from '../core/narration.ts';
import { shortPhrases } from '../core/phrases.ts';
import type { Phrase } from '../core/phrases.ts';
import type { Probed, TextBox } from '../core/export-handle.ts';
import { type ResolvedShort, resolveShort } from '../core/shorts.ts';
import {
  loopGap,
  loopPicture,
  lumaDiff,
  mergeUnsafe,
  openFrames,
  shortLength,
  hookWord,
  stillOpen,
  titleOpen,
  unsafeTexts,
} from './short-check.ts';
import { type ShortFinding, levelOf } from './findings.ts';
import { voicedAt } from '../core/voiced.ts';
import { camera } from '../canvas/camera.ts';
import { createFilm, drawing } from '../canvas/film.ts';
import { createShort } from '../canvas/short.ts';
import { recorder, withDom } from '../canvas/fixtures/stand-in.ts';
import type { PaintingSpec } from '../canvas/painting.ts';
import { type ProbeSink, probeFigure, probing } from '../canvas/probe.ts';

/** How bad a short's finding is; `--allow-stale` does not touch any. */
const level = (finding: ShortFinding) => levelOf(finding, { allowStale: false });

const resolved = (duration: number): ResolvedShort => ({
  id: 'probe',
  title: 'Probe',
  spans: [{ scene: 'a', from: 0, to: duration, at: 0, shift: 0 }],
  duration,
  fps: 30,
});

const phrase = (start: number, end: number, text = 'one two'): Phrase => ({
  start,
  end: end + 0.6,
  words: text.split(' ').map((t, i, all) => ({
    text: t,
    start: start + ((end - start) * i) / all.length,
    end: start + ((end - start) * (i + 1)) / all.length,
    quoted: false,
  })),
});

/** A line of text at page px `[x, y]`, `w` × `h`, as the probe reports it. */
const box = (text: string, x: number, y: number, w: number, h: number): TextBox => ({
  text,
  scene: 'a',
  x,
  y,
  w,
  h,
  corners: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
  alpha: 1,
  order: 0,
  scale: 1,
});

/** The short's own line (its hook or a caption), as the page tags it. */
const own = (t: TextBox): TextBox => ({ ...t, caption: true });

const frame = (...texts: ReadonlyArray<TextBox>): Probed => ({ texts, inks: [] });

describe('shortLength', () => {
  test('45 to 75 s holds', () => {
    expect(Option.isNone(shortLength(resolved(60)))).toBe(true);
  });

  test('under 45 s or over 75 s is a warning, over 90 s an error', () => {
    const short = Option.getOrThrow(shortLength(resolved(32)));
    expect(short.message).toContain('outside the 45–75s');
    expect(level(short)).toBe('warning');
    const long = Option.getOrThrow(shortLength(resolved(95)));
    expect(long.message).toContain('over the 90s');
    expect(level(long)).toBe('error');
    expect(level(Option.getOrThrow(shortLength(resolved(80))))).toBe('warning');
  });
});

describe('hookWord', () => {
  test('a first word by 0.3 s hooks', () => {
    expect(Option.isNone(hookWord(resolved(60), [phrase(0.2, 1)]))).toBe(true);
  });

  test('a first word after 0.3 s, or none, is late', () => {
    const late = Option.getOrThrow(hookWord(resolved(60), [phrase(0.8, 2)]));
    expect(late.reason).toBe('late word');
    expect(late.at).toBeCloseTo(0.8);
    expect(level(late)).toBe('error');
    expect(Option.getOrThrow(hookWord(resolved(60), [])).reason).toBe('late word');
  });
});

describe('the hook and the loop read when words are heard', () => {
  const say = 'The evidence is overwhelming.';
  const aligned: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 0.6, 0.4, 0.6],
    [0.6, 1.1, 0.6, 1.1],
    [1.1, 1.3, 1.1, 1.3],
    [1.3, 2.5, 1.3, 2.0],
  ];
  const words = say.split(' ').map((text, i) => {
    const [start, end, on, off] = aligned[i] ?? [0, 0, 0, 0];
    return { text, start, end, voiced: voicedAt(on, off) };
  });
  const take = {
    hash: hashText(say),
    file: 'a.mp3',
    duration: 2.5,
    words,
    source: 'elevenlabs' as const,
  };
  const film = Result.getOrThrow(
    layout(
      [{ id: 'a', say, lead: 0, draw: () => {} }],
      {
        voice: 'v',
        scenes: { a: take },
      },
      30,
    ),
  );
  const short = Result.getOrThrow(
    resolveShort(film, {
      id: 'cut',
      title: 'Cut',
      spans: [{ scene: 'a', from: { at: 'start' }, to: { at: 'speechEnd' } }],
    }),
  );
  const phrases = shortPhrases(film, short);

  test('the first word is late when its voice is, whatever its aligned start', () => {
    const late = Option.getOrThrow(hookWord(short, phrases));
    expect(late.at).toBeCloseTo(0.4);
  });

  test("the loop's silence runs from the last word's voice to the first's", () => {
    const gap = Option.getOrThrow(loopGap(short, phrases));
    expect(gap.value).toBeCloseTo(0.9);
  });
});

describe('loopGap', () => {
  test('the silence from the last word round to the first is counted across the loop', () => {
    expect(Option.isNone(loopGap(resolved(10), [phrase(0.2, 5), phrase(5, 9.7)]))).toBe(true);
    const gap = Option.getOrThrow(loopGap(resolved(10), [phrase(0.2, 5), phrase(5, 9)]));
    expect(gap.reason).toBe('gap');
    expect(gap.value).toBeCloseTo(1.2);
    expect(level(gap)).toBe('warning');
  });
});

describe('lumaDiff and loopPicture', () => {
  test('the mean absolute per-cell luma difference, 0 to 1', () => {
    expect(lumaDiff([0, 255], [0, 255])).toBe(0);
    expect(lumaDiff([0, 0], [255, 0])).toBeCloseTo(0.5);
  });

  test('a last frame far from the first is a loop warning', () => {
    expect(Option.isNone(loopPicture('probe', [10, 10], [12, 11]))).toBe(true);
    const cut = Option.getOrThrow(loopPicture('probe', [0, 0], [255, 0]));
    expect(cut.reason).toBe('picture');
    expect(level(cut)).toBe('warning');
    expect(cut.message).toContain('mean absolute per-cell luma difference on a 64×36 grid');
  });
});

describe('unsafeTexts', () => {
  const k = 2;

  test('text inside the zone is safe', () => {
    expect(unsafeTexts('probe', 'default', 1, frame(box('safe', 400, 1400, 800, 100)), k)).toEqual(
      [],
    );
  });

  test('text past an edge names the side it crosses most, in 1080 × 1920 px', () => {
    const [found] = unsafeTexts(
      'probe',
      'default',
      2,
      frame(box('Justify', 1700, 1400, 280, 80)),
      k,
    );
    expect(found?.side).toBe('right');
    expect(found?.by).toBeCloseTo(50);
    expect(found?.own).toBe(false);
  });

  test("the short's own text is flagged as its own, and is an error; the film's a warning", () => {
    const [mine] = unsafeTexts(
      'probe',
      'ads',
      3,
      frame(own(box('caption', 400, 2600, 800, 100))),
      k,
    );
    expect(mine?.side).toBe('bottom');
    expect(mine?.own).toBe(true);
    expect(level(mine!)).toBe('error');
    const [film] = unsafeTexts('probe', 'default', 3, frame(box('label', 10, 1400, 80, 50)), k);
    expect(film?.side).toBe('left');
    expect(level(film!)).toBe('warning');
  });

  test('text faded out is not seen', () => {
    const faded = { ...box('gone', 1900, 100, 200, 80), alpha: 0 };
    expect(unsafeTexts('probe', 'default', 4, frame(faded), k)).toEqual([]);
  });

  test('one finding per line and side: its first time, its furthest reach', () => {
    const a = unsafeTexts('probe', 'default', 5, frame(box('Justify', 1700, 1400, 240, 80)), k);
    const b = unsafeTexts('probe', 'default', 6, frame(box('Justify', 1700, 1400, 300, 80)), k);
    const merged = mergeUnsafe([...a, ...b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.at).toBe(5);
    expect(merged[0]?.by).toBeCloseTo(60);
  });

  test("the short's own lines past one side are one finding: they share one place, so one fix", () => {
    const lines = ['one two', 'three four', 'five six'].flatMap((text, i) =>
      unsafeTexts('probe', 'ads', i, frame(own(box(text, 400, 2600 + i * 10, 800, 100))), k),
    );
    const merged = mergeUnsafe(lines);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toBe('one two');
    expect(merged[0]?.others).toBe(2);
    expect(merged[0]?.message).toContain('and 2 more of its lines');
  });
});

describe('the open', () => {
  test('the frames probed for motion run from the first to the rule', () => {
    const frames = openFrames(30);
    expect(frames[0]).toBe(0);
    expect(frames.at(-1)).toBe(15);
  });

  test('an open that holds still is a hook error; one that moves is not', () => {
    const still = frame(box('word', 100, 100, 100, 40));
    const moved = frame(box('word', 300, 100, 100, 40));
    expect(Option.getOrThrow(stillOpen('probe', [still, still], 0.5)).reason).toBe('still open');
    expect(Option.isNone(stillOpen('probe', [still, moved], 0.5))).toBe(true);
  });

  test('the captions and the hook do not count as motion', () => {
    const a = frame(box('word', 100, 100, 100, 40), own(box('one two', 100, 2600, 400, 80)));
    const b = frame(box('word', 100, 100, 100, 40), own(box('three four', 100, 2600, 400, 80)));
    expect(Option.isSome(stillOpen('probe', [a, b], 0.5))).toBe(true);
  });

  describe('a painting or a rig, with no text or ink, under a camera push', () => {
    const W = 1080;
    const H = 608;
    const PLATE: PaintingSpec = { key: 'test/plate', png: 'plate.png', size: [W, H] };
    const plate = drawing({ timeline: {}, paintings: { plate: PLATE }, draw: () => {} });
    const film = withDom(() =>
      createFilm({
        fps: 30,
        title: 'plates',
        width: W,
        height: H,
        paper: { base: '#ffffff', tone: '#000000', seed: 1 },
        shade: '#000000',
        finish: { vignette: 0, grain: 0 },
        scenes: [
          {
            id: 'push',
            min: 4,
            drift: 0,
            ...plate,
            draw: (f) =>
              camera(f.ctx, { x: W / 2, y: H / 2, zoom: 1 + (0.4 * f.t) / f.dur }, W, H, () =>
                f.painting('plate'),
              ),
          },
          { id: 'held', min: 4, drift: 0, ...plate, draw: (f) => f.painting('plate') },
          {
            id: 'away',
            min: 4,
            drift: 0,
            ...plate,
            draw: (f) =>
              camera(f.ctx, { x: W / 2, y: H / 2, zoom: 1 + (0.4 * f.t) / f.dur }, W, H, () => {
                f.ctx.translate(4 * W, 0);
                f.painting('plate');
              }),
          },
          {
            id: 'corner',
            min: 4,
            drift: 0,
            ...plate,
            draw: (f) => {
              f.ctx.translate(20 + f.t * 40, -60);
              f.ctx.rotate((3 * Math.PI) / 4);
              f.ctx.scale(0.12, 0.02);
              f.painting('plate');
            },
          },
        ],
      }),
    );
    /**
     * The open of a short cut from one scene, each frame probed through the
     * short's page as the page's `probe` call probes it (`player/render.ts`).
     */
    const shortOpen = (scene: string): ReadonlyArray<Probed> => {
      const short = createShort(film, {
        id: 'cut',
        title: 'Cut',
        spans: [{ scene, from: { at: 'start' }, to: { at: 'end' } }],
      });
      const down = film.paintings.stand(new Map([[PLATE, { image: Option.none() }]]));
      const frames = openFrames(short.fps).map((i) => {
        const sink: ProbeSink = { texts: [], inks: [], placed: [] };
        withDom(() =>
          short.render(recorder(short.width, short.height).ctx, i / short.fps, { probe: sink }),
        );
        return sink;
      });
      down();
      return frames;
    };

    test("a short's open moves, with no text or ink in its picture", () => {
      const open = shortOpen('push');
      const picture = (p: Probed) => [...p.texts, ...p.inks].filter((m) => m.caption !== true);
      expect(open.every((p) => picture(p).length === 0)).toBe(true);
      expect(Option.isNone(stillOpen('cut', open, 0.5))).toBe(true);
    });

    test('the same painting held in a short, no camera and no breath, is a still open', () => {
      expect(Option.getOrThrow(stillOpen('cut', shortOpen('held'), 0.5)).reason).toBe('still open');
    });

    /** The wide film's own open of the scene starting at `from` seconds, probed as its page probes it. */
    const wideOpen = (from: number): ReadonlyArray<Probed> => {
      const down = film.paintings.stand(new Map([[PLATE, { image: Option.none() }]]));
      const frames = openFrames(film.fps).map((i) => {
        const sink: ProbeSink = { texts: [], inks: [], placed: [] };
        withDom(() => film.render(recorder(W, H).ctx, from + i / film.fps, { probe: sink }));
        return sink;
      });
      down();
      return frames;
    };

    test('a painting pushed wholly outside the picture is a still open, in a short or the film', () => {
      expect(Option.getOrThrow(stillOpen('cut', shortOpen('away'), 0.5)).reason).toBe('still open');
      expect(Option.isSome(stillOpen('away', wideOpen(8), 0.5))).toBe(true);
    });

    test('a tilted painting sliding past a corner, its box over the picture, is a still open', () => {
      expect(Option.getOrThrow(stillOpen('cut', shortOpen('corner'), 0.5)).reason).toBe(
        'still open',
      );
      expect(Option.isSome(stillOpen('corner', wideOpen(12), 0.5))).toBe(true);
    });

    test('a rig it declares moves with the camera as a painting does', () => {
      const rigAt = (zoom: number): Probed => {
        const sink: ProbeSink = { texts: [], inks: [], placed: [] };
        const { ctx } = recorder(W, H);
        ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
        probing(ctx, { sink, scene: 'push', dx: 0, alpha: 1 }, () =>
          probeFigure(ctx, {
            key: 'rig',
            left: 200,
            top: 400,
            right: 600,
            bottom: 1400,
            face: true,
          }),
        );
        return sink;
      };
      expect(Option.isNone(stillOpen('probe', [rigAt(1), rigAt(1.05)], 0.5))).toBe(true);
      expect(Option.isSome(stillOpen('probe', [rigAt(1), rigAt(1)], 0.5))).toBe(true);
    });
  });

  test("the film's title in the first frame is a title card", () => {
    const card = frame(box('Righteousness by Faith', 400, 1400, 900, 120));
    const found = Option.getOrThrow(titleOpen('probe', card, 'Righteousness by Faith'));
    expect(found.reason).toBe('title card');
    const hook = frame(own(box('Righteousness by Faith', 400, 800, 900, 120)));
    expect(Option.isNone(titleOpen('probe', hook, 'Righteousness by Faith'))).toBe(true);
    expect(
      Option.isNone(
        titleOpen('probe', frame(box('Justify', 0, 0, 10, 10)), 'Righteousness by Faith'),
      ),
    ).toBe(true);
  });
});

describe('a talk, checked as a vertical film', () => {
  const talk = (duration: number, format: 'question' | 'episode') => ({
    id: 'why-the-law',
    duration,
    fps: 30,
    format,
  });

  test("its length is held to its format's, not a short's", () => {
    expect(Option.isNone(shortLength(talk(50, 'question')))).toBe(true);
    const short = Option.getOrThrow(shortLength(talk(50, 'episode')));
    expect(short.message).toContain('outside the 135–170s');
    expect(Option.isNone(shortLength(talk(150, 'episode')))).toBe(true);
    expect(Option.isSome(shortLength(talk(70, 'question')))).toBe(true);
  });

  /** A frame of the take's footage at source second `at`, with the same line of text. */
  const shot = (at: number): Probed => ({
    texts: [box('word', 100, 100, 100, 40)],
    inks: [],
    footage: [{ source: 'take.why/0123456789ab', at }],
  });

  test('its footage moving is motion: a still open is one whose source time holds', () => {
    expect(Option.isNone(stillOpen('why-the-law', [shot(1), shot(1 + 1 / 30)], 0.5))).toBe(true);
    expect(Option.isSome(stillOpen('why-the-law', [shot(1), shot(1)], 0.5))).toBe(true);
    const other = { ...shot(1), footage: [{ source: 'take.why/ba9876543210', at: 1 }] };
    expect(Option.isNone(stillOpen('why-the-law', [shot(1), other], 0.5))).toBe(true);
  });

  test("its text is held to every platform's zone, naming the platforms a line runs under", () => {
    const low = frame(own(box('one two', 300, 1300, 400, 80)));
    expect(unsafeTexts('why-the-law', 'default', 1, low, 1)).toEqual([]);
    const [under] = unsafeTexts('why-the-law', 'platforms', 1, low, 1);
    expect(under?.side).toBe('bottom');
    expect(under?.by).toBeCloseTo(1380 - 1248);
    expect(under?.zone).toBe('platforms (YouTube Shorts, Instagram Reels, TikTok)');
    const [right] = unsafeTexts(
      'why-the-law',
      'platforms',
      1,
      frame(own(box('three four', 500, 700, 400, 80))),
      1,
    );
    expect(right?.side).toBe('right');
    expect(right?.message).toContain('the platforms (YouTube Shorts) safe zone');
    const [buttons] = unsafeTexts(
      'why-the-law',
      'platforms',
      1,
      frame(own(box('caption', 700, 1000, 188, 40))),
      1,
    );
    expect(buttons?.side).toBe('right');
    expect(buttons?.by).toBeCloseTo(888 - 780);
    expect(buttons?.zone).toBe('platforms (TikTok)');
    expect(
      unsafeTexts('why-the-law', 'platforms', 1, frame(own(box('high', 800, 800, 50, 60))), 1).map(
        (f) => [f.side, f.zone],
      ),
    ).toEqual([['right', 'platforms (TikTok)']]);
    expect(
      unsafeTexts('why-the-law', 'platforms', 1, frame(own(box('above', 700, 700, 150, 100))), 1),
    ).toEqual([]);
  });
});
