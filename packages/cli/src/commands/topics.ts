import {
  ContentStatusJson,
  ContentUpdate,
  ContentUpdateJson,
  type ContentDecision,
  type ContentStatus,
} from '@manna/core/content-update';
import { Console, Effect, Match, Option, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';

import { contentService } from './topics-layer.js';

const encodeStatus = Schema.encodeEffect(Schema.fromJsonString(ContentStatusJson, { space: 2 }));
const encodeUpdate = Schema.encodeEffect(Schema.fromJsonString(ContentUpdateJson, { space: 2 }));

const json = Flag.Boolean('json').pipe(
  Flag.withDescription('Output the raw JSON payload'),
  Flag.withDefault(false),
);

const describeDecision = (decision: ContentDecision): string =>
  Match.value(decision).pipe(
    Match.tagsExhaustive({
      offer: (offer) =>
        `update available: ${String(offer.entry.revision)} (${String(offer.entry.size)} bytes)`,
      'up-to-date': () => 'up to date',
      refused: (refused) =>
        `refused (${refused.reason}): ${String(refused.available.revision)} needs a newer app`,
      offline: (offline) => `offline: ${offline.detail} — the compiled pin stands`,
    }),
  );

const printStatus = (status: ContentStatus) =>
  Effect.gen(function* () {
    yield* Console.log(`corpus     ${status.corpus}`);
    yield* Console.log(
      `installed  ${Option.match(status.installed, {
        onNone: () => '(none)',
        onSome: (revision) => String(revision),
      })}`,
    );
    yield* Console.log(
      `pinned     ${Option.match(status.floor.pinned, {
        onNone: () => '(none)',
        onSome: (revision) => String(revision),
      })}`,
    );
    yield* Console.log(`schema     ${String(status.floor.schemaMajor)}`);
    yield* Console.log(describeDecision(status.decision));
  });

export const topicsStatus = Command.make('status', { json }, (args) =>
  Effect.gen(function* () {
    const status = yield* contentService(
      Effect.flatMap(ContentUpdate, (service) => service.status('topics')),
    );
    if (args.json) {
      yield* Console.log(yield* encodeStatus(status));
      return;
    }
    yield* printStatus(status);
  }),
);

const activatedNothing = (status: ContentStatus): string => {
  if (Option.isNone(status.installed)) {
    return 'activated  (nothing — no content is installed; this update did not complete)';
  }
  return 'activated  (nothing — the installed generation is still active)';
};

export const topicsUpdate = Command.make('update', { json }, (args) =>
  Effect.gen(function* () {
    const outcome = yield* contentService(
      Effect.flatMap(ContentUpdate, (service) => service.update('topics')),
    );
    if (args.json) {
      yield* Console.log(yield* encodeUpdate(outcome));
      return;
    }
    yield* printStatus(outcome.status);
    yield* Console.log(
      Option.match(outcome.activated, {
        onNone: () => activatedNothing(outcome.status),
        onSome: (revision) => `activated  ${String(revision)}`,
      }),
    );
  }),
);

export const topics = Command.make('topics', {}, () =>
  Console.log(`Usage: manna topics status [--json]\n       manna topics update [--json]`),
).pipe(Command.withSubcommands([topicsStatus, topicsUpdate]));
