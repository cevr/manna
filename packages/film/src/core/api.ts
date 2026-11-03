import { Codec, Field, Place } from '@manna/url-state';
import { Array as Arr, Option, Schema, SchemaAST } from 'effect';
import * as HttpApi from 'effect/http-api/HttpApi';
import * as HttpApiClient from 'effect/http-api/HttpApiClient';
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint';
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup';
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema';
import { BoardFile } from './board.ts';
import { AskName, AskRecord, AsksPage, StepValues } from './ask.ts';
import { OpId } from './catalogue.ts';
import { WaitTimeout } from './wait.ts';
import { UnknownAct, UnknownScene, UnknownVoice } from './errors.ts';
import {
  LabDown,
  LabElsewhere,
  LookFailed,
  LookInvalid,
  LookLevelUnknown,
  LookOutOfRange,
  LookPlaceUnknown,
  LookPost,
  LookTaken,
  PagesBroken,
  ToolFailed,
} from './easel.ts';
import { MatchFigureUnknown, MatchPost, MatchTaken } from './match.ts';
import {
  CounselFailed,
  CounselUnreadable,
  JudgeNothingToCompare,
  JudgePointAmbiguous,
  JudgePointUnjudged,
  JudgeRuleMissing,
} from './judge.ts';
import { ReviewDuration, ReviewIndex } from './review.ts';
import {
  AttemptUnknown,
  AudioInvalid,
  BodyTooLarge,
  CatalogueInvalid,
  ChoiceUnknown,
  DraftUnknown,
  DraftUnread,
  ElevenLabsFailed,
  FilmUnknown,
  FilmVersionUnkept,
  FilmVersionUnknown,
  FreshProcessFailed,
  MediaFailed,
  NoteNotFound,
  AskRefused,
  AskUnknown,
  PhoneCopyFailed,
  PhoneCopyUnmade,
  RecordingInvalid,
  RecordingLossy,
  ReviewFileUnknown,
  ReviewToolFailed,
  SceneNotLocated,
  SceneNotRendered,
  SourceChanged,
  HoldUnchanged,
  SourceRefused,
  SourceShared,
  StepNotNewest,
  StagingCapReached,
  StagingTakeUnknown,
  StillUnknown,
  SttUntimed,
  TakeMismatch,
  TakeUnknown,
  TimelineUnresolved,
  UndoUnavailable,
  VariantUnknown,
  VerbRefused,
  VersionChanged,
  VersionMoved,
  BoardFileUnknown,
  BoardRefused,
} from './refusals.ts';
import { LabWrite, PageBuild, TakeWord } from './schema.ts';
import { Segment } from './segment.ts';
import { StudioAttempts } from './studio.ts';
import { LineRead, Mark } from './delivery.ts';

