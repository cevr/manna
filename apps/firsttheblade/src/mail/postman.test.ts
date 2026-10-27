import { Story } from '@alchemy.run/domain/Story';
import { describe, expect, it } from 'effect-bun-test';
import { Cause, Effect, Exit, Layer, Logger, Option, Result } from 'effect';

import * as AddressBook from '../list/AddressBook.ts';
import { ConfirmLinkReleased } from '../list/ConfirmLink.command.ts';
import { List, ListHandlers } from '../list/List.model.ts';
import { LetterNotSent, Postman } from '../list/Postman.external.ts';
import * as RosterStore from '../list/RosterStore.ts';
import { ConfirmLinkIssued, SignedUp, SignUp } from '../list/SignUp.command.ts';
import { Subscriber } from '../list/Subscriber.aggregate.ts';
import { SubscriberId } from '../list/Subscriber.id.ts';
import { Address } from './address.ts';
import { Addresses } from './addresses.ts';
import { Mailer, MailUnavailable } from './mailer.ts';
import { layerPostman } from './postman.ts';
import { Tokens } from './tokens.ts';

const subscriber = Subscriber.ref(SubscriberId.make('signing-property'));
const issued = 1_767_225_600_000;
const origin = 'https://firsttheblade.test';
const args = { subscriber: subscriber.id, issued, origin };

type Json =
  // oxlint-disable-next-line effect/noNullish -- JSON null is an intentional signing-defect payload, not optional domain state.
  null | boolean | number | string | ReadonlyArray<Json> | { readonly [key: string]: Json };

/** A bounded deterministic JSON generator: primitives, strings, arrays and nested records. */
const defectValue = (seed: number, depth = 0): Json => {
  const next = (seed * 1664525 + 1013904223) >>> 0;
  const choice = next % 6;
  // oxlint-disable-next-line effect/noNullish -- Generate the JSON null primitive as a signing-defect payload.
  if (choice === 0) return null;
  if (choice === 1) return next % 4 === 1;
  if (choice === 2) return (next - 2147483648) / 17;
  if (choice === 3 || depth === 3) return `private@example.test\nreason=secret-${next}`;
  if (choice === 4) return [defectValue(next, depth + 1), defectValue(next + 1, depth + 1)];
  return { payload: defectValue(next, depth + 1), nested: defectValue(next + 2, depth + 1) };
};

/** External ports only: the adapter and the model's recovery policy remain real. */
const fixture = (sign: Tokens['Service']['sign'], send: Mailer['Service']['send']) =>
  Effect.gen(function* () {
    const book = yield* AddressBook.memory;
    const roster = yield* RosterStore.memory;
    const lines: Array<string> = [];
    const ports = Layer.mergeAll(
      Layer.succeed(AddressBook.AddressBook, book.book),
      Layer.succeed(RosterStore.RosterStore, roster.store),
      Layer.succeed(
        Addresses,
        Addresses.of({
          keep: () => Effect.void,
          find: () => Effect.succeedSome(Address.make('private@example.test')),
          forget: () => Effect.void,
        }),
      ),
      Layer.succeed(
        Tokens,
        Tokens.of({
          sign,
          idOf: () => Effect.die('unexpected idOf'),
          read: () => Effect.die('unexpected read'),
        }),
      ),
      Layer.succeed(Mailer, Mailer.of({ send })),
    );
    const postman = layerPostman.pipe(Layer.provide(ports));
    const logger = Logger.layer([
      Logger.make(({ message }) => {
        lines.push([message].flat().map(String).join(' '));
      }),
    ]);
    const story = Story.make(List, {
      layer: ListHandlers.pipe(Layer.provide(postman), Layer.provide(ports)),
    });
    return { postman, logger, story, lines };
  });

