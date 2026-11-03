import { dbToGain, exp, exp2, log } from './math.ts';
import type { Node, Pitch, Ramp, Value } from './nodes.ts';
import { noteMidi, pitchHz } from './pitch.ts';

const ANY_KEY = { tonic: 'C', scale: 'major' } as const;

const DB_LN = Math.LN10 / 20;

const db = (level: number): number => log(level) / DB_LN;

const hz = (note: string): number => pitchHz(note, ANY_KEY);

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const nameOf = (midi: number): string => `${NAMES[midi % 12] ?? 'C'}${Math.floor(midi / 12) - 1}`;

const PENTATONIC = [0, 2, 4, 7, 9] as const;

const degreeNote = (root: string, degree: number): string => {
  const octaves = Math.floor(degree / PENTATONIC.length);
  const step = PENTATONIC[degree - octaves * PENTATONIC.length] ?? 0;
  return nameOf(noteMidi(root) + 12 * octaves + step);
};

const degreeNotes = (root: string, count: number): readonly [string, ...Array<string>] => [
  degreeNote(root, 0),
  ...Array.from({ length: count - 1 }, (_, k) => degreeNote(root, k + 1)),
];

const pink = (secs: number): Node => ({ _tag: 'Noise', color: 'pink', secs });

const brown = (secs: number): Node => ({ _tag: 'Noise', color: 'brown', secs });

const lowpass = (at: number, of: Node): Node => ({
  _tag: 'Filter',
  type: 'lowpass',
  hz: at,
  q: 0.7,
  of,
});

const highpass = (at: number, of: Node): Node => ({
  _tag: 'Filter',
  type: 'highpass',
  hz: at,
  q: 0.7,
  of,
});

const sine = (pitch: number, secs: number): Node => ({ _tag: 'Osc', wave: 'sine', pitch, secs });

const sinhc = (x: number): number => (x === 0 ? 1 : (exp(x) - exp(-x)) / (2 * x));

const MEAN_POINTS = 64;

const wobblePower = (c: number): number => {
  let sum = 0;
  for (let j = 0; j < MEAN_POINTS; j++) {
    const f = (j + 0.5) / MEAN_POINTS;
    const s = f * f * (3 - 2 * f);
    sum += sinhc(2 * c * (1 - s)) * sinhc(2 * c * s);
  }
  return sum / MEAN_POINTS;
};

const wanderPower = (low: number, high: number): number => {
  const d = high - low;
  return low * low + low * d + (d * d * 131) / 420;
};

const swaying = (low: number, high: number, rate: number, of: Node): Node => {
  const depth = (db(high) - db(low)) / 2;
  const around = (log(wanderPower(low, high)) - log(wobblePower(depth * DB_LN))) / (2 * DB_LN);
  return { _tag: 'Gain', db: { _tag: 'Wobble', around, depth, rate }, of };
};

const levelBetween = (min: number, max: number, of: Node): Node => ({
  _tag: 'Envelope',
  points: [[0, { _tag: 'Vary', min, max }]],
  curve: 'linear',
  of,
});

const BED_LOOP = 1;

export const room = (settings: { readonly secs: number }): Node => {
  const made = settings.secs + BED_LOOP;
  return {
    _tag: 'Loop',
    crossfade: BED_LOOP,
    of: swaying(0.85, 1.15, 0.2, {
      _tag: 'Layer',
      of: [
        { node: lowpass(300, brown(made)), db: db(0.7) },
        { node: highpass(180, lowpass(2500, pink(made))), db: db(0.25) },
      ],
    }),
  };
};

export const chime = (settings: {
  readonly root: string;
  readonly partials: 'glass' | 'bell';
  readonly secs: number;
}): Node => ({
  _tag: 'Fade',
  in: 0.05,
  out: 0.05,
  of: {
    _tag: 'Partials',
    pitch: { _tag: 'Pick', of: degreeNotes(settings.root, PENTATONIC.length), by: 'seed' },
    set: settings.partials,
    secs: settings.secs,
  },
});