export class RequestRefused extends Schema.TaggedError<RequestRefused>()('RequestRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

export class RequestInvalid extends Schema.TaggedError<RequestInvalid>()('RequestInvalid', {
  part: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the request's ${this.part.toLowerCase()} does not decode: ${this.reason}`;
  }
}

export class RouteUnknown extends Schema.TaggedError<RouteUnknown>()('RouteUnknown', {
  path: Schema.String,
}) {
  override get message() {
    return `the lab has no route ${this.path}`;
  }
}

export class WriteNotJson extends Schema.TaggedError<WriteNotJson>()('WriteNotJson', {
  type: Schema.String,
}) {
  override get message() {
    return `a write must send application/json, not ${this.type}`;
  }
}

export class ServerFailed extends Schema.TaggedError<ServerFailed>()('ServerFailed', {
  tag: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

const status = HttpApiSchema.status;

const Refusals = [
  NoteNotFound.pipe(status(404)),
  AskUnknown.pipe(status(404)),
  SceneNotLocated.pipe(status(404)),
  FilmUnknown.pipe(status(404)),
  FilmVersionUnknown.pipe(status(404)),
  FilmVersionUnkept.pipe(status(404)),
  ChoiceUnknown.pipe(status(404)),
  VariantUnknown.pipe(status(404)),
  TakeUnknown.pipe(status(404)),
  SceneNotRendered.pipe(status(404)),
  UnknownAct.pipe(status(404)),
  ReviewFileUnknown.pipe(status(404)),
  PhoneCopyUnmade.pipe(status(404)),
  StillUnknown.pipe(status(404)),
  BoardFileUnknown.pipe(status(404)),
  AttemptUnknown.pipe(status(404)),
  UnknownScene.pipe(status(404)),
  RouteUnknown.pipe(status(404)),
  LookPlaceUnknown.pipe(status(404)),
  LookLevelUnknown.pipe(status(404)),
  MatchFigureUnknown.pipe(status(404)),
  StagingTakeUnknown.pipe(status(404)),
  DraftUnknown.pipe(status(404)),
  AudioInvalid.pipe(status(400)),
  RequestInvalid.pipe(status(400)),
  LookInvalid.pipe(status(400)),
  RequestRefused.pipe(status(403)),
  UndoUnavailable.pipe(status(409)),
  StepNotNewest.pipe(status(409)),
  SourceChanged.pipe(status(409)),
  VerbRefused.pipe(status(409)),
  VersionChanged.pipe(status(409)),
  VersionMoved.pipe(status(409)),
  LabElsewhere.pipe(status(409)),
  AskRefused.pipe(status(409)),
  BodyTooLarge.pipe(status(413)),
  WriteNotJson.pipe(status(415)),
  RecordingLossy.pipe(status(415)),
  SourceRefused.pipe(status(422)),
  HoldUnchanged.pipe(status(422)),
  DraftUnread.pipe(status(422)),
  BoardRefused.pipe(status(422)),
  SourceShared.pipe(status(422)),
  TimelineUnresolved.pipe(status(422)),
  TakeMismatch.pipe(status(422)),
  RecordingInvalid.pipe(status(422)),
  PhoneCopyFailed.pipe(status(422)),
  UnknownVoice.pipe(status(422)),
  LookOutOfRange.pipe(status(422)),
  PagesBroken.pipe(status(422)),
  StagingCapReached.pipe(status(429)),
  ReviewToolFailed.pipe(status(502)),
  MediaFailed.pipe(status(502)),
  FreshProcessFailed.pipe(status(502)),
  ElevenLabsFailed.pipe(status(502)),
  SttUntimed.pipe(status(502)),
  LookFailed.pipe(status(502)),
  CatalogueInvalid.pipe(status(500)),
  ServerFailed.pipe(status(500)),
] as const;

export const Refusal = Schema.Union(Refusals);
export type Refusal = typeof Refusal.Type;

export const ToolFailure = Schema.Union([
  ...Refusals,
  LabDown,
  ToolFailed,
  JudgePointUnjudged,
  JudgeNothingToCompare,
  JudgePointAmbiguous,
  JudgeRuleMissing,
  CounselFailed,
  CounselUnreadable,
]);
export type ToolFailure = typeof ToolFailure.Type;

export const isRefusal = Schema.is(Refusal);

const annotatedStatus = SchemaAST.resolveAt<number>('httpApiStatus');

export const statusOf = (refusal: Refusal): number => {
  for (const schema of Refusals)
    if (Schema.is(schema)(refusal))
      return annotatedStatus(schema.ast) ?? schema.ast.context?.annotations?.httpApiStatus ?? 500;
  return 500;
};

const ScriptBeat = Schema.Struct({
  id: Schema.String,
  say: Schema.optionalKey(Schema.String),
  picture: Schema.optionalKey(Schema.String),
  cast: Schema.optionalKey(Schema.Array(Schema.String)),
  cite: Schema.Array(Schema.String),
});
export type ScriptBeat = typeof ScriptBeat.Type;

export const ScriptBeats = Schema.Struct({
  film: Schema.String,
  beats: Schema.Array(ScriptBeat),
});
export type ScriptBeats = typeof ScriptBeats.Type;

export const StagingTake = Schema.Union([
  Schema.TaggedStruct('Ready', {
    file: Schema.String,
    duration: Schema.Finite,
    words: Schema.Array(TakeWord),
  }),
  Schema.TaggedStruct('Voicing', {}),
  Schema.TaggedStruct('Unvoiced', {}),
  Schema.TaggedStruct('Refused', { reason: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type StagingTake = typeof StagingTake.Type;

export const ScriptVoice = Schema.Struct({
  film: Schema.String,
  spent: Schema.Int,
  cap: Schema.Int,
  beats: Schema.Array(Schema.Struct({ id: Schema.String, take: StagingTake })),
});
export type ScriptVoice = typeof ScriptVoice.Type;

export const MarksPost = Schema.Struct({
  beat: Schema.String,
  marks: Schema.Array(Mark),
  read: Schema.optionalKey(LineRead),
});
export type MarksPost = typeof MarksPost.Type;

export const SeriesList = Schema.Struct({
  series: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      title: Schema.String,
      drafts: Schema.Array(Schema.Struct({ name: Schema.String, title: Schema.String })),
    }),
  ),
});
export type SeriesList = typeof SeriesList.Type;

const DraftBeatRead = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  say: Schema.optionalKey(Schema.String),
  brief: Schema.optionalKey(Schema.String),
  cite: Schema.Array(Schema.String),
});
export type DraftBeatRead = typeof DraftBeatRead.Type;

export const DraftRead = Schema.Struct({
  series: Schema.String,
  draft: Schema.String,
  title: Schema.String,
  beats: Schema.Array(DraftBeatRead),
});
export type DraftRead = typeof DraftRead.Type;

export const Say = Schema.Union([
  Schema.TaggedStruct('Approve', {}),
  Schema.TaggedStruct('Withdraw', { given: Schema.OptionFromOptionalKey(OpId) }),
  Schema.TaggedStruct('Comment', { text: Schema.String.check(Schema.isNonEmpty()) }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type Say = typeof Say.Type;

export const SayPost = Schema.Struct({ point: Schema.String, variant: Schema.String, say: Say });
export type SayPost = typeof SayPost.Type;

const FileBytes = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array());

const film = { film: Schema.String };

const API = '/api';
const FILM = `${API}/films/:film`;
const REVIEW = `${API}/review`;

class ScriptGroup extends HttpApiGroup.make('script').add(
  HttpApiEndpoint.get('beats', `${FILM}/script`, {
    params: film,
    success: ScriptBeats,
    error: Refusals,
  }),
  HttpApiEndpoint.get('voice', `${FILM}/script/voice`, {
    params: film,
    success: ScriptVoice,
    error: Refusals,
  }),
  HttpApiEndpoint.get('take', `${FILM}/script/takes/:file`, {
    params: { ...film, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.post('marks', `${FILM}/script/marks`, {
    params: film,
    payload: MarksPost,
    success: LabWrite,
    error: Refusals,
  }),
) {}

const DRAFT = `${API}/series/:series/:draft`;
const draftParams = { series: Schema.String, draft: Schema.String };

class SeriesGroup extends HttpApiGroup.make('series').add(
  HttpApiEndpoint.get('list', `${API}/series`, { success: SeriesList, error: Refusals }),
  HttpApiEndpoint.get('read', DRAFT, { params: draftParams, success: DraftRead, error: Refusals }),
  HttpApiEndpoint.get('voice', `${DRAFT}/voice`, {
    params: draftParams,
    success: ScriptVoice,
    error: Refusals,
  }),
  HttpApiEndpoint.get('take', `${DRAFT}/takes/:file`, {
    params: { ...draftParams, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.post('marks', `${DRAFT}/marks`, {
    params: draftParams,
    payload: MarksPost,
    success: DraftRead,
    error: Refusals,
  }),
) {}

const BoardStale = Schema.Struct({
  panels: Schema.Array(Schema.Struct({ panel: Schema.String, why: Schema.String })),
});

class BoardGroup extends HttpApiGroup.make('board').add(
  HttpApiEndpoint.get('read', `${FILM}/board`, {
    params: film,
    success: BoardFile,
    error: Refusals,
  }),
  HttpApiEndpoint.get('stale', `${FILM}/board/stale`, {
    params: film,
    success: BoardStale,
    error: Refusals,
  }),
  HttpApiEndpoint.get('file', `${FILM}/board/files/:file`, {
    params: { ...film, file: Schema.String },
    query: { folder: Schema.optionalKey(Segment) },
    success: FileBytes,
    error: Refusals,
  }),
) {}

class StudioGroup extends HttpApiGroup.make('studio').add(
  HttpApiEndpoint.get('attempts', `${FILM}/studio/takes/:beat/attempts`, {
    params: { ...film, beat: Schema.String },
    success: StudioAttempts,
    error: Refusals,
  }),
  HttpApiEndpoint.get('attempt', `${FILM}/studio/takes/:beat/attempts/:file`, {
    params: { ...film, beat: Schema.String, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
) {}

export const REVIEW_FILES = `${REVIEW}/files/`;
export const REVIEW_PHONE = `${REVIEW}/phone/`;

class ReviewGroup extends HttpApiGroup.make('review').add(
  HttpApiEndpoint.get('index', `${REVIEW}/index`, {
    query: { fresh: Schema.optionalKey(Schema.String) },
    success: ReviewIndex,
    error: Refusals,
  }),
  HttpApiEndpoint.get('file', `${REVIEW_FILES}*`, { success: FileBytes, error: Refusals }),
  HttpApiEndpoint.get('phone', `${REVIEW_PHONE}*`, { success: FileBytes, error: Refusals }),
  HttpApiEndpoint.get('frame', `${REVIEW}/frame`, {
    query: {
      ref: Schema.String,
      t: Schema.optionalKey(Schema.Finite),
      w: Schema.optionalKey(Schema.Finite),
    },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.get('duration', `${REVIEW}/duration`, {
    query: { ref: Schema.String },
    success: ReviewDuration,
    error: Refusals,
  }),
) {}

const AskSectionPost = Schema.Struct({ step: AskName, values: StepValues });
type AskSectionPost = typeof AskSectionPost.Type;

const AskAnswerPost = Schema.Union([
  Schema.Struct({ sections: Schema.Array(AskSectionPost).check(Schema.isMinLength(1)) }),
  Schema.Struct({ ...AskSectionPost.fields, sections: Schema.optionalKey(Schema.Never) }),
]);
type AskAnswerPost = typeof AskAnswerPost.Type;

export const sectionsPosted = (post: AskAnswerPost): ReadonlyArray<AskSectionPost> => {
  if ('step' in post) return [{ step: post.step, values: post.values }];
  return post.sections;
};

class AsksGroup extends HttpApiGroup.make('asks').add(
  HttpApiEndpoint.get('read', `${API}/asks/:ask`, {
    params: { ask: Schema.String },
    success: AskRecord,
    error: Refusals,
  }),
  HttpApiEndpoint.get('page', `${API}/asks/:ask/page`, {
    params: { ask: Schema.String },
    success: AsksPage,
    error: Refusals,
  }),
  HttpApiEndpoint.post('answer', `${API}/asks/:ask/answer`, {
    params: { ask: Schema.String },
    payload: AskAnswerPost,
    success: AskRecord,
    error: Refusals,
  }),
  HttpApiEndpoint.get('shown', `${API}/asks/:ask/shown/:file`, {
    params: { ask: Schema.String, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
) {}

class LooksGroup extends HttpApiGroup.make('looks').add(
  HttpApiEndpoint.post('take', `${FILM}/looks`, {
    params: film,
    payload: LookPost,
    success: LookTaken,
    error: Refusals,
  }),
) {}

class MatchesGroup extends HttpApiGroup.make('matches').add(
  HttpApiEndpoint.post('take', `${FILM}/matches`, {
    params: film,
    payload: MatchPost,
    success: MatchTaken,
    error: Refusals,
  }),
) {}

class PageGroup extends HttpApiGroup.make('page').add(
  HttpApiEndpoint.get('wait', `${REVIEW}/build`, {
    query: {
      since: Schema.Finite,
      server: Schema.optionalKey(Schema.String),
      film: Schema.optionalKey(Schema.String),
      timeout: WaitTimeout,
    },
    success: PageBuild,
    error: Refusals,
  }),
) {}

export class LabHttpApi extends HttpApi.make('lab')
  .add(ScriptGroup)
  .add(SeriesGroup)
  .add(BoardGroup)
  .add(StudioGroup)
  .add(ReviewGroup)
  .add(LooksGroup)
  .add(MatchesGroup)
  .add(PageGroup)
  .add(AsksGroup) {}

export const prefixesOf = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<string> => {
  const prefixes = new Set<string>();
  HttpApi.reflect(api, {
    onGroup: () => {},
    onEndpoint: ({ endpoint }) => void prefixes.add(`/${endpoint.path.split('/')[1] ?? ''}/`),
  });
  return [...prefixes];
};

export type PageName = 'ask';

export type AppPage = PageName | 'render';

const filmParams = { film: Codec.Segment };

const still = Field.key(Codec.Text, { default: '', history: 'push' });

export const Places = {
  home: Place.make({ path: '/' }),
  export: Place.make({ path: '/films/:film/export', params: filmParams }),
  ask: Place.make({
    path: '/asks/:ask',
    params: { ask: Codec.Segment },
    query: Field.struct({ still }),
  }),
  askPage: Place.make({
    path: '/asks/page/:page',
    params: { page: Codec.Segment },
    query: Field.struct({ still }),
  }),
};

const PAGES: ReadonlyArray<readonly [Place.Place<unknown>, AppPage]> = [
  [Places.export, 'render'],
  [Places.ask, 'ask'],
  [Places.askPage, 'ask'],
];

export const pageAt = (pathname: string): Option.Option<AppPage> =>
  Option.map(
    Arr.findFirst(PAGES, ([place]) => Option.isSome(Place.decode(place, pathname))),
    ([, page]) => page,
  );

export const pageMove = (from: string, to: string): 'push' | 'replace' =>
  Option.match(
    Arr.findFirst(PAGES, ([place]) => Option.isSome(Place.decode(place, to))),
    {
      onNone: () => 'push',
      onSome: ([place]) => Place.history(place, from, to).history,
    },
  );

export const filmOfPage = (href: string): Option.Option<string> =>
  Option.map(Place.decode(Places.export, href), (v) => v.path.film);

export const pageHref = {
  home: (): string => Place.href(Places.home, { path: {}, query: {}, hash: {} }),
  ask: (ask: string): string =>
    Place.href(Places.ask, { path: { ask }, query: { still: '' }, hash: {} }),
  askPage: (page: string): string =>
    Place.href(Places.askPage, { path: { page }, query: { still: '' }, hash: {} }),
  export: (film: string): string =>
    Place.href(Places.export, { path: { film }, query: {}, hash: {} }),
};

export const labUrls = HttpApiClient.urlBuilder(LabHttpApi);

export const boardFileUrl = (film: string, file: string, folder?: Segment): string =>
  labUrls.board.file({
    params: { film, file },
    query: Option.match(Option.fromUndefinedOr(folder), {
      onNone: () => ({}),
      onSome: (f) => ({ folder: f }),
    }),
  });

export const askShownUrl = (ask: string, file: string): string =>
  labUrls.asks.shown({ params: { ask, file } });

export const attemptUrl = (film: string, beat: string, file: string): string =>
  labUrls.studio.attempt({ params: { film, beat, file } });

export const stagingTakeUrl = (film: string, file: string): string =>
  labUrls.script.take({ params: { film, file } });

export const draftTakeUrl = (series: string, draft: string, file: string): string =>
  labUrls.series.take({ params: { series, draft, file } });

const refPath = (ref: string) =>
  ref
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const refUrl = (at: typeof REVIEW_FILES | typeof REVIEW_PHONE, ref: string): string =>
  `${at}${refPath(ref)}`;

export const reviewFileUrl = (ref: string): string => refUrl(REVIEW_FILES, ref);

export const reviewPhoneUrl = (ref: string): string => refUrl(REVIEW_PHONE, ref);

export const reviewFrameUrl = (ref: string, t: Option.Option<number>, w: number): string => {
  const at = Option.match(t, { onNone: () => ({}), onSome: (s) => ({ t: Number(s.toFixed(2)) }) });
  return labUrls.review.frame({ query: { ref, w: Math.round(w), ...at } });
};
