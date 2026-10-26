// A short's page is a film the player and the export serve unchanged: 9:16 at
// the film's density, as long as its spans, each scene on the short's clock
// with its own clock intact. Spans the film cannot resolve fail at load.
// Making the page needs no DOM, so bun can make one.

import { describe, expect, test } from 'bun:test';
import { Array as Arr, Effect, Option } from 'effect';
import { recorder, withDom } from './fixtures/stand-in.ts';
import { type Film, type FilmSpec, type Frame, createFilm } from './film.ts';
import { secondsAt } from '../core/time.ts';
import { SHORT_LAYOUT, bandOf } from '../core/shorts.ts';
import { createShort, shortPages } from './short.ts';

const draw = () => {};
const spec: FilmSpec = {
  fps: 30,
  title: 'probe',
  paper: { base: '#fff', tone: '#000', seed: 1 },
  shade: '#000',
  scenes: [
    { id: 'a', say: 'One two {three}three four {five}five six.', draw },
    { id: 'b', say: 'Seven {eight}eight nine ten.', draw },
  ],
};
const film = createFilm(spec);

describe('createShort', () => {
  test('is 9:16 at the film density, as long as its spans, on the film fps', () => {
    const short = createShort(film, {
      id: 'cut',
      title: 'A cut',
      spans: [
        { scene: 'b', from: { mark: 'eight' }, to: { at: 'speechEnd' } },
        { scene: 'a', from: { mark: 'three' }, to: { mark: 'five' } },
      ],
    });
    expect([short.width, short.height, short.fps]).toEqual([1920, 3414, film.fps]);
    expect(short.title).toBe('A cut');
    expect(short.audio).toBeUndefined();
    const [b, a] = short.placed;
    const [fb, fa] = [film.placed[1], film.placed[0]];
    // Each scene's own clock reads the same: short time minus its start is scene time.
    const eight = (fb?.speechStart ?? NaN) + (fb?.voice.marks.get('eight') ?? NaN);
    expect(b?.start).toBeCloseTo(
      -Math.round(((fb?.start ?? NaN) + eight) * 30) / 30 + (fb?.start ?? NaN),
      9,
    );
    expect(short.sceneAt(0).spec.id).toBe('b');
    expect(short.sceneAt(short.duration - 1e-6).spec.id).toBe('a');
    expect(a?.index).toBe(1);
    expect(fa?.spec.id).toBe('a');
    expect(short.duration).toBeGreaterThan(0);
  });

  test('a span the film cannot resolve fails at load, naming it', () => {
    expect(() =>
      createShort(film, {
        id: 'cut',
        title: 'A cut',
        spans: [{ scene: 'a', from: { mark: 'nope' }, to: { at: 'end' } }],
      }),
    ).toThrow('has no mark {nope}');
  });

  test('the band is the film frame, at the layout top, on whole pixel rows', () => {
    // 620 px down a 1080 × 1920 short, at the film's density.
    expect(bandOf(film)).toEqual({ top: 1102, width: 1920, height: 1080 });
    // Hook above it, captions below it, the band inside the page.
    const { top, height } = bandOf(film);
    const k = 1920 / 1080;
    expect(SHORT_LAYOUT.hook.y * k).toBeLessThan(top);
    expect(SHORT_LAYOUT.caption.y * k).toBeGreaterThan(top + height);
  });

  test('a short style the canvas cannot draw fails where the film is made', () => {
    expect(() => createFilm({ ...spec, short: { hook: { font: '', color: '#000' } } })).toThrow(
      'font',
    );
    expect(createFilm({ ...spec }).look.short.caption.highlight).toBe('#e6b347');
  });

  test.each([24, 30, 30000 / 1001])(
    "hands each band frame the very time the film's own frame under it reads, at %p fps",
    (fps) => {
      // b opens the film; its cue `turn` starts on its frame 23, where at 30000/1001 a
      // frame's seconds worked out another way differ in their last bit.
      const turn = secondsAt(23, fps);
      /** What each painter was handed: its scene, its time, and whether `turn` had begun. */
      const seen = new Set<string>();
      const noting = (id: string) => (f: Frame) => {
        seen.add(`${id} ${f.t} ${f.at('turn') > 0}`);
      };
      const film = createFilm({
        ...spec,
        fps,
        scenes: [
          {
            id: 'b',
            min: 2,
            timeline: { turn: { at: 'start', offset: turn, dur: 1 } },
            draw: noting('b'),
          },
          {
            id: 'a',
            say: 'One two {three}three four {five}five six.',
            timeline: { turn: { at: 'start', dur: 1 } },
            draw: noting('a'),
          },
        ],
      });
      const short = createShort(film, {
        id: 'cut',
        title: 'A cut',
        spans: [
          { scene: 'a', from: { mark: 'three' }, to: { mark: 'five' } },
          { scene: 'b', from: { at: 'start' }, to: { at: 'end' } },
        ],
      });
      /** What frame `i` of `page`, at `fps`, hands its painters (a camera may draw a scene more than once). */
      const handed = (page: Film, i: number) => {
        seen.clear();
        withDom(() => page.render(recorder(page.width, page.height).ctx, secondsAt(i, fps)));
        return [...seen];
      };
      const frames = Math.round(short.duration * fps);
      for (let i = 0; i < frames; i++) {
        // The film's frame under it: as far into the same beat as the short's frame is into its span's.
        const p = short.sceneAt(secondsAt(i, fps));
        const under = Arr.findFirst(film.placed, (q) => q.spec.id === p.spec.id);
        const frame = i - p.frame + Option.getOrThrow(under).frame;
        expect(handed(short, i)).toEqual(handed(film, frame));
      }
      // b's frame 23 is in the short, and draws `turn` not yet begun, as the film's does.
      const b = Option.getOrThrow(Arr.findFirst(short.placed, (q) => q.spec.id === 'b'));
      expect(handed(short, b.frame + 23)).toEqual([`b ${turn} false`]);
      expect(handed(film, 23)).toEqual([`b ${turn} false`]);
    },
  );

  test('each short is a page under <film>/shorts/<id>', () => {
    const pages = shortPages('probe', Effect.succeed(film), [
      {
        id: 'one',
        title: 'One',
        spans: [{ scene: 'a', from: { at: 'start' }, to: { at: 'end' } }],
      },
    ]);
    expect(Object.keys(pages)).toEqual(['probe/shorts/one']);
    const page = pages['probe/shorts/one'];
    expect(page).toBeDefined();
    if (page === undefined) return;
    expect(Effect.runSync(Effect.scoped(page))).toMatchObject({ title: 'One' });
  });
});
