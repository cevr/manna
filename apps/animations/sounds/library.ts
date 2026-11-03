import {
  bloom,
  breeze,
  burst,
  chime,
  defineLibrary,
  defineStore,
  drain,
  drone,
  hiss,
  keptFit,
  knock,
  notes,
  rain,
  room,
  scatter,
  sizzle,
  thump,
  whoosh,
} from '@manna/film/core';
import dawnFit from './fits/amb.dawn.json' with { type: 'json' };
import hallFit from './fits/amb.hall.json' with { type: 'json' };
import houseFit from './fits/amb.house.json' with { type: 'json' };
import clothFit from './fits/cloth.lift.json' with { type: 'json' };

const BED_SECS = 22;

const BED_LEVEL = -30;

type Entries = Parameters<typeof defineLibrary>[0];

type CodeTrial = NonNullable<
  Extract<Entries[keyof Entries], { readonly kind: 'generated' }>['code']
>;

interface Declared {
  readonly why: string;
  readonly influence?: number;
  readonly secs?: number;
  readonly code?: CodeTrial;
}

const oneShot = (prompt: string, secs: number, declared: Declared) =>
  ({ kind: 'generated', prompt, secs, use: 'one-shot', ...declared }) as const;

const bed = (prompt: string, declared: Declared) =>
  ({
    kind: 'generated',
    prompt,
    secs: BED_SECS,
    loop: true,
    use: 'bed',
    level: BED_LEVEL,
    ...declared,
  }) as const;

type RecordedLicence = Extract<Entries[keyof Entries], { readonly kind: 'recorded' }>['licence'];

const recordedBed = (licence: RecordedLicence) =>
  ({ kind: 'recorded', licence, use: 'bed', secs: BED_SECS, level: BED_LEVEL }) as const;

const recordedOneShot = (secs: number, licence: RecordedLicence) =>
  ({ kind: 'recorded', licence, use: 'one-shot', secs }) as const;

type KeptLicence = NonNullable<
  Extract<Entries[keyof Entries], { readonly kind: 'code' }>['licence']
>;

type KeptFit = ReturnType<typeof keptFit>;

const keptBed = (fit: KeptFit, licence: KeptLicence) =>
  ({ kind: 'code', ...fit, licence, use: 'bed', level: BED_LEVEL }) as const;

const keptOneShot = (fit: KeptFit, licence: KeptLicence) =>
  ({ kind: 'code', ...fit, licence, use: 'one-shot' }) as const;

type Node = ReturnType<typeof burst>;

const bubble: Node = {
  _tag: 'Envelope',
  points: [
    [0, 1],
    [0.05, 0],
  ],
  curve: 'exponential',
  of: {
    _tag: 'Osc',
    wave: 'sine',
    phase: 0,
    pitch: {
      _tag: 'Ramp',
      from: { _tag: 'Vary', min: 380, max: 560, curve: 'log' },
      to: { _tag: 'Vary', min: 900, max: 1400, curve: 'log' },
      secs: 0.04,
      curve: 'exponential',
    },
    secs: 0.05,
  },
};

