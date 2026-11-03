import { type Film, createFilm, drawing } from '../../canvas/film.ts';

export const CROWD = 'crowd';

const plain = drawing({
  timeline: {},
  draw: (f) => {
    f.ctx.fillStyle = '#6a5a48';
    f.ctx.fillRect(40, 40, 120, 80);
  },
});

const NAMES = [
  'opening-question',
  'cold',
  'the-witness-stand',
  'gavel',
  'a-long-silence-after',
  'mirror',
  'the-verdict-read-aloud',
  'pause',
  'courtroom-empties',
  'hall',
  'walking-home-alone',
  'door',
  'the-letter-on-the-table',
  'end',
];

const SAYS = new Map([
  [
    'opening-question',
    'A {first}longer opening line that runs on for a while, so that the short scenes after it sit late in the first line of the tape.',
  ],
]);

export const crowdFilm = (): Film =>
  createFilm({
    title: 'Crowd',
    width: 640,
    height: 360,
    fps: 30,
    paper: { base: '#f4ecd8', tone: '#2a2520', seed: 1 },
    shade: '#000',
    captions: { font: '20px sans-serif', color: '#000', plate: '#fff' },
    scenes: NAMES.map((id) => ({
      id,
      say: SAYS.get(id) ?? 'One short line.',
      ...plain,
      drift: 0,
    })),
  });
