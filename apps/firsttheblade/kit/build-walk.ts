import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { IMAGE } from './served.ts';

export const Format = Schema.Literals([
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif/heif',
  'jpeg xl',
  'bmp',
  'ico/cur',
  'tiff',
  'jpeg 2000',
  'svg',
  'unknown',
]);
export type Format = typeof Format.Type;

const holds = (bytes: Uint8Array, at: number, expected: ReadonlyArray<number>) =>
  bytes.length >= at + expected.length && expected.every((byte, i) => bytes[at + i] === byte);

const says = (bytes: Uint8Array, at: number, text: string) =>
  holds(
    bytes,
    at,
    Array.from(text, (character) => character.charCodeAt(0)),
  );

const u16 = (bytes: Uint8Array, at: number) => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
const u32 = (bytes: Uint8Array, at: number) => u16(bytes, at) + u16(bytes, at + 2) * 0x10000;

const DIB = new Set([12, 16, 40, 52, 56, 64, 108, 124]);

const PROLOG = /^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE(?:[^[>]|\[[\s\S]*?\])*>)*/i;

const SVG_ROOT = /^<(?:[\w.-]+:)?svg[\s/>]/i;

const UTF16LE = new TextDecoder('utf-16le');
const UTF16BE = new TextDecoder('utf-16be');
const BYTES = new TextDecoder('latin1');

const readings = (bytes: Uint8Array) => [
  UTF16LE.decode(bytes),
  UTF16BE.decode(bytes),
  BYTES.decode(bytes.subarray(Number(holds(bytes, 0, [0xef, 0xbb, 0xbf])) * 3)),
];

const isSvg = (bytes: Uint8Array) =>
  readings(bytes).some((text) => SVG_ROOT.test(text.replace(/^\ufeff/, '').replace(PROLOG, '')));

const SIGNATURES: ReadonlyArray<readonly [Format, (bytes: Uint8Array) => boolean]> = [
  ['jpeg', (bytes) => holds(bytes, 0, [0xff, 0xd8, 0xff])],
  ['png', (bytes) => holds(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ['gif', (bytes) => says(bytes, 0, 'GIF87a') || says(bytes, 0, 'GIF89a')],
  ['webp', (bytes) => says(bytes, 0, 'RIFF') && says(bytes, 8, 'WEBP')],
  ['avif/heif', (bytes) => says(bytes, 4, 'ftyp')],
  [
    'jpeg xl',
    (bytes) =>
      holds(bytes, 0, [0xff, 0x0a]) ||
      holds(bytes, 0, [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]),
  ],
  ['bmp', (bytes) => says(bytes, 0, 'BM') && bytes.length >= 18 && DIB.has(u32(bytes, 14))],
  [
    'ico/cur',
    (bytes) =>
      (holds(bytes, 0, [0, 0, 1, 0]) || holds(bytes, 0, [0, 0, 2, 0])) &&
      bytes.length >= 6 &&
      u16(bytes, 4) > 0,
  ],
  [
    'tiff',
    (bytes) => holds(bytes, 0, [0x49, 0x49, 0x2a, 0]) || holds(bytes, 0, [0x4d, 0x4d, 0, 0x2a]),
  ],
  [
    'jpeg 2000',
    (bytes) =>
      holds(bytes, 0, [0, 0, 0, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a]) ||
      holds(bytes, 0, [0xff, 0x4f, 0xff, 0x51]),
  ],
  ['svg', isSvg],
];

const gunzipped = Option.liftThrowable((bytes: Uint8Array) =>
  Bun.gunzipSync(new Uint8Array(bytes)),
);

export const formatOf = (bytes: Uint8Array): Option.Option<Format> => {
  const found = Option.fromUndefinedOr(SIGNATURES.find(([, is]) => is(bytes))).pipe(
    Option.map(([format]) => format),
  );
  if (Option.isSome(found) || !holds(bytes, 0, [0x1f, 0x8b])) return found;
  return gunzipped(bytes).pipe(
    Option.filter((inner) => !holds(inner, 0, [0x1f, 0x8b])),
    Option.flatMap(formatOf),
  );
};

export const sha256 = (bytes: Uint8Array) =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

export interface BuiltImage {
  readonly file: string;
  readonly format: Format;
  readonly hash: string;
}

export const builtImages = Effect.fn('BuildWalk.images')(function* (dist: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = (yield* fs.readDirectory(dist, { recursive: true })).toSorted();
  const found = yield* Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const full = path.join(dist, entry);
        if ((yield* fs.stat(full)).type !== 'File') return Option.none<BuiltImage>();
        const bytes = yield* fs.readFile(full);
        const file = entry.split(path.sep).join('/');
        const format = formatOf(bytes).pipe(
          Option.orElse(() =>
            Option.some<Format>('unknown').pipe(Option.filter(() => IMAGE.test(file))),
          ),
        );
        return Option.map(format, (format) => ({ file, format, hash: sha256(bytes) }));
      }),
    { concurrency: 16 },
  );
  return found.filter(Option.isSome).map(({ value }) => value);
});

export class BuildFailed extends Schema.TaggedError<BuildFailed>()('BuildFailed', {
  app: Schema.String,
  code: Schema.Finite,
  output: Schema.String,
}) {
  override get message() {
    return `bun run build in ${this.app} exited ${this.code}:\n${this.output}`;
  }
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

export const buildSite = Effect.fn('BuildWalk.build')(function* (app: string) {
  const spawner = yield* ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make('bun', ['run', 'build'], { cwd: app, forceKillAfter: '5 seconds' }),
  );
  const [stdout, stderr, code] = yield* Effect.all(
    [text(child.stdout), text(child.stderr), child.exitCode],
    { concurrency: 3 },
  );
  if (Number(code) === 0) return;
  const output = `${stdout}${stderr}`.split('\n').slice(-30).join('\n');
  return yield* BuildFailed.make({ app, code: Number(code), output });
}, Effect.scoped);
