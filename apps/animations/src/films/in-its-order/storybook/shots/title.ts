import { piece, probePlate, rounded, write } from '@manna/film/canvas';
import type { FilmShot, Over } from '../../../../library/storybook/scene.ts';
import { fonts, palette as P } from '../../palette.ts';
import { PATH, PATH_BRUSH } from '../../plates/plates.ts';
import { TITLE } from '../../script.ts';
import { cam, holds, layer, plateOf, seat } from '../kit.ts';
import { backdrop, diner, HEAD, table, Z } from './courtyard.ts';

/** The path's brush in the path plate's own px: the distance plate's brush less where the path is cut from it. */
const BRUSH = PATH_BRUSH.map(([x, y, r]) => [x - 869, y - 428, r] as const);

/** The guests' crowns on their plane: every chin clears the table's top in the pull's first frame too. */
const CROWN = 770;

/** The eight at the long table, left to right, on the guests' plane. */
const X = {
  diner1: 260,
  diner2: 470,
  man: 690,
  lead: 960,
  woman: 1220,
  mother: 1430,
  diner3: 1630,
  diner4: 1810,
} as const;

/**
 * The title: the camera pulls from the table's middle back to the wide
 * (1.12 to 1) over the scene, the gold path is laid along its brush from its
 * foot, and the eight at the long table sit breathing and blinking, two
 * diners turning to talk to a neighbour in turn.
 */
export const titleShot: FilmShot = {
  id: 'title',
  span: { at: 'start', until: { at: 'end' } },
  cues: {
    settle: { at: 'start', offset: 0.25, dur: 0.8 },
    path: { at: 'start', offset: 0.6, dur: 1.4 },
    talk: { at: 'start', offset: 0.7, dur: 1 },
    reply: { after: 'title:talk', offset: -0.1, dur: 1 },
  },
  build: ({ duration, cue }) => {
    const at = { headPx: HEAD, z: Z.guests };
    const neutral = holds([[0, 'neutral', 'neutralBlink']], duration);
    const talk = (c: string) =>
      holds(
        [
          [0, 'neutral', 'neutralBlink'],
          [cue(c).start, 'talk', 'talk'],
          [cue(c).end, 'neutral', 'neutralBlink'],
        ],
        duration,
      );
    return {
      headPx: HEAD,
      camera: [cam(0, 960, 690, 1.12), cam(duration, 960, 540, 1)],
      layers: [
        ...backdrop(),
        layer('path', Z.distance, [
          plateOf('path.png', PATH, {
            reveal: { brush: BRUSH, from: cue('path').start, to: cue('path').end },
          }),
        ]),
        layer('guests', Z.guests, [
          diner(1, X.diner1, CROWN, at, neutral),
          diner(2, X.diner2, CROWN, at, talk('talk')),
          seat(
            { member: 'feast-guest-man', sheet: 'iio-table', name: 'man', x: X.man, crown: CROWN },
            at,
            neutral,
          ),
          seat(
            {
              member: 'lead-feast',
              sheet: 'iio-table',
              name: 'lead',
              x: X.lead,
              crown: CROWN - 16,
            },
            at,
            holds([[0, 'front', 'frontBlink']], duration),
          ),
          seat(
            {
              member: 'feast-guest-woman',
              sheet: 'feast-courtyard',
              name: 'woman',
              x: X.woman,
              crown: CROWN,
            },
            at,
            neutral,
          ),
          seat(
            {
              member: 'feast-mother',
              sheet: 'iio-baby',
              name: 'mother',
              x: X.mother,
              crown: CROWN,
            },
            at,
            holds([[0, 'cup', 'cupBlink']], duration),
          ),
          diner(3, X.diner3, CROWN, at, neutral),
          diner(4, X.diner4, CROWN, at, talk('reply')),
        ]),
        layer('table', Z.table, [table()]),
      ],
    };
  },
};

/** The film's name: its strip's centre and size over the sky, in frame px, and its type. */
const NAME = {
  x: 960,
  y: 112,
  w: 940,
  h: 162,
  drop: 28,
  style: { family: fonts.display, size: 95, weight: 700, color: P.cream, align: 'center' },
} as const;

/** The title's name over the sky: a torn strip that settles down into place with its words, the film's own drawing, which the storybook verify does not render. */
export const TITLE_NAME: Over = {
  shot: 'title',
  box: {
    x: NAME.x - NAME.w / 2 - 12,
    y: NAME.y - NAME.h / 2 - 12,
    w: NAME.w + 24,
    h: NAME.h + NAME.drop + 24,
  },
  draw: (f) => {
    const settle = f.at('title:settle');
    const y = NAME.y + NAME.drop * (1 - settle);
    const shape = rounded(NAME.x, y, NAME.w, NAME.h, 0);
    probePlate(f.ctx, shape, () => {
      piece(
        f.ctx,
        shape,
        {
          role: 'scenery',
          kind: 'torn',
          torn: 5,
          shadow: 0.3,
          alpha: settle,
          color: P.ink,
          outline: P.outline,
        },
        f.hand('strip'),
      );
      write(f.ctx, TITLE, NAME.x, y + 32, NAME.style, f.hand('title'), {
        alpha: settle,
        boil: 0,
      });
    });
  },
};