export const drone = (settings: { readonly root: string; readonly secs: number }): Node => {
  const made = settings.secs + BED_LOOP;
  const root = hz(settings.root);
  return {
    _tag: 'Loop',
    crossfade: BED_LOOP,
    of: swaying(0.8, 1, 0.15, {
      _tag: 'Layer',
      of: [
        { node: sine(root, made) },
        { node: sine(root * 2, made), db: db(0.35) },
        { node: sine(root * 3, made), db: db(0.12) },
        { node: sine(root * 1.5, made), db: db(0.18) },
      ],
    }),
  };
};

const DRAIN_LINES = 16;

const DRAIN_RISE = 0.03;

const drainLevels = (
  secs: number,
): readonly [readonly [number, number], ...Array<readonly [number, number]>] => {
  const fall = (t: number) => {
    const y = 1 - t / secs;
    return y * Math.sqrt(y);
  };
  const lines = Array.from({ length: DRAIN_LINES }, (_, j): readonly [number, number] => {
    const t = DRAIN_RISE + ((secs - DRAIN_RISE) * j) / DRAIN_LINES;
    return [t, fall(t)];
  });
  return [[0, 0], ...lines, [secs, 0]];
};

export const drain = (settings: {
  readonly from: string;
  readonly to: string;
  readonly secs: number;
}): Node => {
  const from = hz(settings.from);
  const to = hz(settings.to);
  const glide = (times: number): Ramp<Pitch> => ({
    _tag: 'Ramp',
    from: from * times,
    to: to * times,
    curve: 'exponential',
  });
  const secs = settings.secs;
  return {
    _tag: 'Fade',
    in: 0.01,
    out: 0.01,
    of: {
      _tag: 'Envelope',
      points: drainLevels(secs),
      curve: 'linear',
      of: {
        _tag: 'Layer',
        of: [
          { node: { _tag: 'Osc', wave: 'sine', pitch: glide(1), secs }, db: db(0.8) },
          { node: { _tag: 'Osc', wave: 'sine', pitch: glide(2), secs }, db: db(0.15) },
          {
            node: { _tag: 'Filter', type: 'bandpass', hz: glide(2), q: 3, of: pink(secs) },
            db: db(0.6),
          },
        ],
      },
    },
  };
};

const BLOOM_DEGREES = [0, 2, 3, 5] as const;

export const bloom = (settings: { readonly root: string; readonly secs: number }): Node => {
  const secs = settings.secs;
  const shimmer: Node = {
    _tag: 'Envelope',
    points: [
      [0, 0],
      [secs / 2, 1],
      [secs, 0],
    ],
    curve: 'smooth',
    of: {
      _tag: 'Filter',
      type: 'bandpass',
      hz: { _tag: 'Ramp', from: 2000, to: 6000, curve: 'linear' },
      q: 1.2,
      of: highpass(1500, pink(secs)),
    },
  };
  const note = (degree: number): Node => ({
    _tag: 'Envelope',
    points: [
      [0, 0],
      [0.25, 1],
    ],
    curve: 'linear',
    of: { _tag: 'Partials', pitch: degreeNote(settings.root, degree), set: 'glass', secs },
  });
  return {
    _tag: 'Fade',
    in: 0.05,
    out: 0.05,
    of: {
      _tag: 'Layer',
      secs,
      of: [
        { node: shimmer, db: db(0.25) },
        ...BLOOM_DEGREES.map((degree, k) => ({
          node: note(degree),
          at: { _tag: 'Vary', min: k * 0.09, max: k * 0.09 + 0.04 } as const,
          db: db(0.7 - k * 0.1),
        })),
      ],
    },
  };
};

