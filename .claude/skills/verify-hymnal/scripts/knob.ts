/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction -- a frame reader at Bun's boundary, as the probes are: it spawns ffmpeg, reads its raw frames in a loop and prints one line per frame on stdout. */

/**
 * The seeker knob's centre in every frame of a screen recording of
 * `verify-hymnal` (an iPhone 17 Pro, 3x, 1206 by 2622 pixels) while the bar
 * stands tall: the knob is a 14 pt accent disc on the seek row (808 to 840
 * pt down). Per frame it prints `time x width` in points, or `time -` where
 * no knob shows. It reads no words: only the dark columns of the seek row.
 *
 *   bun .claude/skills/verify-hymnal/scripts/knob.ts <video.mp4> [fromSec] [toSec]
 */

const [path = '', fromArg = '0', toArg = '1000000'] = Bun.argv.slice(2);
const from = Number(fromArg);
const to = Number(toArg);
const FPS = 30;
const W = 1206;
const Y0 = 808 * 3;
const H = 32 * 3;
const frameBytes = W * H;
/** A column of the knob holds this many dark pixels or more; the played line holds about 9. */
const KNOB_COLUMN = 30;

/** The knob in one frame: its centre and width in points, if it shows. */
const knobOf = (frame: Uint8Array): { readonly x: number; readonly width: number } | undefined => {
  const dark = Array.from({ length: W }, (_, x) => {
    let c = 0;
    for (let y = 0; y < H; y++) if ((frame[y * W + x] ?? 255) < 110) c += 1;
    return c;
  });
  let best = -1;
  let bestLength = 0;
  let start = -1;
  for (let x = 190; x < 1040; x++) {
    if ((dark[x] ?? 0) >= KNOB_COLUMN) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      if (x - start > bestLength) {
        bestLength = x - start;
        best = start;
      }
      start = -1;
    }
  }
  if (best < 0 || bestLength < 20) return undefined;
  let weight = 0;
  let sum = 0;
  for (let x = best; x < best + bestLength; x++) {
    weight += dark[x] ?? 0;
    sum += (dark[x] ?? 0) * x;
  }
  return { x: sum / weight / 3, width: bestLength / 3 };
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
    const knob = knobOf(pending.subarray(0, frameBytes));
    const t = (from + n / FPS).toFixed(3);
    if (knob === undefined) console.log(`${t}\t-`);
    else console.log(`${t}\t${knob.x.toFixed(2)}\t${knob.width.toFixed(1)}`);
    n += 1;
    pending = pending.slice(frameBytes);
  }
}
await ffmpeg.exited;
