import { Context, Effect, Layer, Match } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import {
  type DraftRead,
  type MarksPost,
  Refusal,
  type ScriptBeats,
  type ScriptVoice,
  type SeriesList,
  reviewFileUrl,
  reviewPhoneUrl,
} from '../../core/api.ts';
import type { BoardFile } from '../../core/board.ts';
import type { AskName, AskRecord, AsksPage, StepValues } from '../../core/ask.ts';
import type { LabWrite } from '../../core/schema.ts';
import type { StudioAttempts } from '../../core/studio.ts';
import type { ReviewDuration, ReviewIndex } from '../../core/review.ts';
import type { PhoneCopy } from '../../core/served.ts';
import { LabClient, type LabFailure, called } from '../api.ts';

interface AskCalls {
  readonly index: (fresh: boolean) => Effect.Effect<ReviewIndex, LabFailure>;
  readonly duration: (ref: string) => Effect.Effect<ReviewDuration, LabFailure>;
  readonly text: (ref: string) => Effect.Effect<string, LabFailure>;
  readonly phoneCopy: (ref: string) => Effect.Effect<PhoneCopy, LabFailure>;
  readonly board: (film: string) => Effect.Effect<BoardFile, LabFailure>;
  readonly ask: (id: string) => Effect.Effect<AskRecord, LabFailure>;
  readonly askPage: (id: string) => Effect.Effect<AsksPage, LabFailure>;
  readonly answer: (
    id: string,
    sections: ReadonlyArray<{ readonly step: AskName; readonly values: StepValues }>,
  ) => Effect.Effect<AskRecord, LabFailure>;
  readonly script: (film: string) => Effect.Effect<ScriptBeats, LabFailure>;
  readonly filmVoice: (film: string) => Effect.Effect<ScriptVoice, LabFailure>;
  readonly filmMarks: (film: string, post: MarksPost) => Effect.Effect<LabWrite, LabFailure>;
  readonly attempts: (film: string, beat: string) => Effect.Effect<StudioAttempts, LabFailure>;
  readonly series: Effect.Effect<SeriesList, LabFailure>;
  readonly draft: (series: string, draft: string) => Effect.Effect<DraftRead, LabFailure>;
  readonly draftVoice: (series: string, draft: string) => Effect.Effect<ScriptVoice, LabFailure>;
  readonly draftMarks: (
    series: string,
    draft: string,
    post: MarksPost,
  ) => Effect.Effect<DraftRead, LabFailure>;
}

export class AskApi extends Context.Service<AskApi, AskCalls>()('@manna/film/lab/AskApi') {}

const fileText = (res: HttpClientResponse.HttpClientResponse) => {
  if (res.status >= 200 && res.status < 300) return res.text;
  return Effect.flatMap(HttpClientResponse.schemaBodyJson(Refusal)(res), Effect.fail);
};

const makeAskApi = Effect.fn('lab.ask.api')(function* () {
  const lab = yield* LabClient;
  const http = yield* HttpClient.HttpClient;
  const api: AskCalls = {
    index: (fresh) => {
      if (fresh) return called(lab.review.index({ query: { fresh: '1' } }));
      return called(lab.review.index({ query: {} }));
    },
    duration: (ref) => called(lab.review.duration({ query: { ref } })),
    text: (ref) => called(Effect.flatMap(http.get(reviewFileUrl(ref)), fileText)),
    phoneCopy: (ref) =>
      called(
        Effect.map(http.head(reviewPhoneUrl(ref)), (res) =>
          Match.value(res.status).pipe(
            Match.when(200, (): PhoneCopy => 'ready'),
            Match.when(422, (): PhoneCopy => 'failed'),
            Match.orElse((): PhoneCopy => 'pending'),
          ),
        ),
      ),
    board: (film) => called(lab.board.read({ params: { film } })),
    ask: (id) => called(lab.asks.read({ params: { ask: id } })),
    askPage: (id) => called(lab.asks.page({ params: { ask: id } })),
    answer: (id, sections) =>
      called(lab.asks.answer({ params: { ask: id }, payload: { sections } })),
    script: (film) => called(lab.script.beats({ params: { film } })),
    filmVoice: (film) => called(lab.script.voice({ params: { film } })),
    filmMarks: (film, post) => called(lab.script.marks({ params: { film }, payload: post })),
    attempts: (film, beat) => called(lab.studio.attempts({ params: { film, beat } })),
    series: called(lab.series.list()),
    draft: (series, draft) => called(lab.series.read({ params: { series, draft } })),
    draftVoice: (series, draft) => called(lab.series.voice({ params: { series, draft } })),
    draftMarks: (series, draft, post) =>
      called(lab.series.marks({ params: { series, draft }, payload: post })),
  };
  return api;
});

export const askApiLayer: Layer.Layer<AskApi, never, LabClient | HttpClient.HttpClient> =
  Layer.effect(AskApi, makeAskApi());
