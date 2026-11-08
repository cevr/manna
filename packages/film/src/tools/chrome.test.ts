import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Arbitrary, Effect, FileSystem, Schema } from 'effect';
import { chromeFlags } from './chrome.ts';
import { GPU_FLAG } from './chrome-gpu.ts';
import { profileFolder } from './chrome-profile.ts';

/** A process id past every system's limit: no process runs as it. */
const STOPPED = 2 ** 30;

describe("a Chrome's profile folder", () => {
  it.effect.layer(BunServices.layer)(
    'is this process, after the folders of processes that stopped are removed',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const root = yield* fs.makeTempDirectoryScoped();
          yield* fs.makeDirectory(`${root}/${STOPPED}/Default`, { recursive: true });
          yield* fs.makeDirectory(`${root}/${process.ppid}`);
          yield* fs.makeDirectory(`${root}/not-a-pid`);
          const folder = yield* profileFolder(root);
          expect(folder).toBe(`${root}/${process.pid}`);
          expect((yield* fs.readDirectory(root)).toSorted()).toEqual(
            [String(process.pid), String(process.ppid), 'not-a-pid'].toSorted(),
          );
        }),
      ),
  );
});

/** The flags Bun 1.4.4 spawned every Chrome with (`ChromeProcess.rs`), but `--disable-gpu`. */
const BUN_FLAGS = [
  '--headless',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-ipc-flooding-protection',
  '--no-startup-window',
];

/** What a caller may ask for: the GPU, ANGLE's backends, a profile and a transport of its own, repeats. */
const POOL = [
  GPU_FLAG,
  '--use-angle=metal',
  '--use-angle=swiftshader',
  '--user-data-dir=/somewhere/else',
  '--user-data-directory=/a/lookalike',
  '--remote-debugging-port=9222',
  '--mute-audio',
  '--disable-gpu-vsync',
  '--autoplay-policy=no-user-gesture-required',
];

/** The flags of puppeteer's own defaults that move a page's pixels. */
const PIXEL_MOVERS = ['--force-color-profile', '--hide-scrollbars', '--headless='];

const asked = Arbitrary.all({
  platform: Arbitrary.schema(Schema.Literals(['darwin', 'linux'])),
  requested: Arbitrary.array(Arbitrary.schema(Schema.Literals(POOL)), { maxLength: 12 }),
  profile: Arbitrary.schema(Schema.String),
});

/** Whether a flag is one the launcher owns: a profile or a debugging transport. */
const owned = (flag: string) =>
  flag.startsWith('--user-data-dir=') || flag.startsWith('--remote-debugging-');

const count = (flags: ReadonlyArray<string>, flag: string) =>
  flags.filter((f) => f === flag).length;

describe("Chrome's command line", () => {
  it.effect(
    "states every flag: Bun's, the silent ones, one profile, the pipe, the GPU only on a Mac that asks, the request last",
    () =>
      Effect.gen(function* () {
        const result = yield* Arbitrary.checkEffect(
          asked,
          ({ platform, requested, profile }) => {
            const line = chromeFlags(platform, requested, profile);
            const gpu = platform === 'darwin' && requested.includes(GPU_FLAG);
            const kept = requested.filter((flag) => !owned(flag));
            return (
              BUN_FLAGS.every((flag) => line.includes(flag)) &&
              ['--mute-audio', '--disable-audio-output', '--disable-component-update'].every(
                (flag) => line.includes(flag),
              ) &&
              line.filter((flag) => flag.startsWith('--user-data-dir=')).length === 1 &&
              line.includes(`--user-data-dir=${profile}`) &&
              line.filter((flag) => flag.startsWith('--remote-debugging-')).join() ===
                '--remote-debugging-pipe' &&
              count(line, '--disable-gpu') === Number(!gpu) &&
              line.slice(line.length - kept.length).join('\n') === kept.join('\n') &&
              !line.some((flag) => PIXEL_MOVERS.some((mover) => flag.startsWith(mover)))
            );
          },
          { runs: 2000, seed: 11 },
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }),
  );
});
