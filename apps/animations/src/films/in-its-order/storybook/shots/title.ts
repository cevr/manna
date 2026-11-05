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

/**
 * The eight at the long table, left to right, on the guests' plane, in the
 * panel's groups: two diners turned to each other, the man and the woman
 * either side of the lead and turned to him, the mother, then two diners
 * turned to each other; shoulders overlap within a group.
 */
const X = {
  diner1: 470,
  diner2: 568,
  man: 855,
  lead: 960,
  woman: 1065,
  mother: 1165,
  diner3: 1340,
  diner4: 1438,
} as const;

/** The pull's first framing: nearer than the wide, so the group fills the frame as the panel's start does, its heads about a third bigger. */
const NEAR_START = { x: 960, y: 700, zoom: 1.3 } as const;

/**
 * The title: the camera pulls from the group at the table's middle back to
 * the wide (1.3 to 1) over the scene, the gold path is laid along its brush
 * from its foot, and the eight at the long table sit breathing and blinking
 * in their groups, the man and the woman turned to the lead, and the diners
 * of each pair talking to each other in turn.
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
      camera: [cam(0, NEAR_START.x, NEAR_START.y, NEAR_START.zoom), cam(duration, 960, 540, 1)],
      layers: [
        ...backdrop(),
        layer('path', Z.distance, [
          plateOf('path.png', PATH, {
            reveal: { brush: BRUSH, from: cue('path').start, to: cue('path').end },
          }),
        ]),
        layer('guests', Z.guests, [
          diner(1, X.diner1, CROWN, at, talk('talk')),
          diner(2, X.diner2, CROWN, at, talk('reply')),
          diner(3, X.diner3, CROWN, at, talk('talk')),
          diner(4, X.diner4, CROWN, at, talk('reply')),
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
          seat(
            { member: 'feast-guest-man', sheet: 'iio-table', name: 'man', x: X.man, crown: CROWN },
            at,
            holds([[0, 'smile', 'neutralBlink']], duration),
          ),
          seat(
            {
              member: 'feast-guest-woman',
              sheet: 'iio-table',
              name: 'woman',
              x: X.woman,
              crown: CROWN,
            },
            at,
            holds([[0, 'smile', 'neutralBlink']], duration),
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
