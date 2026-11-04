import type { Sound } from '@manna/film/core';

import { drinkTurns } from './storybook/shots/milk.ts';

/** What no option plays: the epic, the electronic and the drum kit. */
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

/** The instruments one option turns to past act 1: its melody, its bed and its low end. */
interface Voicing {
  readonly melody: string;
  readonly bed: string;
  readonly low: string;
}

/**
 * The score past act 1, in one option's instruments: the API composes the
 * whole film in one plan, each movement 3 to 120 s, so every later act has a
 * movement now, shaped by the script's arc and refined when its scenes are
 * drawn. The low end swells on the problem (`teeth`, `math`) and on the
 * climax (`priest`); the landing (`thesis`) is the one stretch the music
 * plays alone.
 */
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
      from: { scene: 'milk', cue: 'milk-pour:pour' },
      to: { scene: 'milk', cue: 'milk-pour:stop', edge: 'end' },
    },
    {
      sound: 'milk.pour',
      level: -22,
      fade: 0.3,
      from: { scene: 'milk', cue: 'milk-pour:again' },
      to: { scene: 'milk', cue: 'milk-pour:full', edge: 'end' },
    },
  ],
  effects: {
    drop: {
      sound: 'scroll.drop',
      level: -16,
      sync: 'hit',
      at: [{ scene: 'cold', cue: 'cold-letter:fall', edge: 'end' }],
    },
    hop: {
      sound: 'scroll.drop',
      level: -23,
      sync: 'hit',
      at: [{ scene: 'cold', cue: 'cold-letter:hop', edge: 'end' }],
    },
    unroll: {
      sound: 'scroll.unroll',
      level: -20,
      sync: 'onset',
      at: [{ scene: 'cold', cue: 'cold-letter:unroll' }],
    },

    lower: {
      sound: 'paper.whoosh',
      level: -24,
      sync: 'onset',
      at: [{ scene: 'milk', cue: 'milk-pour:dropper' }],
    },
    lift: {
      sound: 'paper.whoosh',
      level: -24,
      sync: 'hit',
      at: [{ scene: 'milk', cue: 'milk-pour:away', edge: 'end' }],
    },

    comeIn: {
      sound: 'tone.chime',
      level: -24,
      at: drinkTurns.map((offset) => ({ scene: 'milk', cue: 'milk-row:drinks', offset })),
    },
    lastIn: {
      sound: 'tone.chime',
      level: -24,
      at: [{ scene: 'milk', cue: 'milk-row:lift' }],
    },
  },
};