export const library = defineLibrary({
  'room.paper': {
    kind: 'code',
    sound: { play: room({ secs: 8 }) },
    variants: 1,
    use: 'bed',
    level: -36,
    duck: false,
  },
  'tone.low': {
    kind: 'code',
    sound: { play: drone({ root: 'D2', secs: 8 }) },
    variants: 1,
    use: 'bed',
    level: -24,
    duck: false,
  },
  'amb.court': bed(
    'murmur of a crowd of people waiting in a large stone hall, many indistinct voices at a distance, soft echo, steady',
    {
      why: 'Many voices at a distance in a stone hall: speech, which code cannot make.',
      influence: 0.6,
    },
  ),
  'amb.hall': keptBed(keptFit(hallFit), {
    id: 'CC-BY-4.0',
    title: 'M Murmer long loop.wav',
    author: 'Processaurus',
    authorUrl: 'https://freesound.org/people/Processaurus',
    source: 'https://freesound.org/people/Processaurus/sounds/440098',
    openverse: 'f7e999a4-bb3d-4dae-9e77-8a53a9d27e48',
    changed: true,
  }),
  'amb.house': keptBed(keptFit(houseFit), {
    id: 'CC0-1.0',
    title: 'G28-10-Indoor Crowd Murmur - Constant.wav',
    author: 'craigsmith',
    authorUrl: 'https://freesound.org/people/craigsmith',
    source: 'https://freesound.org/people/craigsmith/sounds/438369',
    openverse: '9783c4b5-b89a-4cc8-ab1f-b8dc4f6259d3',
    changed: true,
  }),
  'amb.town': bed(
    'people talking in a busy village market street heard from across the square, many indistinct voices, footsteps, a donkey cart, daytime, steady',
    {
      why: 'Voices, steps and a donkey cart across a market: life far off, which code cannot make.',
      influence: 0.6,
    },
  ),
  'amb.garden': bed('songbirds chirping in a garden, light leaf rustle, crisp, close', {
    why: 'Songbirds close by: birdsong, which code cannot make.',
    influence: 0.6,
  }),
  'amb.desert': {
    kind: 'code',
    sound: { play: breeze({ secs: 30, hz: 550 }) },
    variants: 3,
    use: 'bed',
    level: BED_LEVEL,
  },
  'amb.roof': recordedBed({
    id: 'CC-BY-4.0',
    title: 'city night hum 04 160927_0989.wav',
    author: 'klankbeeld',
    authorUrl: 'https://freesound.org/people/klankbeeld',
    source: 'https://freesound.org/people/klankbeeld/sounds/440621',
    openverse: '3bdb3b4b-c840-4fba-8033-48477bf14dee',
    changed: true,
  }),
  'amb.dawn': keptBed(keptFit(dawnFit), {
    id: 'CC0-1.0',
    title: 'dawn chorus.wav',
    author: 'squashy555',
    authorUrl: 'https://freesound.org/people/squashy555',
    source: 'https://freesound.org/people/squashy555/sounds/269244',
    openverse: '1a9c8792-3710-46c8-ae7c-6a0551d7f9a5',
    changed: true,
  }),
  'amb.rain': {
    kind: 'code',
    sound: { play: rain({ secs: BED_SECS, hiss: 900, taps: 10 }) },
    variants: 3,
    use: 'bed',
    level: BED_LEVEL,
  },
  'amb.courtyard': {
    kind: 'code',
    sound: { play: breeze({ secs: 24, hz: 380 }) },
    variants: 1,
    use: 'bed',
    level: BED_LEVEL,
  },
  'milk.pour': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Loop',
        crossfade: 1,
        of: {
          _tag: 'Layer',
          secs: 7,
          of: [
            {
              node: {
                _tag: 'Gain',
                db: { _tag: 'Wobble', around: 0, depth: 3, rate: 7 },
                of: {
                  _tag: 'Filter',
                  type: 'bandpass',
                  hz: { _tag: 'Wobble', around: 1100, depth: 4, rate: 5 },
                  q: 2,
                  of: { _tag: 'Noise', color: 'pink', secs: 7 },
                },
              },
            },
            {
              node: {
                _tag: 'Filter',
                type: 'lowpass',
                hz: 700,
                q: 0.7,
                of: {
                  _tag: 'Filter',
                  type: 'highpass',
                  hz: 120,
                  q: 0.7,
                  of: { _tag: 'Noise', color: 'brown', secs: 7 },
                },
              },
              db: -10,
            },
            {
              node: { _tag: 'Repeat', timing: { _tag: 'Poisson', rate: 9, secs: 6.9 }, of: bubble },
              db: -9,
            },
          ],
        },
      },
    },
    variants: 2,
    use: 'bed',
    level: BED_LEVEL,
    duck: false,
  },

  'paper.stack': oneShot(
    'a stack of paper documents dropped flat onto a wooden desk, close, dry',
    1.5,
    { why: 'A stack of sheets landing on wood: a handled texture, which code cannot make.' },
  ),
  'wood.gavel': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Layer',
        of: [
          { node: knock({ material: 'wood', hz: 480, secs: 0.3 }), at: 0.025 },
          { node: thump({ hz: 90, octaves: 1, drop: 0.02, decay: 0.4 }), at: 0.025, db: -16 },
        ],
      },
    },
    variants: 3,
    use: 'one-shot',
    level: -8,
  },
  'stamp.press': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Layer',
        of: [
          { node: burst({ color: 'white', low: 300, high: 16000, attack: 0.0003, decay: 0.06 }) },
          {
            node: burst({ color: 'pink', low: 500, high: 2000, attack: 0.0005, decay: 0.03 }),
            db: 3,
          },
          { node: thump({ hz: 90, octaves: 0.5, drop: 0.01, decay: 0.12 }), db: -14 },
        ],
      },
    },
    variants: 3,
    use: 'one-shot',
  },
  'paper.slide': oneShot(
    'a sheet of thick paper sliding across a wooden desk, soft and short, close, dry room',
    1,
    { why: 'Thick paper sliding on wood: a handled texture, which code cannot make.' },
  ),
  'paper.flip': oneShot('a single page flipped over quickly, crisp paper, close', 0.8, {
    why: 'A crisp page flipped: a handled texture, which code cannot make.',
  }),
  'crowd.swell': oneShot(
    'a crowd murmur growing louder, many people talking at once indoors, rising excitement, no clear words',
    3,
    { why: 'A crowd talking louder and louder: speech, which code cannot make.', influence: 0.5 },
  ),
  'roof.tiles': oneShot(
    'clay roof tiles lifted and scraped aside, a few pieces clinking, outdoors',
    1.5,
    { why: 'Clay tiles scraped and clinking: a handled texture, which code cannot make.' },
  ),
  'wings.pass': recordedOneShot(1.5, {
    id: 'CC0-1.0',
    title: 'short pigeon wing flap',
    author: 'zouzmusic',
    authorUrl: 'https://freesound.org/people/zouzmusic',
    source: 'https://freesound.org/people/zouzmusic/sounds/414671',
    openverse: 'cc46e8c4-cdd8-4927-9296-f5454a42b188',
    changed: true,
  }),
  'cloth.banner': oneShot(
    'a cloth flag flapping and snapping once, crisp fabric flutter, close, dry',
    1.5,
    { why: 'A flag flapping and snapping: a handled texture, which code cannot make.' },
  ),
  'rope.creak': oneShot(
    'a thick hemp rope stretching under a heavy load, one slow long creak, close, dry',
    2,
    {
      why: 'Generated until a code version is tried: a creak is a stick-slip texture code may make.',
    },
  ),
  'mat.roll': oneShot(
    'a dry straw mat rolled up on a wooden floor, reeds crackling and rustling, close',
    1.2,
    {
      why: 'Reeds crackling as a mat rolls: a handled texture, which code cannot make.',
      influence: 0.5,
    },
  ),
  'steps.dirt': oneShot('a few slow footsteps in sandals on a dirt path, outdoors, close', 2.5, {
    why: 'Sandals on a dirt path: steps, which code cannot make.',
  }),
  'dust.writing': oneShot('a finger writing slowly in dust on a stone floor, soft scratching', 2, {
    why: 'A finger scratching in dust: a handled texture, which code cannot make.',
  }),
  'stones.dust': {
    kind: 'code',
    sound: {
      play: scatter({
        count: 4,
        first: 0.025,
        every: 0.17,
        fall: 6,
        material: 'stone',
        hz: 600,
        secs: 1,
      }),
    },
    variants: 3,
    use: 'one-shot',
  },
  'tape.measure': oneShot(
    'a long soft fabric ribbon pulled quickly through fingers and flicked straight, light cloth flutter, close, dry',
    0.8,
    {
      why: 'A ribbon pulled through fingers: a handled texture, which code cannot make.',
      influence: 0.5,
    },
  ),
  'tablet.set': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Layer',
        of: [
          { node: knock({ material: 'stone', hz: 165, secs: 0.4 }) },
          { node: thump({ hz: 88, octaves: 1, drop: 0.015, decay: 0.3 }), db: -5 },
        ],
      },
    },
    variants: 3,
    use: 'one-shot',
  },
  'needle.thread': recordedOneShot(2, {
    id: 'CC0-1.0',
    title: 'Sewing/stitching up some fabric',
    author: 'pfranzen',
    authorUrl: 'https://freesound.org/people/pfranzen',
    source: 'https://freesound.org/people/pfranzen/sounds/188178',
    openverse: '4afaf220-c6f2-45ec-8ad0-2e92cce81db2',
    changed: true,
  }),
  'leaves.rustle': oneShot('a handful of fig leaves rustling as they are gathered, close', 2, {
    why: 'Fig leaves gathered in a hand: a handled texture, which code cannot make.',
  }),
  'glass.scrub': oneShot('a cloth scrubbing a mirror in small circles, squeaky, close', 1.5, {
    why: 'A cloth squeaking on a mirror: a handled texture, which code cannot make.',
  }),
  'paper.tear': oneShot('a sheet of paper torn in one quick rip, close, dry', 1, {
    why: 'Paper torn in one rip: a handled texture, which code cannot make.',
  }),
  'paper.whoosh': {
    kind: 'code',
    sound: { play: whoosh({ onset: 0.03, hit: 0.4, fall: 0.22, low: 1200, high: 6000, q: 0.5 }) },
    variants: 3,
    use: 'one-shot',
  },
  'cloth.lift': keptOneShot(keptFit(clothFit), {
    id: 'CC0-1.0',
    title: 'clothing movement',
    author: 'Kodack',
    authorUrl: 'https://freesound.org/people/Kodack',
    source: 'https://freesound.org/people/Kodack/sounds/256310',
    openverse: '8b10b111-9719-47fe-8cd5-be53fb96db26',
    changed: true,
  }),
  'stone.roll': oneShot(
    'a large round stone rolled slowly aside in a stone groove, deep rumble',
    3,
    {
      why: 'Generated until a code version is tried: a rolled stone’s rumble is a texture code may make.',
    },
  ),
  'stain.hiss': {
    kind: 'code',
    sound: { play: sizzle({ flash: 0.02, crackle: 120, secs: 1.6 }) },
    variants: 3,
    use: 'one-shot',
  },
  'steps.stone': {
    kind: 'recorded',
    licence: {
      id: 'CC0-1.0',
      author: 'LordFluffeh',
      source: 'https://freesound.org/people/LordFluffeh/sounds/478545/',
    },
    use: 'one-shot',
  },
  'loom.weave': oneShot(
    'a wooden hand loom, the shuttle passed and the beater pressed twice',
    2.5,
    { why: 'A shuttle passed and a beater pressed: a handled texture, which code cannot make.' },
  ),
  'cloth.settle': oneShot(
    'a robe settling onto shoulders, soft cloth falling into place, close',
    1.2,
    { why: 'A robe falling into place: a handled texture, which code cannot make.' },
  ),
  'coins.clatter': oneShot(
    'a handful of old coins sliding and clattering onto a wooden table',
    1.5,
    { why: 'Coins sliding and clattering on wood: a handled texture, which code cannot make.' },
  ),
  'snake.hiss': {
    kind: 'code',
    sound: {
      play: hiss({ hz: 8500, q: 1.2, top: 11000, breath: -24, rise: 0.4, hold: 1.3, secs: 2 }),
    },
    variants: 3,
    use: 'one-shot',
  },
  'pole.creak': oneShot('a tall wooden pole raised upright and creaking as it settles', 2, {
    why: 'Generated until a code version is tried: a creak is a stick-slip texture code may make.',
  }),
  'book.close': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Reverb',
        size: 0.5,
        damp: 3000,
        wet: 0.2,
        tail: 0.5,
        of: {
          _tag: 'Layer',
          of: [
            { node: thump({ hz: 120, octaves: 1, drop: 0.02, decay: 0.25 }), at: 0.015 },
            { node: thump({ hz: 36, octaves: 1, drop: 0.03, decay: 0.45 }), at: 0.015, db: -15 },
            {
              node: burst({ color: 'pink', low: 200, high: 600, attack: 0.002, decay: 0.12 }),
              at: 0.015,
              db: -6,
            },
            {
              node: burst({ color: 'pink', low: 1100, high: 2400, attack: 0.001, decay: 0.04 }),
              at: 0.015,
              db: -3,
            },
            {
              node: burst({ color: 'white', low: 3000, high: 12000, attack: 0.002, decay: 0.08 }),
              at: 0.015,
              db: -14,
            },
          ],
        },
      },
    },
    variants: 3,
    use: 'one-shot',
  },
  'scroll.drop': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Layer',
        of: [
          { node: knock({ material: 'wood', hz: 240, secs: 0.25 }), at: 0.02 },
          { node: thump({ hz: 100, octaves: 1, drop: 0.02, decay: 0.3 }), at: 0.02, db: -8 },
          {
            node: burst({ color: 'pink', low: 600, high: 2500, attack: 0.002, decay: 0.09 }),
            at: 0.02,
            db: -6,
          },
        ],
      },
    },
    variants: 3,
    use: 'one-shot',
  },
  'scroll.unroll': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Layer',
        of: [
          {
            node: {
              _tag: 'Envelope',
              points: [
                [0, 0],
                [0.15, 0.5],
                [0.65, 1],
                [1.15, 0.15],
                [1.3, 0],
              ],
              curve: 'linear',
              of: {
                _tag: 'Filter',
                type: 'bandpass',
                hz: {
                  _tag: 'Points',
                  points: [
                    [0, 1400],
                    [1.3, 2600],
                  ],
                  curve: 'exponential',
                },
                q: 0.9,
                of: { _tag: 'Noise', color: 'pink', secs: 1.3 },
              },
            },
          },
          {
            node: {
              _tag: 'Envelope',
              points: [
                [0, 0],
                [0.15, 0.6],
                [0.65, 1],
                [1.15, 0.2],
                [1.3, 0],
              ],
              curve: 'linear',
              of: {
                _tag: 'Repeat',
                timing: { _tag: 'Poisson', rate: 30, secs: 1.25 },
                of: burst({ color: 'white', low: 2000, high: 8000, attack: 0.0005, decay: 0.015 }),
              },
            },
            db: -10,
          },
          {
            node: burst({ color: 'pink', low: 400, high: 2000, attack: 0.004, decay: 0.12 }),
            at: 1.1,
            db: -8,
          },
        ],
      },
    },
    variants: 3,
    use: 'one-shot',
  },
  'tone.drain': {
    kind: 'code',
    sound: { play: drain({ from: 'D4', to: 'A2', secs: 1.5 }) },
    variants: 1,
    use: 'one-shot',
    level: -16,
  },
  'tone.chime': {
    kind: 'code',
    sound: { play: chime({ root: 'D5', partials: 'glass', secs: 1.5 }) },
    variants: 5,
    use: 'one-shot',
    level: -18,
  },
  'tone.bloom': {
    kind: 'code',
    sound: { play: bloom({ root: 'D4', secs: 2.5 }) },
    variants: 2,
    use: 'one-shot',
    level: -16,
  },
  'tone.notes': {
    kind: 'code',
    sound: { play: notes({ root: 'D5', count: 4, secs: 1.5 }) },
    variants: 3,
    use: 'one-shot',
    level: -16,
  },
});

export const store = defineStore({ kind: 'folder', folder: '~/film-sounds' });
