import { describe, expect, it } from 'effect-bun-test';
import { Cause, Context, Effect, Exit, Layer, Option, Redacted, Ref } from 'effect';

import { SubscriberId } from '../list/Subscriber.id.ts';
import { Address } from './address.ts';
import { layer, type Token, Tokens, type TokensService } from './tokens.ts';

const KEY = Effect.succeed(Redacted.make('11'.repeat(32)));
const OTHER_KEY = Effect.succeed(Redacted.make('22'.repeat(32)));

const SUBSCRIBER = SubscriberId.make('AAAAAAAAAAAAAAAAAAAAAA');
const CONFIRM: Token = { _tag: 'Confirm', subscriber: SUBSCRIBER, issued: 1_760_000_000_000 };
const LEAVE: Token = { _tag: 'Unsubscribe', subscriber: SUBSCRIBER };

/** Tokens signed under another key. */
class OtherTokens extends Context.Service<OtherTokens, TokensService>()('test/OtherTokens') {}

const layerOther = Layer.effect(
  OtherTokens,
  Effect.gen(function* () {
    return yield* Tokens;
  }),
).pipe(Layer.provide(layer(OTHER_KEY)));

const test = it.effect.layer(Layer.merge(layer(KEY), layerOther));

/** `text` with the character at `index` changed (its lowest bit flipped). */
const changedAt = (text: string, index: number) =>
  `${text.slice(0, index)}${String.fromCharCode(text.charCodeAt(index) ^ 1)}${text.slice(index + 1)}`;

const random = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

/** HMAC-SHA-256 of `text` under the raw key, by WebCrypto alone: the formats' oracle. */
const hmac = Effect.fn('Test.hmac')(function* (key: Uint8Array<ArrayBuffer>, text: string) {
  const imported = yield* Effect.promise(() =>
    crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  );
  const mac = yield* Effect.promise(() =>
    crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(text)),
  );
  return new Uint8Array(mac);
});

/** A key source that counts its reads. */
const counted = (text: string) =>
  Effect.map(Ref.make(0), (reads) => ({
    reads,
    source: Ref.update(reads, (n) => n + 1).pipe(Effect.as(Redacted.make(text))),
  }));

/** A key of 32 to 48 bytes, as lower or upper hex, sometimes inside spaces or a newline. */
const keyOf = (next: () => number) => {
  const size = 32 + Math.floor(next() * 17);
  const bytes = new Uint8Array(Array.from({ length: size }, () => Math.floor(next() * 256)));
  let text = hex(bytes);
  if (next() < 0.3) text = text.toUpperCase();
  if (next() < 0.3) text = ` ${text}\n`;
  return { bytes, text };
};

/** What the formats make under the key: an id, a confirm and a leave link's token, the fingerprint. */
const expectedFor = Effect.fn('Test.expectedFor')(function* (
  key: Uint8Array<ArrayBuffer>,
  address: Address,
  issued: number,
) {
  const subscriber = SubscriberId.make(
    base64url((yield* hmac(key, `firsttheblade-subscriber-v1:${address}`)).slice(0, 16)),
  );
  const signed = (payload: string) =>
    Effect.map(
      hmac(key, `firsttheblade-mail-v2:${payload}`),
      (mac) => `${payload}.${base64url(mac)}`,
    );
  return {
    subscriber,
    confirm: yield* signed(`c.${subscriber}.${issued}`),
    leave: yield* signed(`u.${subscriber}`),
    fingerprint: hex((yield* hmac(key, 'firsttheblade-key-check-v1')).slice(0, 8)),
  };
});

