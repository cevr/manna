export type Part = 'S' | 'A' | 'T' | 'B';

export interface Stem {
  readonly name: string;
  readonly sfz: string;
  readonly parts: Partial<Record<Part, number>>;
  readonly transpose: number;
  readonly level: number;
  readonly pan: number;
  readonly range?: { readonly low: number; readonly high: number };
}

export const PIANO_SFZ = 'salamander/Salamander Grand Piano V3.sfz';

export const STYLE = {
  name: 'C',
  title: 'Warm band',
  rate: 44100,
  stems: [
    {
      name: 'piano',
      sfz: PIANO_SFZ,
      parts: { S: 84, A: 64, T: 64, B: 70 },
      transpose: 0,
      level: 0,
      pan: 0,
    },
    {
      name: 'violas',
      sfz: 'vsco/ViolaEnsSusVib.sfz',
      parts: { A: 70 },
      transpose: 0,
      level: -8,
      pan: 0.25,
    },
    {
      name: 'cellos',
      sfz: 'vsco/CelloEnsSusVib.sfz',
      parts: { T: 70 },
      transpose: 0,
      level: -8,
      pan: -0.2,
    },
    {
      name: 'bass',
      sfz: 'vsco/ContrabassSusNV.sfz',
      parts: { B: 60 },
      transpose: -12,
      level: -11,
      pan: 0,
    },
    {
      name: 'violins-melody',
      sfz: 'vsco/ViolinEnsSusVib.sfz',
      parts: { S: 60 },
      transpose: 0,
      level: -10,
      pan: -0.3,
    },
  ] satisfies ReadonlyArray<Stem>,
  humanise: 5,
  reverb: { ir: 'room-C.wav', wet: 0.24 },
  tail: 2,
  fade: 0.8,
  sfizz: { quality: 3, polyphony: 128, block: 512 },
  stemLufs: -23,
  master: {
    preLufs: -20,
    targetLufs: -16,
    within: 0.2,
    passes: 3,
    compressor: 'threshold=-24dB:ratio=2:attack=25:release=300:knee=6:makeup=1:detection=rms',
    limitDb: -2,
    limiter: 'attack=5:release=80:level=0:latency=1',
    bitrate: '192k',
  },
} as const;

export type Style = Omit<typeof STYLE, 'stems'> & { readonly stems: ReadonlyArray<Stem> };
