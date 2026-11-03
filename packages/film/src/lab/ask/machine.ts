import { Array as Arr, Effect, Option, Record, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import {
  AskRecord,
  askedIn,
  filled,
  pageRefusal,
  questionsOf,
  sectionsOf,
  unansweredText,
} from '../../core/ask.ts';
import type { LabFailure } from '../api.ts';
import { AskApi } from './api.ts';
import { failureText } from './format.ts';

export const Draft = Schema.Record(Schema.String, Schema.String);
export type Draft = typeof Draft.Type;

export const Page = Schema.Struct({ record: AskRecord, draft: Draft });
export type Page = typeof Page.Type;

export const AskPageState = State({
  Reading: { said: Schema.String },
  Open: { page: Page, said: Schema.String, missing: Schema.String },
  Sending: { page: Page, sent: Draft },
  Rereading: { page: Page, said: Schema.String },
  Gone: { page: Page, why: Schema.String },
  Unreadable: { why: Schema.String },
});
export type AskPageState = typeof AskPageState.Type;

export const AskPageEvent = Event({
  Read: { record: AskRecord },
  Unread: { why: Schema.String, gone: Schema.Boolean },
  Retry: {},
  Set: { id: Schema.String, value: Schema.String },
  Restored: { draft: Draft },
  Submit: {},
  Landed: { record: AskRecord },
  Refused: { why: Schema.String },
  Unreachable: { why: Schema.String },
});
export type AskPageEvent = typeof AskPageEvent.Type;

export const pageSections = (record: AskRecord, draft: Draft) =>
  sectionsOf(record.ask, record.state, draft);

const sent = (record: AskRecord, draft: Draft) =>
  pageSections(record, draft).map((s) => ({ step: s.name, values: filled(s.values) }));

const stillOpen = (record: AskRecord, draft: Draft): Draft =>
  Object.assign({}, ...pageSections(record, draft).map((s) => s.values));

const reread = (page: Page, record: AskRecord): Page => ({
  record,
  draft: stillOpen(record, page.draft),
});

const restored = (page: Page, kept: Draft): Page => ({
  ...page,
  draft: stillOpen(page.record, { ...kept, ...page.draft }),
});

const drafted = (page: Page, id: string, value: string): Page => ({
  ...page,
  draft: { ...page.draft, [id]: value },
});

const lateLabels = (page: Page, went: Draft, landed: AskRecord): ReadonlyArray<string> => {
  const open = stillOpen(landed, page.draft);
  const asked = Object.values(page.record.ask.steps).flatMap(askedIn);
  return Record.keys(page.draft)
    .filter((id) => !Record.has(open, id))
    .filter((id) => (page.draft[id] ?? '').trim() !== (went[id] ?? '').trim())
    .map((id) =>
      Option.getOrElse(
        Option.map(
          Arr.findFirst(asked, (b) => b.id === id),
          (b) => b.label,
        ),
        () => id,
      ),
    );
};

const landedText = (late: ReadonlyArray<string>): string =>
  Option.match(Arr.match(late, { onEmpty: Option.none, onNonEmpty: Option.some }), {
    onNone: () => '',
    onSome: (labels) =>
      `Sent before your change to ${labels.map((l) => `“${l}”`).join(', ')}: the lab has the answer as it was at Send.`,
  });

const draftRefusal = (
  record: AskRecord,
  draft: Draft,
): Option.Option<{ readonly why: string; readonly missing: string }> =>
  Option.orElse(
    Option.map(
      Arr.findFirst(questionsOf(pageSections(record, draft)), (q) => !q.answered),
      (q) => ({ why: unansweredText(q.block), missing: q.block.id }),
    ),
    () =>
      Option.map(pageRefusal(record.ask, record.state, sent(record, draft)), (why) => ({
        why,
        missing: '',
      })),
  );

const unsent = (failure: LabFailure): AskPageEvent => {
  if (failure._tag === 'LabUnreachable')
    return AskPageEvent.Unreachable({ why: failureText(failure) });
  return AskPageEvent.Refused({ why: failureText(failure) });
};

const readEvents = {
  onSuccess: (record: AskRecord) => AskPageEvent.Read({ record }),
  onFailure: (failure: LabFailure) =>
    AskPageEvent.Unread({ why: failureText(failure), gone: failure._tag === 'AskUnknown' }),
};

const askPageMachine = (id: string, first: Effect.Effect<AskRecord, LabFailure, AskApi>) =>
  Machine.make({
    state: AskPageState,
    event: AskPageEvent,
    initial: AskPageState.Reading({ said: '' }),
  })
    .task(AskPageState.Reading, () => first, readEvents)
    .task(AskPageState.Rereading, () => AskApi.use((api) => api.ask(id)), readEvents)
    .on(AskPageState.Reading, AskPageEvent.Read, ({ state, event }) =>
      AskPageState.Open({
        page: { record: event.record, draft: {} },
        said: state.said,
        missing: '',
      }),
    )
    .on(AskPageState.Reading, AskPageEvent.Unread, ({ event }) =>
      AskPageState.Unreadable({ why: event.why }),
    )
    .on(AskPageState.Unreadable, AskPageEvent.Retry, () => AskPageState.Reading({ said: '' }))
    .on(AskPageState.Open, AskPageEvent.Set, ({ state, event }) =>
      AskPageState.Open({
        page: drafted(state.page, event.id, event.value),
        said: '',
        missing: '',
      }),
    )
    .on(AskPageState.Open, AskPageEvent.Restored, ({ state, event }) =>
      AskPageState.Open({ ...state, page: restored(state.page, event.draft) }),
    )
    .on(AskPageState.Sending, AskPageEvent.Set, ({ state, event }) =>
      AskPageState.Sending({ ...state, page: drafted(state.page, event.id, event.value) }),
    )
    .on(AskPageState.Rereading, AskPageEvent.Set, ({ state, event }) =>
      AskPageState.Rereading({ ...state, page: drafted(state.page, event.id, event.value) }),
    )
    .on(AskPageState.Gone, AskPageEvent.Set, ({ state, event }) =>
      AskPageState.Gone({ ...state, page: drafted(state.page, event.id, event.value) }),
    )
    .on(AskPageState.Open, AskPageEvent.Submit, ({ state }) =>
      Option.match(draftRefusal(state.page.record, state.page.draft), {
        onNone: (): AskPageState =>
          AskPageState.Sending({ page: state.page, sent: state.page.draft }),
        onSome: ({ why, missing }): AskPageState =>
          AskPageState.Open({ ...state, said: why, missing }),
      }),
    )
    .task(
      AskPageState.Sending,
      ({ state }) => AskApi.use((api) => api.answer(id, sent(state.page.record, state.sent))),
      {
        onSuccess: (record) => AskPageEvent.Landed({ record }),
        onFailure: unsent,
      },
    )
    .on(AskPageState.Sending, AskPageEvent.Landed, ({ state, event }) =>
      AskPageState.Open({
        page: reread(state.page, event.record),
        said: landedText(lateLabels(state.page, state.sent, event.record)),
        missing: '',
      }),
    )
    .on(AskPageState.Sending, AskPageEvent.Unreachable, ({ state, event }) =>
      AskPageState.Open({
        page: state.page,
        said: `Not sent: ${event.why}. Your answers are kept: send again.`,
        missing: '',
      }),
    )
    .on(AskPageState.Sending, AskPageEvent.Refused, ({ state, event }) =>
      AskPageState.Rereading({ page: state.page, said: event.why }),
    )
    .on(AskPageState.Rereading, AskPageEvent.Read, ({ state, event }) =>
      AskPageState.Open({ page: reread(state.page, event.record), said: state.said, missing: '' }),
    )
    .on(AskPageState.Rereading, AskPageEvent.Unread, ({ state, event }): AskPageState => {
      if (event.gone) return AskPageState.Gone({ page: state.page, why: event.why });
      return AskPageState.Open({
        page: state.page,
        said: `${state.said}; the ask could not be read again: ${event.why}`,
        missing: '',
      });
    });

export const spawnAskPage = (id: string, first: Effect.Effect<AskRecord, LabFailure, AskApi>) =>
  Machine.spawn(askPageMachine(id, first)).pipe(Effect.tap((actor) => actor.start));

export type AskPageActor = Effect.Success<ReturnType<typeof spawnAskPage>>;
