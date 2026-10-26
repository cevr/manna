// The lab's routes as the ask page calls them, through the page's one client
// of the lab's API (`LabClient`, the groups of `core/api.ts`): the asks, the
// material their sections show (a film's script and Board, a series draft,
// a take, a video of the review's index and its length, a document's text)
// decoded by their Schemas. A doc's text is the file itself, fetched by its
// URL (the route's path is the ref, which the derived client does not
// build). A refusal is the server's own failure; a request that never
// arrived says so (`LabFailure`, as every lab call fails).

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
  /** Every folder with something to review (a video or a document an ask shows); `fresh` walks the roots again now. */
  readonly index: (fresh: boolean) => Effect.Effect<ReviewIndex, LabFailure>;
  /** A video's length, in seconds, and its frames a second as its own packets give them (never rounded; none when it has no video). */
  readonly duration: (ref: string) => Effect.Effect<ReviewDuration, LabFailure>;
  /** A doc's text (a set's notes, a folder's markdown). */
  readonly text: (ref: string) => Effect.Effect<string, LabFailure>;
  /**
   * Where a video's phone copy stands: its URL asked for its head alone, none
   * of its bytes; made (200), failed (422, \`PhoneCopyFailed\`), else still
   * being made.
   */
  readonly phoneCopy: (ref: string) => Effect.Effect<PhoneCopy, LabFailure>;
  /** A film's storyboard as its record stands now (`core/board.ts`). */
  readonly board: (film: string) => Effect.Effect<BoardFile, LabFailure>;
  /** An agent's ask, as the lab keeps it (`core/ask.ts`). */
  readonly ask: (id: string) => Effect.Effect<AskRecord, LabFailure>;
  /** The page of asks ask `id` is on: every ask on it, in the order made. */
  readonly askPage: (id: string) => Effect.Effect<AsksPage, LabFailure>;
  /** The owner's answers to ask `id`'s page, each section's in order: the ask as they leave it. */
  readonly answer: (
    id: string,
    sections: ReadonlyArray<{ readonly step: AskName; readonly values: StepValues }>,
  ) => Effect.Effect<AskRecord, LabFailure>;
  /** A film's script as its `script.ts` reads now: each beat's line, picture and sources. */
  readonly script: (film: string) => Effect.Effect<ScriptBeats, LabFailure>;
  /** Each spoken beat of a film's script as its staging take stands, and the day's spend. */
  readonly filmVoice: (film: string) => Effect.Effect<ScriptVoice, LabFailure>;
  /** A beat's delivery marks written into a film's `script.ts`. */
  readonly filmMarks: (film: string, post: MarksPost) => Effect.Effect<LabWrite, LabFailure>;
  /** A film's recorded takes of beat `beat`, newest first, the kept one among them. */
  readonly attempts: (film: string, beat: string) => Effect.Effect<StudioAttempts, LabFailure>;
  /** The app's series and their drafts. */
  readonly series: Effect.Effect<SeriesList, LabFailure>;
  /** Series draft `draft` of `series`, as its Markdown reads now. */
  readonly draft: (series: string, draft: string) => Effect.Effect<DraftRead, LabFailure>;
  /** Each spoken beat of a series draft as its staging take stands, and the day's spend. */
  readonly draftVoice: (series: string, draft: string) => Effect.Effect<ScriptVoice, LabFailure>;
  /** A beat's delivery marks written into a series draft: the draft as it leaves it. */
  readonly draftMarks: (
    series: string,
    draft: string,
    post: MarksPost,
  ) => Effect.Effect<DraftRead, LabFailure>;
}

export class AskApi extends Context.Service<AskApi, AskCalls>()('@manna/film/lab/AskApi') {}

/** A file's text when it is served; the server's refusal (JSON, by the contract) when not. */
const fileText = (res: HttpClientResponse.HttpClientResponse) => {
  if (res.status >= 200 && res.status < 300) return res.text;
  return Effect.flatMap(HttpClientResponse.schemaBodyJson(Refusal)(res), Effect.fail);
};

/** The ask page's routes on the page's own origin: a doc's URL is a path, resolved against the page's address. */
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

/** The ask page's routes on the page's own origin, over the page's one client (given at its root). */
export const askApiLayer: Layer.Layer<AskApi, never, LabClient | HttpClient.HttpClient> =
  Layer.effect(AskApi, makeAskApi());