export const notes = (settings: {
  readonly root: string;
  readonly count: number;
  readonly secs: number;
}): Node => {
  const secs = settings.secs;
  const every = (secs * 0.7) / settings.count;
  const plink: Node = levelBetween(0.5, 1, {
    _tag: 'Partials',
    pitch: { _tag: 'Pick', of: degreeNotes(settings.root, 2 * PENTATONIC.length), by: 'chance' },
    set: 'bell',
    decayScale: 0.3,
    secs,
  });
  return {
    _tag: 'Fade',
    in: 0.05,
    out: 0.05,
    of: {
      _tag: 'Layer',
      secs,
      of: [
        {
          node: {
            _tag: 'Repeat',
            timing: { _tag: 'Count', every, count: settings.count },
            of: {
              _tag: 'Layer',
              of: [{ node: plink, at: { _tag: 'Vary', min: 0, max: 0.6 * every } }],
            },
          },
        },
      ],
    },
  };
};

const RAIN_LOOP = 0.5;

const DROP_SECS = 300 / 44100;

const DROP_RISE = 0.0005;
const DROP_FALL = 0.002;

const DROP: Node = levelBetween(0.2, 1, {
  _tag: 'Envelope',
  points: [
    [0, 0],
    [DROP_RISE, 1],
  ],
  curve: 'linear',
  of: {
    _tag: 'Envelope',
    points: [
      [DROP_RISE, 1],
      [DROP_SECS, exp(-(DROP_SECS - DROP_RISE) / DROP_FALL)],
    ],
    curve: 'exponential',
    of: {
      _tag: 'Filter',
      type: 'bandpass',
      hz: { _tag: 'Vary', min: 1500, max: 6500 },
      q: 6,
      of: { _tag: 'Noise', color: 'white', secs: DROP_SECS },
    },
  },
});

const DROPS = 44100 / 250;

const TAP: Node = levelBetween(0.3, 1, {
  _tag: 'Partials',
  pitch: { _tag: 'Vary', min: 1200, max: 3000, curve: 'log' },
  set: [
    { ratio: 1, level: 1, decay: 0.006 },
    { ratio: 1.7, level: 0.5, decay: 0.004 },
  ],
  attack: 0.0003,
  secs: 0.03,
});

export const rain = (settings: {
  readonly secs: number;
  readonly hiss: number;
  readonly taps?: number;
}): Node => {
  const made = settings.secs + RAIN_LOOP;
  const taps: ReadonlyArray<{ readonly node: Node; readonly db: number }> =
    settings.taps === undefined
      ? []
      : [
          {
            node: {
              _tag: 'Repeat',
              timing: { _tag: 'Poisson', rate: settings.taps, secs: made },
              of: TAP,
            },
            db: -6,
          },
        ];
  return {
    _tag: 'Loop',
    crossfade: RAIN_LOOP,
    of: {
      _tag: 'Layer',
      secs: made,
      of: [
        { node: highpass(settings.hiss, pink(made)), db: db(0.25) },
        {
          node: {
            _tag: 'Repeat',
            timing: { _tag: 'Poisson', rate: DROPS, secs: made },
            of: DROP,
          },
        },
        ...taps,
      ],
    },
  };
};

const level = (gain: number): number => dbToGain(gain);

const around = (hz: number, spread: number): Value<number> => ({
  _tag: 'Vary',
  min: hz / exp2(spread / 12),
  max: hz * exp2(spread / 12),
  curve: 'log',
});

const struck = (attack: number, end: number, depth: number, of: Node): Node => ({
  _tag: 'Envelope',
  points: [
    [0, 0],
    [attack, 1],
    [end, level(-depth)],
  ],
  curve: 'exponential',
  of,
});

export const burst = (settings: {
  readonly color: 'white' | 'pink' | 'brown';
  readonly low: number;
  readonly high: number;
  readonly attack: number;
  readonly decay: number;
}): Node => ({
  _tag: 'Filter',
  type: 'lowpass',
  hz: around(settings.high, 2),
  q: 0.7,
  of: {
    _tag: 'Filter',
    type: 'highpass',
    hz: around(settings.low, 2),
    q: 0.7,
    of: struck(settings.attack, settings.decay, 80, {
      _tag: 'Noise',
      color: settings.color,
      secs: settings.decay,
    }),
  },
});

