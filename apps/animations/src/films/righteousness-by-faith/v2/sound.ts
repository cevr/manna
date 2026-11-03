import type { Movement, Music, Sound } from '@manna/film/core';

const movements: ReadonlyArray<Movement> = [
  {
    from: 'cold',
    name: 'The courtroom',
    styles: ['sparse', 'quiet suspense', 'questioning', 'unresolved', 'soft pulse'],
  },
  {
    from: 'title',
    name: 'The theme, then the measure',
    styles: [
      'begins at once, full and warm: the main theme stated clearly in the first three seconds',
      'then sinks lower and more searching',
      'slow build in the low register',
    ],
  },
  {
    from: 'mirror',
    name: 'Coming up short',
    styles: [
      'heavy',
      'a deep bass pedal tone swelling slowly louder under everything',
      'bowed double basses on the lowest notes',
      'soft low timpani roll',
      'minor',
      'weary',
      'restrained',
    ],
  },
  {
    from: 'message',
    name: 'The message',
    styles: ['hope dawning', 'gentle forward motion', 'rising', 'major key'],
  },
  {
    from: 'roof',
    name: 'The gifts shown',
    styles: ['warm', 'narrative', 'tender', 'unhurried', 'gentle movement'],
  },
  {
    from: 'spoke',
    name: 'Faith from the word',
    styles: ['light breaking', 'wonder', 'growing', 'hopeful', 'steady'],
  },
  {
    from: 'declared',
    name: 'Forgiveness',
    styles: ['tender', 'intimate', 'grace', 'soft resolution', 'light, no bass'],
  },
  {
    from: 'exchange',
    name: 'The exchange',
    styles: [
      'grief',
      'the climax',
      'a deep bass pedal tone swelling to its loudest under everything',
      'bowed double basses on the lowest notes',
      'soft low timpani roll',
      'darkness and stillness',
      'then light breaking through, slowly',
    ],
  },
  {
    from: 'accuser',
    name: 'The accuser silenced',
    styles: ['tension resolving', 'low strings easing', 'quiet strength', 'warming'],
  },
  {
    from: 'robe',
    name: 'The robe',
    styles: ['warm', 'woven', 'gentle lift', 'gratitude', 'light, little bass'],
  },
  {
    from: 'within',
    name: 'Power within',
    styles: ['steady walking pulse', 'renewal', 'quiet confidence', 'gentle rain'],
  },
  {
    from: 'name',
    name: 'The name',
    styles: ['gathering', 'resolute', 'building gently toward a lift'],
  },
  {
    from: 'thesis',
    name: 'The Lord our righteousness',
    styles: [
      'the landing',
      'the main theme returns in full',
      'lifts',
      'luminous',
      'joyful',
      'warm',
    ],
  },
  {
    from: 'end',
    name: 'Credits',
    styles: ['peaceful', 'the theme once more, softly', 'settling', 'ending on a resolved chord'],
  },
];

const avoid = [
  'vocals',
  'choir',
  'lyrics',
  'spoken word',
  'epic trailer',
  'cinematic braams',
  'heavy drums',
  'EDM',
  'distortion',
];

const option = (styles: ReadonlyArray<string>, extra: ReadonlyArray<string> = []): Music => ({
  model: 'music_v2_5',
  styles: ['instrumental', 'film score', 'warm', 'hopeful', ...styles],
  avoid: [...avoid, ...extra],
  movements,
});

const PAPER = -25;

