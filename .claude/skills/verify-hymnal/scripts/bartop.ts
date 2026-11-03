/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction -- a frame reader at Bun's boundary, as the probes are: it spawns ffmpeg, reads its raw frames in a loop and prints one line per frame on stdout. */

/**
 * The bar's height in every frame of a screen recording of `verify-hymnal`
 * (an iPhone 17 Pro, 3x, 1206 by 2622 pixels): it finds the bar's top
 * hairline, the topmost full-width row of one grey that is not the ground,
 * in the band from 720 pt down, and prints `frame time top height` per frame
 * (`-` where no hairline shows), the height from the hairline to the home
 * indicator's inset. It reads no words: only the row of the hairline.
 *
 *   bun .claude/skills/verify-hymnal/scripts/bartop.ts <video.mp4> [fromSec] [toSec]
 *
 * `THRESH` (default 0.92) is the share of a row's pixels that must share
 * the row's grey.
 */

const [path = '', fromArg = '0', toArg = '1000000'] = Bun.argv.slice(2);
const from = Number(fromArg);
const to = Number(toArg);
const threshold = Number(Bun.env['THRESH'] ?? '0.92');
const W = 1206;
const Y0 = 2160;
const H = 2622 - Y0;
const frameBytes = W * H;
const FPS = 30;
const INSET = 34.3;
const BOTTOM = 874;

/** The topmost hairline row of a frame's band, if one shows. */
const hairline = (frame: Uint8Array): number | undefined => {
  const all = new Uint32Array(256);
  for (let k = 0; k < frame.length; k += 7) all[frame[k] ?? 0] = (all[frame[k] ?? 0] ?? 0) + 1;
  const ground = mode(all);
  for (let y = 0; y < H; y++) {
    const row = frame.subarray(y * W, (y + 1) * W);
    const counts = new Uint32Array(256);
    for (let x = 0; x < W; x += 2) counts[row[x] ?? 0] = (counts[row[x] ?? 0] ?? 0) + 1;
    const grey = mode(counts);
    let near = 0;
    for (let v = Math.max(0, grey - 8); v <= Math.min(255, grey + 8); v++) near += counts[v] ?? 0;
    if (near >= threshold * (W / 2) && Math.abs(grey - ground) >= 40) return y;
  }
  return undefined;
};

/** The most common value of a histogram. */
const mode = (counts: Uint32Array): number => {
  let best = 0;
  for (let v = 0; v < counts.length; v++) if ((counts[v] ?? 0) > (counts[best] ?? 0)) best = v;
  return best;
};

const ffmpeg = Bun.spawn(
  [
    'ffmpeg',
    '-v',
    'error',
    '-ss',
    String(from),
    '-to',
    String(to),
    '-i',
    path,
    '-vf',
    `crop=${W}:${H}:0:${Y0},format=gray`,
    '-f',
    'rawvideo',
    '-',
  ],
  { stdout: 'pipe', stderr: 'inherit' },
);

let pending = new Uint8Array(0);
let n = 0;
for await (const chunk of ffmpeg.stdout) {
  const joined = new Uint8Array(pending.length + chunk.length);
  joined.set(pending);
  joined.set(chunk, pending.length);
  pending = joined;
  while (pending.length >= frameBytes) {
    const top = hairline(pending.subarray(0, frameBytes));
    const t = (from + n / FPS).toFixed(3);
    if (top === undefined) console.log(`${n}\t${t}\t-\t-`);
    else {
      const pt = (Y0 + top) / 3;
      console.log(`${n}\t${t}\t${pt.toFixed(2)}\t${Math.round((BOTTOM - INSET - pt) * 10) / 10}`);
    }
    n += 1;
    pending = pending.slice(frameBytes);
  }
}
await ffmpeg.exited;
