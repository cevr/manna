import { Array as Arr, Boolean as Bool, Data, Option, Order } from 'effect';
import { type BoardFile, PANEL_START, type Panel, panelsOf } from './board.ts';

export interface TimedBeat {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly markAt: (name: string) => Option.Option<number>;
}

export type Shot = Data.TaggedEnum<{
  Boarded: {
    readonly beat: string;
    readonly panel: Panel;
    readonly at: number;
    readonly from: number;
  };
  Unboarded: { readonly beat: string; readonly from: number };
}>;
export const Shot = Data.taggedEnum<Shot>();

const panelTime = (beat: TimedBeat, panel: Panel): number =>
  Option.getOrElse(
    Option.filter(
      Option.flatMap(
        Option.liftPredicate(panel.at, (at) => at !== PANEL_START),
        beat.markAt,
      ),
      (t) => t >= beat.start,
    ),
    () => beat.start,
  );

const byAt = Order.mapInput(Order.Number, (s: { readonly at: number }) => s.at);

export const shotsOf = (beats: ReadonlyArray<TimedBeat>, board: BoardFile): ReadonlyArray<Shot> =>
  beats.flatMap((beat): ReadonlyArray<Shot> => {
    const timed = Arr.sort(
      panelsOf(board, beat.id).map((panel) => ({ panel, at: panelTime(beat, panel) })),
      byAt,
    );
    return Option.match(Arr.head(timed), {
      onNone: () => [Shot.Unboarded({ beat: beat.id, from: beat.start })],
      onSome: () =>
        timed.map(({ panel, at }, i) =>
          Shot.Boarded({
            beat: beat.id,
            panel,
            at,
            from: Bool.match(i === 0, { onTrue: () => beat.start, onFalse: () => at }),
          }),
        ),
    });
  });