export const sound: Sound = {
  score: {
    play: 'piano',
    under: -19.5,
    alone: -6,
    options: {
      piano: option(
        ['felt piano', 'soft string ensemble', 'intimate', 'slow tempo', 'gentle suspensions'],
        ['synth', 'electronic beats'],
      ),
      ensemble: option(
        [
          'warm acoustic chamber ensemble',
          'nylon-string guitar',
          'cello',
          'clarinet',
          'upright bass',
          'soft hand percussion',
          'folk',
        ],
        ['electric guitar', 'synth'],
      ),
      ambient: option(
        [
          'ambient',
          'warm evolving pads',
          'a simple recurring four-note motif on celesta and soft Rhodes',
          'slow',
          'spacious',
        ],
        ['beats', 'drums'],
      ),
    },
  },
  beds: [
    {
      sound: 'room.paper',
      level: PAPER,
      from: { scene: 'cold', at: 'start' },
      to: { scene: 'mirror', at: 'speech' },
    },
    {
      sound: 'room.paper',
      level: PAPER,
      from: { scene: 'message', mark: 'three' },
      to: { scene: 'roof', at: 'speech' },
    },
    {
      sound: 'room.paper',
      level: PAPER,
      from: { scene: 'woman', cue: 'toIdea' },
      to: { scene: 'spoke', cue: 'plunge' },
    },
    {
      sound: 'room.paper',
      level: PAPER,
      from: { scene: 'centurion', cue: 'toIcons' },
      to: { scene: 'look', cue: 'toDesert' },
    },
    {
      sound: 'room.paper',
      level: PAPER,
      from: { scene: 'look', cue: 'toIcons' },
      to: { scene: 'exchange', at: 'speech' },
    },
    {
      sound: 'room.paper',
      level: PAPER,
      from: { scene: 'robe', cue: 'toIcons' },
      to: { scene: 'daily', mark: 'will' },
    },

    {
      sound: 'amb.garden',
      level: -6,
      from: { scene: 'mirror', at: 'start' },
      to: { scene: 'mirror', mark: 'mirror' },
    },
    {
      sound: 'amb.hall',
      level: -17,
      from: { scene: 'message', cue: 'window' },
      to: { scene: 'message', mark: 'three' },
    },
    {
      sound: 'amb.house',
      level: -15,
      from: { scene: 'roof', at: 'start' },
      to: { scene: 'woman', at: 'speech' },
    },
    {
      sound: 'amb.court',
      level: -16,
      from: { scene: 'woman', at: 'start' },
      to: { scene: 'woman', cue: 'toIdea' },
    },
    {
      sound: 'amb.dawn',
      level: -3,
      from: { scene: 'spoke', mark: 'spake' },
      to: { scene: 'centurion', at: 'speech' },
    },
    {
      sound: 'amb.town',
      level: -15,
      from: { scene: 'centurion', at: 'start' },
      to: { scene: 'centurion', cue: 'toIcons' },
    },
    {
      sound: 'amb.desert',
      level: -15,
      from: { scene: 'look', cue: 'toDesert' },
      to: { scene: 'look', cue: 'toIcons' },
    },
    {
      sound: 'amb.dawn',
      level: -16,
      from: { scene: 'exchange', cue: 'dawn' },
      to: { scene: 'exchange', mark: 'up' },
    },
    {
      sound: 'amb.court',
      level: -17,
      from: { scene: 'accuser', at: 'start' },
      to: { scene: 'robe', cue: 'toIcons' },
    },
    {
      sound: 'amb.dawn',
      level: -8,
      from: { scene: 'daily', mark: 'will' },
      to: { scene: 'rain', at: 'speech' },
    },
    {
      sound: 'amb.rain',
      level: -12,
      from: { scene: 'rain', at: 'start' },
      to: { scene: 'name', at: 'speech', offset: 0.2 },
    },

    {
      sound: 'tone.low',
      level: -22,
      from: { scene: 'exchange', cue: 'dark' },
      to: { scene: 'exchange', cue: 'dawn' },
    },
  ],
  effects: {
    lit: {
      sound: 'tone.chime',
      at: [
        { scene: 'message', cue: 'faith' },
        { scene: 'message', cue: 'forgiveness' },
        { scene: 'message', cue: 'power' },
        { scene: 'roof', cue: 'oneLit' },
        { scene: 'roof', cue: 'twoLit' },
        { scene: 'roof', cue: 'threeLit' },
        { scene: 'woman', cue: 'oneLit' },
        { scene: 'woman', cue: 'twoLit' },
        { scene: 'woman', cue: 'threeLit' },
        { scene: 'spoke', cue: 'lead' },
        { scene: 'centurion', cue: 'faithLit' },
        { scene: 'look', cue: 'iconGlow' },
        { scene: 'declared', cue: 'robeLit' },
        { scene: 'robe', cue: 'iconGlow' },
        { scene: 'within', cue: 'heartLit' },
      ],
    },
    drain: { sound: 'tone.drain', at: [{ scene: 'cold', cue: 'drain' }] },
    bloom: {
      sound: 'tone.bloom',
      at: [
        { scene: 'declared', cue: 'bloom' },
        { scene: 'name', mark: 'true' },
      ],
    },

    evidence: {
      sound: 'paper.stack',
      sync: 'hit',
      at: [{ scene: 'cold', cue: 'drop', edge: 'end' }],
    },
    gavel: {
      sound: 'wood.gavel',
      level: -16,
      at: [
        { scene: 'cold', cue: 'gavel', edge: 'end' },
        { scene: 'name', cue: 'gavel', edge: 'end' },
      ],
    },
    stamp: {
      sound: 'stamp.press',
      level: -13,
      at: [
        { scene: 'cold', cue: 'stamp', edge: 'end' },
        { scene: 'name', cue: 'stamp', edge: 'end' },
      ],
    },
    flip: {
      sound: 'paper.flip',
      level: -14,
      sync: 'hit',
      at: [
        { scene: 'word', cue: 'flip', edge: 'end' },
        { scene: 'spoke', cue: 'pages', edge: 'end' },
      ],
    },
    tablets: {
      sound: 'tablet.set',
      level: -19,
      sync: 'hit',
      at: [{ scene: 'word', cue: 'drop', edge: 'end' }],
    },
    tear: { sound: 'paper.tear', at: [{ scene: 'word', cue: 'cardOut' }] },
    tape: { sound: 'tape.measure', at: [{ scene: 'word', cue: 'tape' }] },
    book: { sound: 'book.close', level: -18, at: [{ scene: 'within', cue: 'book' }] },

    leaves: { sound: 'leaves.rustle', at: [{ scene: 'mirror', cue: 'leaves' }] },
    scrub: { sound: 'glass.scrub', at: [{ scene: 'mirror', cue: 'scrub' }] },
    needle: {
      sound: 'needle.thread',
      level: -14,
      sync: 'onset',
      at: [{ scene: 'mirror', cue: 'toSew', edge: 'end' }],
    },

    banner: {
      sound: 'cloth.banner',
      level: -17,
      at: [
        { scene: 'message', mark: 'banner' },
        { scene: 'rain', cue: 'fly' },
      ],
    },
    crowd: { sound: 'crowd.swell', at: [{ scene: 'message', cue: 'light' }] },
    wings: {
      sound: 'wings.pass',
      level: -17,
      sync: 'onset',
      at: [{ scene: 'message', cue: 'fly' }],
    },

    tiles: { sound: 'roof.tiles', at: [{ scene: 'roof', cue: 'tiles' }] },
    rope: { sound: 'rope.creak', at: [{ scene: 'roof', cue: 'lower' }] },
    mat: { sound: 'mat.roll', at: [{ scene: 'roof', cue: 'roll' }] },
    steps: {
      sound: 'steps.dirt',
      level: -15,
      sync: 'onset',
      at: [
        { scene: 'roof', cue: 'walk' },
        { scene: 'woman', cue: 'walkOut' },
        { scene: 'look', cue: 'approach' },
      ],
    },

    writing: { sound: 'dust.writing', at: [{ scene: 'woman', cue: 'writing' }] },
    stones: { sound: 'stones.dust', level: -13, at: [{ scene: 'woman', cue: 'drop' }] },

    whoosh: {
      sound: 'paper.whoosh',
      sync: 'onset',
      at: [
        { scene: 'spoke', cue: 'flight' },
        { scene: 'centurion', cue: 'fly' },
        { scene: 'declared', cue: 'speak' },
      ],
    },

    coins: { sound: 'coins.clatter', at: [{ scene: 'look', cue: 'slide' }] },
    snakes: { sound: 'snake.hiss', at: [{ scene: 'look', mark: 'desert' }] },
    pole: { sound: 'pole.creak', sync: 'onset', at: [{ scene: 'look', cue: 'rise' }] },

    cloth: {
      sound: 'cloth.lift',
      level: -19,
      at: [
        { scene: 'exchange', cue: 'lift' },
        { scene: 'robe', cue: 'lift' },
      ],
    },
    stone: { sound: 'stone.roll', level: -12, at: [{ scene: 'exchange', cue: 'dawn' }] },

    stain: { sound: 'stain.hiss', at: [{ scene: 'accuser', cue: 'flare' }] },
    loom: { sound: 'loom.weave', level: -19, at: [{ scene: 'robe', cue: 'weave' }] },
    settle: { sound: 'cloth.settle', level: -19, at: [{ scene: 'robe', cue: 'settle' }] },
    hall: { sound: 'steps.stone', level: -15, at: [{ scene: 'accuser', cue: 'enter' }] },
  },
};
