import { Effect, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { MarksPost } from '../../core/api.ts';
import { Mark } from '../../core/delivery.ts';

export const MarkWrite = Schema.Struct({ post: MarksPost, read: Schema.Array(Mark) });
export type MarkWrite = typeof MarkWrite.Type;

export const MarkingState = State({
  Idle: {},
  Writing: { beat: Schema.String, write: MarkWrite },
  Written: { beat: Schema.String },
  Failed: { beat: Schema.String, reason: Schema.String },
});
export type MarkingState = typeof MarkingState.Type;

export const MarkingEvent = Event({
  Mark: { write: MarkWrite },
  Landed: {},
  Refused: { reason: Schema.String },
});
export type MarkingEvent = typeof MarkingEvent.Type;

const READY = [MarkingState.Idle, MarkingState.Written, MarkingState.Failed] as const;

const markingMachine = <R>(send: (write: MarkWrite) => Effect.Effect<void, string, R>) =>
  Machine.make({ state: MarkingState, event: MarkingEvent, initial: MarkingState.Idle })
    .on(READY, MarkingEvent.Mark, ({ event }) =>
      MarkingState.Writing({ beat: event.write.post.beat, write: event.write }),
    )
    .task(
      MarkingState.Writing,
      ({ state }) =>
        send(state.write).pipe(
          Effect.as(MarkingEvent.Landed),
          Effect.catch((reason) => Effect.succeed(MarkingEvent.Refused({ reason }))),
        ),
      { onSuccess: (event) => event },
    )
    .on(MarkingState.Writing, MarkingEvent.Landed, ({ state }) =>
      MarkingState.Written({ beat: state.beat }),
    )
    .on(MarkingState.Writing, MarkingEvent.Refused, ({ state, event }) =>
      MarkingState.Failed({ beat: state.beat, reason: event.reason }),
    );

export const spawnMarking = <R>(send: (write: MarkWrite) => Effect.Effect<void, string, R>) =>
  Machine.spawn(markingMachine(send)).pipe(Effect.tap((actor) => actor.start));