describe('the list tokens', () => {
  test('read back what they were signed with', () =>
    Effect.gen(function* () {
      const tokens = yield* Tokens;
      for (const token of [CONFIRM, LEAVE]) {
        expect(yield* tokens.read(yield* tokens.sign(token))).toEqual(Option.some(token));
      }
    }));

  test('read as nothing once any character is changed', () =>
    Effect.gen(function* () {
      const tokens = yield* Tokens;
      const text = yield* tokens.sign(CONFIRM);
      for (let index = 0; index < text.length; index += 1) {
        const read = yield* tokens.read(changedAt(text, index));
        expect(read).toEqual(Option.none());
      }
    }));

  test('read as nothing under another key, or when they are not tokens at all', () =>
    Effect.gen(function* () {
      const tokens = yield* Tokens;
      const other = yield* (yield* OtherTokens).sign(LEAVE);
      expect(yield* tokens.read(other)).toEqual(Option.none());
      const id = SUBSCRIBER;
      const texts = ['', '.', `u.${id}`, `u.${id}.`, 'u.7.abc', `x.${id}.abc`, `c.${id}.abc`];
      for (const text of [...texts, `u.${id}.1.abc`, `u.${id}A.abc`]) {
        expect(yield* tokens.read(text)).toEqual(Option.none());
      }
    }));

  test("name a subscriber by its address's hash: the same address, the same id", () =>
    Effect.gen(function* () {
      const tokens = yield* Tokens;
      const ann = yield* tokens.idOf(Address.make('ann@example.com'));
      expect(ann).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(ann).not.toContain('ann');
      expect(yield* tokens.idOf(Address.make('ann@example.com'))).toBe(ann);
      expect(yield* tokens.idOf(Address.make('ben@example.com'))).not.toBe(ann);
      expect(yield* (yield* OtherTokens).idOf(Address.make('ann@example.com'))).not.toBe(ann);
      const leave = yield* tokens.sign({ _tag: 'Unsubscribe', subscriber: ann });
      expect(yield* tokens.read(leave)).toEqual(
        Option.some({ _tag: 'Unsubscribe', subscriber: ann }),
      );
    }));

  it.effect(
    'make the bytes the formats make, over 20 keys, reading each key once and none at build',
    () =>
      Effect.gen(function* () {
        for (let seed = 1; seed <= 20; seed += 1) {
          const next = random(seed);
          const key = keyOf(next);
          const address = Address.make(`p${seed}.${Math.floor(next() * 1e6)}@example.test`);
          const issued = Math.floor(next() * 2e12);
          const want = yield* expectedFor(key.bytes, address, issued);
          const confirm: Token = { _tag: 'Confirm', subscriber: want.subscriber, issued };
          const leave: Token = { _tag: 'Unsubscribe', subscriber: want.subscriber };
          const { reads, source } = yield* counted(key.text);
          const got = yield* Effect.scoped(
            Effect.gen(function* () {
              const tokens = Context.get(yield* Layer.build(layer(source)), Tokens);
              const atBuild = yield* Ref.get(reads);
              const subscriber = yield* tokens.idOf(address);
              const confirmText = yield* tokens.sign(confirm);
              const leaveText = yield* tokens.sign(leave);
              const fingerprint = yield* tokens.fingerprint;
              const readBack = [yield* tokens.read(confirmText), yield* tokens.read(leaveText)];
              yield* tokens.idOf(address);
              return {
                seed,
                atBuild,
                subscriber,
                confirm: confirmText,
                leave: leaveText,
                fingerprint,
                readBack,
              };
            }),
          );
          expect({ ...got, reads: yield* Ref.get(reads) }).toEqual({
            seed,
            atBuild: 0,
            ...want,
            readBack: [Option.some(confirm), Option.some(leave)],
            reads: 1,
          });
        }
      }),
  );

  it.effect(
    'build over a short key, read nothing, and die at first use naming MAIL_TOKEN_KEY',
    () =>
      Effect.gen(function* () {
        const { reads, source } = yield* counted('ab'.repeat(31));
        const exit = yield* Effect.scoped(
          Effect.gen(function* () {
            const tokens = Context.get(yield* Layer.build(layer(source)), Tokens);
            expect(yield* Ref.get(reads)).toBe(0);
            return yield* Effect.exit(tokens.idOf(Address.make('a@example.test')));
          }),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain('MAIL_TOKEN_KEY');
      }),
  );
});
