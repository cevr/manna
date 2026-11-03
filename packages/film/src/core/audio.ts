export interface Pcm {
  readonly rate: number;
  readonly frames: number;
  readonly channels: ReadonlyArray<Float32Array>;
}

export const silence = (rate: number, frames: number, channels: number): Pcm => ({
  rate,
  frames,
  channels: Array.from({ length: channels }, () => new Float32Array(frames)),
});

export const concat = (rate: number, channels: number, blocks: ReadonlyArray<Pcm>): Pcm => {
  const frames = blocks.reduce((sum, block) => sum + block.frames, 0);
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  let at = 0;
  for (const block of blocks) {
    for (const [c, plane] of block.channels.entries())
      out[c]?.set(plane.subarray(0, block.frames), at);
    at += block.frames;
  }
  return { rate, frames, channels: out };
};

export const slice = (pcm: Pcm, from: number, frames: number): Pcm => ({
  rate: pcm.rate,
  frames,
  channels: pcm.channels.map((plane) => {
    const out = new Float32Array(frames);
    out.set(plane.subarray(from, Math.min(pcm.frames, from + frames)));
    return out;
  }),
});

interface Piece {
  readonly from: number;
  readonly frames: number;
}

export const splice = (pcm: Pcm, pieces: ReadonlyArray<Piece>, fade: number): Pcm => {
  const out = concat(
    pcm.rate,
    pcm.channels.length,
    pieces.map((p) => slice(pcm, p.from, p.frames)),
  );
  let at = 0;
  for (const [k, piece] of pieces.entries()) {
    const n = Math.min(fade, piece.frames);
    for (const plane of out.channels)
      for (let i = 0; i < n; i++) {
        const gain = (i + 0.5) / n;
        if (k > 0) plane[at + i] = (plane[at + i] ?? 0) * gain;
        if (k < pieces.length - 1) {
          const j = at + piece.frames - 1 - i;
          plane[j] = (plane[j] ?? 0) * gain;
        }
      }
    at += piece.frames;
  }
  return out;
};

export const fadeEdges = (pcm: Pcm, seconds: number): Pcm => {
  const n = Math.min(Math.round(seconds * pcm.rate), Math.floor(pcm.frames / 2));
  return {
    ...pcm,
    channels: pcm.channels.map((plane) => {
      const out = plane.slice(0, pcm.frames);
      for (let i = 0; i < n; i++) {
        const k = i / n;
        out[i] = (out[i] ?? 0) * k;
        out[pcm.frames - 1 - i] = (out[pcm.frames - 1 - i] ?? 0) * k;
      }
      return out;
    }),
  };
};

export const toStereo = (pcm: Pcm): Pcm => {
  const [first, second] = pcm.channels;
  if (first === undefined) return silence(pcm.rate, pcm.frames, 2);
  if (second !== undefined) return { ...pcm, channels: [first, second] };
  const side = first.map((x) => x * Math.SQRT1_2);
  return { ...pcm, channels: [side, side.slice()] };
};

const lrint = (v: number): number => {
  const floor = Math.floor(v);
  const frac = v - floor;
  if (frac > 0.5) return floor + 1;
  if (frac < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
};

export const toInt16 = (pcm: Pcm): Int16Array => {
  const n = pcm.channels.length;
  const out = new Int16Array(pcm.frames * n);
  for (const [c, channel] of pcm.channels.entries())
    for (let i = 0; i < pcm.frames; i++)
      out[i * n + c] = Math.max(-32768, Math.min(32767, lrint((channel[i] ?? 0) * 32768)));
  return out;
};

interface Levels {
  readonly mean: number;
  readonly peak: number;
}

export const levels = (pcm: Pcm): Levels => {
  let power = 0;
  let peak = 0;
  for (const channel of pcm.channels)
    for (const x of channel) {
      power += x * x;
      peak = Math.max(peak, Math.abs(x));
    }
  const samples = pcm.frames * pcm.channels.length;
  return {
    mean: 10 * Math.log10(samples > 0 ? power / samples : 0),
    peak: 20 * Math.log10(peak),
  };
};

export const toMono = (pcm: Pcm): Pcm => {
  const out = new Float32Array(pcm.frames);
  const n = Math.max(1, pcm.channels.length);
  for (const channel of pcm.channels)
    for (let i = 0; i < pcm.frames; i++) out[i] = (out[i] ?? 0) + (channel[i] ?? 0) / n;
  return { rate: pcm.rate, frames: pcm.frames, channels: [out] };
};

export const SPEECH_GATE = -50;

export const windowPowers = (
  pcm: Pcm,
  window: number,
  from = 0,
  to: number = pcm.frames,
): Float64Array => {
  const start = Math.max(0, from);
  const end = Math.min(pcm.frames, to);
  const size = Math.max(1, window);
  const out = new Float64Array(Math.max(0, Math.ceil((end - start) / size)));
  for (let w = 0; w < out.length; w++) {
    const a = start + w * size;
    const b = Math.min(end, a + size);
    let power = 0;
    for (const plane of pcm.channels) for (let i = a; i < b; i++) power += (plane[i] ?? 0) ** 2;
    out[w] = 10 * Math.log10(power / (b - a));
  }
  return out;
};

export const gain = (pcm: Pcm, db: number): Pcm => {
  const k = 10 ** (db / 20);
  return { ...pcm, channels: pcm.channels.map((channel) => channel.map((x) => x * k)) };
};