export const thump = (settings: {
  readonly hz: number;
  readonly octaves: number;
  readonly drop: number;
  readonly decay: number;
}): Node =>
  highpass(
    settings.hz / 2,
    struck(0.001, settings.decay, 80, {
      _tag: 'Osc',
      wave: 'sine',
      phase: 0,
      pitch: {
        _tag: 'Ramp',
        from: around(settings.hz * exp2(settings.octaves), 1),
        to: around(settings.hz, 1),
        secs: settings.drop,
        curve: 'exponential',
      },
      secs: settings.decay,
    }),
  );

const MATERIALS = {
  wood: {
    modes: [
      { ratio: 0.6, level: 0.3, decay: 0.015 },
      { ratio: 1, level: 1, decay: 0.012 },
      { ratio: 1.35, level: 0.4, decay: 0.01 },
      { ratio: 2.1, level: 0.7, decay: 0.009 },
      { ratio: 2.6, level: 0.9, decay: 0.008 },
      { ratio: 3.4, level: 0.6, decay: 0.006 },
      { ratio: 5.1, level: 0.25, decay: 0.004 },
    ],
    contact: { color: 'pink', low: 1.2, high: 6, db: 8, decay: 0.03 },
  },
  stone: {
    modes: [
      { ratio: 1, level: 0.6, decay: 0.03 },
      { ratio: 1.3, level: 0.5, decay: 0.025 },
      { ratio: 2, level: 0.3, decay: 0.02 },
      { ratio: 2.5, level: 0.6, decay: 0.016 },
      { ratio: 3.2, level: 0.7, decay: 0.012 },
      { ratio: 4.1, level: 0.4, decay: 0.008 },
      { ratio: 5.3, level: 0.2, decay: 0.006 },
    ],
    contact: { color: 'pink', low: 1, high: 2.5, db: 18, decay: 0.2 },
  },
} as const;

export const knock = (settings: {
  readonly material: keyof typeof MATERIALS;
  readonly hz: number;
  readonly secs: number;
}): Node => {
  const material = MATERIALS[settings.material];
  return highpass(settings.hz / 4, {
    _tag: 'Layer',
    of: [
      {
        node: {
          _tag: 'Partials',
          pitch: around(settings.hz, 1),
          set: material.modes,
          attack: 0.0005,
          secs: settings.secs,
        },
      },
      {
        node: burst({
          color: material.contact.color,
          low: settings.hz * material.contact.low,
          high: settings.hz * material.contact.high,
          attack: 0.0002,
          decay: material.contact.decay,
        }),
        db: material.contact.db,
      },
    ],
  });
};

export const scatter = (settings: {
  readonly count: number;
  readonly first: number;
  readonly every: number;
  readonly fall: number;
  readonly material: keyof typeof MATERIALS;
  readonly hz: number;
  readonly secs: number;
}): Node => {
  const landing: Node = lowpass(settings.hz * 3, {
    _tag: 'Layer',
    of: [
      { node: knock({ material: settings.material, hz: settings.hz, secs: 0.3 }) },
      {
        node: thump({ hz: settings.hz / 8, octaves: 0.5, drop: 0.015, decay: 0.2 }),
        db: -14,
      },
      {
        node: burst({ color: 'pink', low: 600, high: 1600, attack: 0.001, decay: 0.08 }),
        db: -10,
      },
    ],
  });
  const at = (k: number): Value<number> => {
    const mean = settings.first + k * settings.every;
    if (k === 0) return mean;
    return { _tag: 'Vary', min: mean - settings.every / 3, max: mean + settings.every / 3 };
  };
  return {
    _tag: 'Layer',
    secs: settings.secs,
    of: [
      { node: landing, at: at(0) },
      ...Array.from({ length: settings.count - 1 }, (_, j) => ({
        node: landing,
        at: at(j + 1),
        db: -settings.fall * (j + 1),
      })),
    ],
  };
};

