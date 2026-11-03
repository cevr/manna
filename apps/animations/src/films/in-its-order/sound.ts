import type { Sound } from '@manna/film/core';

import { milk } from './scenes/milk.ts';

const comingIn = (count: number): ReadonlyArray<number> => {
  const { dur, stagger } = milk.timeline.row;
  return Array.from({ length: count }, (_, i) => (dur * stagger * i) / (count - 1));
};

const AVOID = [
  'drums',
  'percussion',
  'drum kit',
  'epic trailer',
  'cinematic hits',
  'braams',
  'electronic beats',
  'synth bass',
  'vocals',
  'choir',
];

interface Voicing {
  readonly melody: string;
  readonly bed: string;
  readonly low: string;
}

const later = ({ melody, bed, low }: Voicing) => [
  {
    from: 'stones',
    name: 'the foundation',
    styles: [`steady ${bed}`, `plain ${melody} theme`, 'grounded, building slowly'],
  },
  {
    from: 'teeth',
    name: 'the rush',
    styles: [`restless ${bed}`, `${low} swelling`, 'a little hurried, then uneasy'],
  },
  {
    from: 'math',
    name: 'the sum',
    styles: [`thoughtful ${melody}`, `${low} pedal tone swelling`, 'searching, sober'],
  },
  {
    from: 'priest',
    name: 'the meat',
    styles: [`reverent ${melody}`, `rich ${bed}`, `${low} swelling`, 'rising warmth'],
  },
  {
    from: 'eat',
    name: 'the path',
    styles: [`flowing ${bed}`, `joyful ${melody}`, 'walking pace, light'],
  },
  {
    from: 'name',
    name: 'the table',
    styles: [`the feast theme returns on ${melody}`, `warm ${bed}`, 'homecoming'],
  },
  {
    from: 'thesis',
    name: 'the landing',
    styles: [`full warm statement of the theme on ${melody}`, `${bed}`, 'decays to silence'],
  },
];

export const sound: Sound = {
  score: {
    play: 'parlour',
    under: -18.5,
    alone: -6,
    options: {
      parlour: {
        model: 'music_v2_5',
        styles: [
          'warm hopeful instrumental',
          'felt piano',
          'chamber strings',
          'gentle',
          'major key',
          'unhurried',
        ],
        avoid: AVOID,
        movements: [
          {
            from: 'cold',
            name: 'the feast',
            styles: [
              'playful pizzicato strings',
              'light felt piano',
              'wry, a little comic',
              'wedding-feast warmth',
            ],
          },
          {
            from: 'title',
            name: 'the title',
            styles: [
              'felt piano melody',
              'warm sustained strings swell gently',
              'cello pedal tone underneath',
              'open, hopeful',
            ],
          },
          {
            from: 'milk',
            name: 'the plain word',
            styles: [
              'simple felt piano figure',
              'soft sustained strings',
              'sparse, clear, room for the voice',
              'tender',
            ],
          },
          ...later({
            melody: 'felt piano',
            bed: 'chamber strings',
            low: 'bowed cellos and basses',
          }),
        ],
      },
      folk: {
        model: 'music_v2_5',
        styles: [
          'warm acoustic folk instrumental',
          'fingerpicked nylon-string guitar',
          'upright bass',
          'clarinet',
          'major key',
          'homespun',
        ],
        avoid: AVOID,
        movements: [
          {
            from: 'cold',
            name: 'the feast',
            styles: [
              'bouncy fingerpicked guitar',
              'glockenspiel accents',
              'playful clarinet',
              'light-hearted',
            ],
          },
          {
            from: 'title',
            name: 'the title',
            styles: [
              'clarinet melody over guitar',
              'upright bass held low notes',
              'warm, open, hopeful',
            ],
          },
          {
            from: 'milk',
            name: 'the plain word',
            styles: [
              'slow fingerpicked guitar',
              'soft upright bass',
              'sparse, room for the voice',
              'gentle',
            ],
          },
          ...later({
            melody: 'clarinet',
            bed: 'fingerpicked nylon-string guitar',
            low: 'bowed upright bass',
          }),
        ],
      },
      storybook: {
        model: 'music_v2_5',
        styles: [
          'warm pastoral orchestral instrumental',
          'flute',
          'oboe',
          'harp',
          'celesta',
          'major key',
          'storybook',
        ],
        avoid: AVOID,
        movements: [
          {
            from: 'cold',
            name: 'the feast',
            styles: [
              'comic staccato bassoon',
              'plucked harp',
              'celesta sparkle',
              'playful, a little wry',
            ],
          },
          {
            from: 'title',
            name: 'the title',
            styles: [
              'flute melody over harp arpeggios',
              'soft horn and bowed bass pedal tone',
              'warm, hopeful',
            ],
          },
          {
            from: 'milk',
            name: 'the plain word',
            styles: [
              'gentle harp arpeggios',
              'soft oboe line',
              'sparse, clear, room for the voice',
              'tender',
            ],
          },
          ...later({
            melody: 'flute and oboe',
            bed: 'harp arpeggios',
            low: 'bowed basses and soft horn',
          }),
        ],
      },
    },
  },
  beds: [
    {
      sound: 'amb.courtyard',
      level: -16,
      from: { scene: 'cold', at: 'start' },
      to: { scene: 'title', at: 'end' },
    },
    {
      sound: 'room.paper',
      level: -25,
      from: { scene: 'milk', at: 'start' },
      to: { scene: 'milk', at: 'end' },
    },
    {
      sound: 'milk.pour',
      level: -22,
      fade: 0.3,
      from: { scene: 'milk', cue: 'fill' },
      to: { scene: 'milk', cue: 'stop', edge: 'end' },
    },
    {
      sound: 'milk.pour',
      level: -22,
      fade: 0.3,
      from: { scene: 'milk', cue: 'fill2' },
      to: { scene: 'milk', cue: 'stop2', edge: 'end' },
    },
  ],
  effects: {
    drop: {
      sound: 'scroll.drop',
      level: -16,
      sync: 'hit',
      at: [{ scene: 'cold', cue: 'drop', edge: 'end' }],
    },
    hop: {
      sound: 'scroll.drop',
      level: -23,
      sync: 'hit',
      at: [{ scene: 'cold', cue: 'hop', edge: 'end' }],
    },
    unroll: {
      sound: 'scroll.unroll',
      level: -20,
      sync: 'onset',
      at: [{ scene: 'cold', cue: 'unfurl' }],
    },

    lower: {
      sound: 'paper.whoosh',
      level: -24,
      sync: 'onset',
      at: [{ scene: 'milk', cue: 'ink' }],
    },
    lift: {
      sound: 'paper.whoosh',
      level: -24,
      sync: 'hit',
      at: [{ scene: 'milk', cue: 'away', edge: 'end' }],
    },

    comeIn: {
      sound: 'tone.chime',
      level: -24,
      at: comingIn(4).map((offset) => ({ scene: 'milk', cue: 'row', offset })),
    },
    lastIn: { sound: 'tone.chime', level: -24, at: [{ scene: 'milk', cue: 'lead' }] },
  },
};
