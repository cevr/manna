import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, Exit, Layer, Option, Redacted } from 'effect';

import { SubscriberId } from '../list/Subscriber.id.ts';
import { Address } from './address.ts';
import { layer, type Token, Tokens, type TokensService } from './tokens.ts';

const KEY = Redacted.make('11'.repeat(32));
const OTHER_KEY = Redacted.make('22'.repeat(32));

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

  test('are refused a key shorter than 32 bytes', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        Effect.scoped(Layer.build(layer(Redacted.make('ab'.repeat(16))))),
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }));
});