export const whoosh = (settings: {
  readonly onset: number;
  readonly hit: number;
  readonly fall: number;
  readonly low: number;
  readonly high: number;
  readonly q: number;
}): Node => {
  const end = settings.hit + settings.fall;
  const near = Math.max(settings.onset, settings.hit - 0.2);
  return {
    _tag: 'Envelope',
    points: [
      [0, 0],
      [settings.onset, level(-30)],
      [near, level(-8)],
      [settings.hit, 1],
      [end, level(-40)],
    ],
    curve: 'exponential',
    of: {
      _tag: 'Filter',
      type: 'bandpass',
      hz: {
        _tag: 'Points',
        points: [
          [0, settings.low * 2],
          [settings.hit, around(settings.high, 2)],
          [end, settings.low * 2],
        ],
        curve: 'exponential',
      },
      q: settings.q,
      of: highpass(settings.low, { _tag: 'Noise', color: 'pink', secs: end }),
    },
  };
};

export const hiss = (settings: {
  readonly hz: number;
  readonly q: number;
  readonly top: number;
  readonly breath: number;
  readonly rise: number;
  readonly hold: number;
  readonly secs: number;
}): Node => ({
  _tag: 'Envelope',
  points: [
    [0, 0],
    [settings.rise, 1],
    [settings.secs, 1],
  ],
  curve: 'linear',
  of: {
    _tag: 'Envelope',
    points: [
      [0, 1],
      [settings.hold, 1],
      [settings.secs, level(-60)],
    ],
    curve: 'exponential',
    of: {
      _tag: 'Layer',
      of: [
        {
          node: lowpass(settings.top, {
            _tag: 'Filter',
            type: 'bandpass',
            hz: around(settings.hz, 2),
            q: settings.q,
            of: { _tag: 'Noise', color: 'white', secs: settings.secs },
          }),
        },
        { node: lowpass(450, highpass(40, pink(settings.secs))), db: settings.breath },
      ],
    },
  },
});

const POP: Node = levelBetween(0.2, 1, {
  _tag: 'Filter',
  type: 'highpass',
  hz: 3000,
  q: 0.7,
  of: { _tag: 'Noise', color: 'white', secs: 0.0015 },
});

export const sizzle = (settings: {
  readonly flash: number;
  readonly crackle: number;
  readonly secs: number;
}): Node => {
  const steam = (secs: number): Node => ({
    _tag: 'Filter',
    type: 'highpass',
    hz: around(700, 2),
    q: 0.5,
    of: { _tag: 'Noise', color: 'white', secs },
  });
  return {
    _tag: 'Layer',
    of: [
      { node: struck(0.002, 0.12, 80, steam(0.12)), at: settings.flash },
      {
        node: struck(0.01, settings.secs, 45, {
          _tag: 'Layer',
          of: [
            { node: steam(settings.secs) },
            { node: highpass(60, pink(settings.secs)), db: -12 },
            {
              node: {
                _tag: 'Repeat',
                timing: { _tag: 'Poisson', rate: settings.crackle, secs: settings.secs },
                of: POP,
              },
              db: -6,
            },
          ],
        }),
        db: -4,
      },
    ],
  };
};

export const breeze = (settings: { readonly secs: number; readonly hz: number }): Node => {
  const made = settings.secs + BED_LOOP;
  return {
    _tag: 'Loop',
    crossfade: BED_LOOP,
    of: {
      _tag: 'Gain',
      db: { _tag: 'Wobble', around: 0, depth: 1.5, rate: 0.15 },
      of: {
        _tag: 'Filter',
        type: 'bandpass',
        hz: { _tag: 'Wobble', around: settings.hz, depth: 3, rate: 0.1 },
        q: 0.7,
        of: lowpass(settings.hz * 2.5, highpass(90, pink(made))),
      },
    },
  };
};
