import { Config, Context, Effect, Layer, Schema } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';

export const AskAnswer = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('choose'), value: Schema.String, label: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('free_text'), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('skipped') }),
]);
export type AskAnswer = typeof AskAnswer.Type;

export const AskAnswers = Schema.Record(Schema.String, AskAnswer);
export type AskAnswers = typeof AskAnswers.Type;

export const AskBlock = Schema.Struct({
  kind: Schema.String,
  image: Schema.optionalKey(Schema.Struct({ src: Schema.optionalKey(Schema.String) })),
});
export type AskBlock = typeof AskBlock.Type;

export const LabAsk = Schema.Struct({
  id: Schema.String,
  ask: Schema.Struct({
    steps: Schema.Record(
      Schema.String,
      Schema.Struct({ blocks: Schema.optionalKey(Schema.Array(AskBlock)) }),
    ),
  }),
  shown: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  state: Schema.Struct({
    _tag: Schema.Literals(['Asking', 'Answered', 'Closed']),
    answers: AskAnswers,
  }),
  answered: Schema.Array(
    Schema.Struct({
      step: Schema.String,
      values: Schema.Record(Schema.String, Schema.String),
      at: Schema.String,
    }),
  ),
});
export type LabAsk = typeof LabAsk.Type;

export class AskUnknown extends Schema.TaggedError<AskUnknown>()('AskUnknown', {
  ask: Schema.String,
}) {
  override get message() {
    return `the lab has no ask ${this.ask}`;
  }
}

export class LabUnread extends Schema.TaggedError<LabUnread>()('LabUnread', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the lab at ${this.url} gave no ask this checkout reads (${this.reason}): start it (from apps/animations: bun run lab) or point FILM_LAB_URL at the one that holds the ask`;
  }
}

export interface AskRead {
  readonly record: LabAsk;
  readonly body: unknown;
}

export interface LabAsksService {
  readonly url: string;
  readonly read: (ask: string) => Effect.Effect<AskRead, AskUnknown | LabUnread>;
}

export class LabAsks extends Context.Service<LabAsks, LabAsksService>()('firsttheblade/LabAsks') {}

const labUrl = Config.String('FILM_LAB_URL').pipe(Config.withDefault('http://127.0.0.1:8229/'));

const readAsk = Schema.decodeUnknownEffect(LabAsk);

export const layerLab = Layer.effect(
  LabAsks,
  Effect.gen(function* () {
    const url = yield* labUrl;
    const client = yield* HttpClient.HttpClient;
    const read = Effect.fn('LabAsks.read')(function* (ask: string) {
      const unread = (reason: string) => LabUnread.make({ url, reason });
      const response = yield* client
        .get(new URL(`api/asks/${encodeURIComponent(ask)}`, url))
        .pipe(Effect.mapError((error) => unread(error.message)));
      if (response.status === 404) return yield* AskUnknown.make({ ask });
      if (response.status !== 200) return yield* unread(`status ${response.status}`);
      const body = yield* response.json.pipe(Effect.mapError((error) => unread(error.message)));
      const record = yield* readAsk(body).pipe(Effect.mapError((error) => unread(error.message)));
      return { record, body };
    });
    return LabAsks.of({ url, read });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
