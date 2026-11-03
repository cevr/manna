import { Effect, type FileSystem, Stream } from 'effect';
import { Mac } from 'effect/crypto';
import type { PlatformError } from 'effect/PlatformError';

export const sha256Hex = (bytes: Uint8Array | string): string =>
  new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

export const hmacSha256 = (key: Uint8Array, text: string): Uint8Array =>
  new Uint8Array(new Bun.CryptoHasher('sha256', key).update(text).digest());

export const sameText = (a: string, b: string): boolean =>
  Mac.timingSafeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));

interface Hashing {
  readonly update: (chunk: Uint8Array) => void;
  readonly hex: () => string;
}

export const hashing = (): Hashing => {
  const hash = new Bun.CryptoHasher('sha256');
  return { update: (chunk) => void hash.update(chunk), hex: () => hash.digest('hex') };
};

export const hashed = <E, R>(
  stream: Stream.Stream<Uint8Array, E, R>,
  into: Hashing,
): Stream.Stream<Uint8Array, E, R> =>
  Stream.tap(stream, (chunk) => Effect.sync(() => into.update(chunk)));

export const sha256OfFile = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<string, PlatformError> =>
  Effect.suspend(() => {
    const into = hashing();
    return Stream.runDrain(hashed(fs.stream(file), into)).pipe(Effect.map(() => into.hex()));
  });

export const cacheKey = (parts: ReadonlyArray<string | number>): string =>
  new Bun.CryptoHasher('sha1').update(parts.join('|')).digest('hex').slice(0, 20);
