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
  '--password-store=keychain',
  '--password-store=gnome-libsecret',
  '--use-mock-keychain',
];

/** The flags of puppeteer's own defaults that move a page's pixels. */
const PIXEL_MOVERS = ['--force-color-profile', '--hide-scrollbars', '--headless='];

const asked = Arbitrary.all({
  platform: Arbitrary.schema(Schema.Literals(['darwin', 'linux'])),
  requested: Arbitrary.array(Arbitrary.schema(Schema.Literals(POOL)), { maxLength: 12 }),
  profile: Arbitrary.schema(Schema.String),
});

/** Whether a flag is one the launcher owns: a profile, a debugging transport or a keychain flag. */
const owned = (flag: string) =>
  ['--user-data-dir=', '--remote-debugging-', '--use-mock-keychain', '--password-store'].some(
    (prefix) => flag.startsWith(prefix),
  );

/**
 * A caller's keychain switches in spellings Chromium's POSIX parser reads as
 * `use-mock-keychain` or `password-store`: one or two dashes, ASCII
 * whitespace at either end, with or without a value.
 */
const KEYCHAIN_SPELLINGS = [
  '--password-store=keychain',
  '-password-store=gnome-libsecret',
  ' --password-store=keychain',
  '\t-password-store=kwallet\n',
  '--password-store',
  '\v--password-store=keychain\f',
  '-use-mock-keychain',
  '--use-mock-keychain=0',
  ' \r--use-mock-keychain ',
];

/**
 * Lookalikes Chromium reads as another switch or as no switch: three dashes,
 * another key, another case (POSIX keys keep theirs), no dash, and a
 * non-ASCII space Chromium does not trim. The launcher passes them on.
 */
const LOOKALIKES = [
  '---password-store=keychain',
  '--password-storex=keychain',
  '--password_store=keychain',
  '--use-mock-keychains',
  '--Password-Store=keychain',
  'password-store=keychain',
  '--disable-password-store',
  '\u00a0--password-store=keychain',
];

const keychainAsked = Arbitrary.all({
  platform: Arbitrary.schema(Schema.Literals(['darwin', 'linux'])),
  requested: Arbitrary.array(
    Arbitrary.schema(Schema.Literals([...KEYCHAIN_SPELLINGS, ...LOOKALIKES, '--mute-audio'])),
    { maxLength: 12 },
  ),
  profile: Arbitrary.schema(Schema.String),
});

const count = (flags: ReadonlyArray<string>, flag: string) =>
  flags.filter((f) => f === flag).length;

describe("Chrome's command line", () => {
  it.effect(
    "states every flag: Bun's, the silent ones, the keychain ones, one profile, the pipe, the GPU only on a Mac that asks, the request last",
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
              [
                '--mute-audio',
                '--disable-audio-output',
                '--disable-component-update',
                '--use-mock-keychain',
                '--password-store=basic',
              ].every((flag) => line.includes(flag)) &&
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

  it.effect(
    "keeps Chrome out of the host's keychain on macOS and Linux, whatever keychain flag the caller passes",
    () =>
      Effect.gen(function* () {
        const result = yield* Arbitrary.checkEffect(
          keychainAsked,
          ({ platform, requested, profile }) => {
            const line = chromeFlags(platform, requested, profile);
            const kept = requested.filter((flag) => !KEYCHAIN_SPELLINGS.includes(flag));
            const launcher = line.slice(0, line.length - kept.length);
            return (
              line.slice(line.length - kept.length).join('\n') === kept.join('\n') &&
              count(launcher, '--use-mock-keychain') === 1 &&
              count(launcher, '--password-store=basic') === 1
            );
          },
          { runs: 1000, seed: 12 },
        );
        expect(Arbitrary.formatCheckFailure(result)).toBeUndefined();
      }),
  );
});