describe('the Postman signing boundary', () => {
  it.effect(
    'every generated signing defect is sanitized, becomes LetterNotSent and releases its link',
    () =>
      Effect.gen(function* () {
        const defects = [
          // oxlint-disable-next-line effect/noNullish -- Exercise an explicit null signing defect.
          null,
          false,
          true,
          0,
          '',
          ...Array.from({ length: 64 }, (_, seed) => defectValue(seed)),
        ];
        const failures: ReadonlyArray<Tokens['Service']['sign']> = [
          ...defects.map((defect) => () => Effect.die(defect)),
          () => Effect.die(new Error('private@example.test secret error')),
          () => Effect.sync(() => Option.getOrThrow(Option.none())),
          () => Option.getOrThrow(Option.none()),
        ];
        for (const fail of failures) {
          let reached = 0;
          let sent = 0;
          const { postman, logger, story, lines } = yield* fixture(
            (token) => {
              reached += 1;
              return fail(token);
            },
            () =>
              Effect.sync(() => {
                sent += 1;
              }),
          );
          yield* Effect.gen(function* () {
            const adapter = yield* Postman;
            expect(yield* Effect.result(adapter.confirmLetter(args))).toEqual(
              Result.fail(LetterNotSent.make({ reason: 'defect' })),
            );
            yield* story(
              Story.clock('2026-01-01T00:00:00.000Z'),
              Story.when(subscriber, SignUp.make({ origin })),
              Story.then(
                subscriber,
                SignedUp.make({ at: issued }),
                ConfirmLinkIssued.make({ issued, origin }),
                ConfirmLinkReleased.make({ issued }),
              ),
            );
            expect(reached).toBe(2);
            expect(sent).toBe(0);
            expect(lines).toEqual(
              Array(2).fill(`[mail] subscribe.unsent subscriber=${subscriber.id} reason=defect`),
            );
            // oxlint-disable-next-line effect/noInlineProvide -- Each generated case has its own adapter/model and runtime log capture at this test boundary.
          }).pipe(Effect.provide(Layer.merge(postman, logger)));
        }
      }),
  );

  it.effect('success keeps the issued link and a typed mailer failure releases it', () =>
    Effect.gen(function* () {
      for (const unavailable of [false, true]) {
        let sent = 0;
        const { story, logger, lines } = yield* fixture(
          () => Effect.succeed('test-confirm-token'),
          () =>
            Effect.suspend(() => {
              sent += 1;
              if (unavailable)
                return Effect.fail(MailUnavailable.make({ code: 'E_TEST_UNAVAILABLE' }));
              return Effect.void;
            }),
        );
        const events = [SignedUp.make({ at: issued }), ConfirmLinkIssued.make({ issued, origin })];
        if (unavailable) {
          yield* story(
            Story.clock('2026-01-01T00:00:00.000Z'),
            Story.when(subscriber, SignUp.make({ origin })),
            Story.then(subscriber, ...events, ConfirmLinkReleased.make({ issued })),
            // oxlint-disable-next-line effect/noInlineProvide -- Capture this control story's runtime logs at its test boundary.
          ).pipe(Effect.provide(logger));
          expect(lines).toEqual([
            `[mail] subscribe.unsent subscriber=${subscriber.id} reason=E_TEST_UNAVAILABLE`,
          ]);
        } else {
          yield* story(
            Story.clock('2026-01-01T00:00:00.000Z'),
            Story.when(subscriber, SignUp.make({ origin })),
            Story.then(subscriber, ...events),
            // oxlint-disable-next-line effect/noInlineProvide -- Capture this control story's runtime logs at its test boundary.
          ).pipe(Effect.provide(logger));
          expect(lines).toEqual([`[mail] subscribe.mailed subscriber=${subscriber.id}`]);
        }
        expect(sent).toBe(1);
      }
    }),
  );

  it.effect('interruption and defects during delivery do not become an unsent letter', () =>
    Effect.gen(function* () {
      const deliveries = [Effect.interrupt, Effect.die('delivery outcome unknown')];
      for (const delivery of deliveries) {
        const { postman, logger, lines } = yield* fixture(
          () => Effect.succeed('test-confirm-token'),
          () => delivery,
        );
        const result = yield* Effect.gen(function* () {
          return yield* Effect.exit((yield* Postman).confirmLetter(args));
          // oxlint-disable-next-line effect/noInlineProvide -- Each delivery-outcome case has its own external-port fixture and runtime logger.
        }).pipe(Effect.provide(Layer.merge(postman, logger)));
        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          expect(Cause.hasInterrupts(result.cause) || Cause.hasDies(result.cause)).toBe(true);
          expect(Cause.findErrorOption(result.cause)).toEqual(Option.none());
        }
        expect(lines).toEqual([]);
      }
    }),
  );
});
