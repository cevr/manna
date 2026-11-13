/**
 * Move back a stage, in Today's footer on a verse Today shows by a tap (a
 * row of a list, a plant of home, `Practice this list`), at rest: no
 * recital under way or shown. A verse past a seed offers the control
 * `Move back a stage`; a seed offers none, as no stage lies below it.
 *
 * A tap puts the ask in its place, `Move <reference> back to <stage>? It
 * comes due again soon.`, with `Move back` and `Keep`. The ask's `Move
 * back` runs the step back in a transition: while it runs both answers
 * show as disabled, and its answer lands as one event. `Moved` drops the
 * ask and leaves the line `Moved back to <stage>.` (`id=moved`), the stage
 * line above it already the new stage, with the control again while the
 * verse stands past a seed; `Failed` drops the ask and leaves the alert
 * `<reference> was not moved back. Try again.` until the next tap. An
 * answer lands only on the ask it answers, and the garden moves a verse
 * only from the stage the ask saw, so two taps in one turn move it once.
 * The state is the control's own, dropped when it leaves.
 */

import { useAtomSet } from '@effect/atom-react';
import { Exit, Option } from 'effect';
import { useReducer, useTransition } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { moveBack } from '../app';
import { Control } from '../field/plot';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';
import { backOf, type BackAnswer, type Stage } from '../garden';

/** Each stage as the ask and the moved line name it. */
const NAMED: Readonly<Record<Stage, string>> = {
  seed: 'a seed',
  blade: 'a blade',
  ear: 'an ear',
  'full corn': 'full corn',
};

/** The control's state: at rest, asking, moved to a stage, or refused. */
type Bar =
  | { readonly status: 'Idle' }
  | { readonly status: 'Asking' }
  | { readonly status: 'Moved'; readonly stage: Stage }
  | { readonly status: 'Refused' };

/** What happened to the control: its tap, the ask's `Keep`, or the garden's answer to the ask's `Move back`, which lands the verse at `landing`. */
type Happened =
  | { readonly type: 'opened' }
  | { readonly type: 'kept' }
  | { readonly type: 'answered'; readonly answer: BackAnswer; readonly landing: Stage };

const IDLE: Bar = { status: 'Idle' };
const ASKING: Bar = { status: 'Asking' };

/** The state after `happened`: the ask opens from any state but itself, and `Keep` and an answer land only on the ask. */
const barAfter = (bar: Bar, happened: Happened): Bar => {
  switch (happened.type) {
    case 'opened':
      return ASKING;
    case 'kept':
      if (bar.status !== 'Asking') return bar;
      return IDLE;
    case 'answered':
      if (bar.status !== 'Asking') return bar;
      if (happened.answer === 'Moved') return { status: 'Moved', stage: happened.landing };
      return { status: 'Refused' };
  }
  happened satisfies never;
  return bar;
};

/** Move back a stage for the verse of `reference`, standing at `stage` now. */
export function MoveBack({
  reference,
  stage,
}: {
  readonly reference: string;
  readonly stage: Stage;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const [bar, dispatch] = useReducer(barAfter, IDLE);
  const [pending, startTransition] = useTransition();
  const back = useAtomSet(moveBack, { mode: 'promiseExit' });
  /** The ask's `Move back`: the step back from `stage`, its answer (`Failed` for a failure) landing as one event. */
  const onConfirm = (landing: Stage) =>
    /* oxlint-disable effect/noAsyncFunction -- a React action: the transition awaits the step back, so its pending state is React's, and the answer lands in the same action. */
    startTransition(async () => {
      const exit = await back({ reference, from: stage });
      /* oxlint-enable effect/noAsyncFunction */
      const answer = Exit.match(exit, {
        onSuccess: (value): BackAnswer => value,
        onFailure: (): BackAnswer => 'Failed',
      });
      dispatch({ type: 'answered', answer, landing });
    });
  return (
    <View style={styles.back}>
      {bar.status === 'Moved' && (
        <Text testID="moved" style={styles.line}>
          {`Moved back to ${NAMED[bar.stage]}.`}
        </Text>
      )}
      {bar.status === 'Refused' && (
        <Text role="alert" testID="back-alert" style={styles.line}>
          {`${reference} was not moved back. Try again.`}
        </Text>
      )}
      {Option.match(backOf(stage), {
        onNone: () => false,
        onSome: (landing) => {
          if (bar.status === 'Asking')
            return (
              <View style={styles.ask}>
                <Text testID="back-ask" style={styles.line}>
                  {`Move ${reference} back to ${NAMED[landing]}? It comes due again soon.`}
                </Text>
                <View style={styles.answers}>
                  <Control
                    label="Move back"
                    shown="Move back"
                    pending={pending}
                    onPress={() => onConfirm(landing)}
                  />
                  <Control
                    label="Keep"
                    shown="Keep"
                    pending={pending}
                    onPress={() => dispatch({ type: 'kept' })}
                  />
                </View>
              </View>
            );
          return (
            <Pressable
              role="button"
              aria-label="Move back a stage"
              onPress={() => dispatch({ type: 'opened' })}
              style={({ pressed }) => [styles.control, pressed && look.pressed]}
            >
              <Text style={styles.controlText}>Move back a stage</Text>
            </Pressable>
          );
        },
      })}
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    back: { gap: 8 },
    control: {
      minHeight: 44,
      justifyContent: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    controlText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.quiet },
    ask: { gap: 8 },
    answers: { flexDirection: 'row', gap: 8 },
    line: { fontFamily: face, fontSize: 15, lineHeight: 21, fontWeight: '600', color: color.ink },
  }),
);
