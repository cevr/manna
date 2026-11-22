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
 * `<reference> was not moved back. Try again.` until the next tap. Each
 * tap of the control opens a new ask (its own object), which the garden
 * settles once: however often its `Move back` is pressed and whatever its
 * first save does, an ask moves the verse at most one stage, and every
 * answer to it is the same. An answer lands whenever it answers the latest
 * ask, kept or not, so the line or alert always says what was saved; while
 * a step back runs the control too is disabled, so no new ask opens over
 * it. The state is the control's own, dropped when it leaves.
 */

import { useAtomSet } from '@effect/atom-react';
import { Option } from 'effect';
import { useReducer, useTransition } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { moveBack } from '../app';
import { Control } from '../field/plot';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';
import { backOf, type BackAsk, type Stage } from '../garden';
import { alertLine, answerOf, askLine, barAfter, IDLE, movedLine } from './bar';

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
  /** The ask's `Move back`: the garden settles `ask` (once, however often it is pressed), its answer (`Failed` for a failure) landing as one event. */
  const onConfirm = (ask: BackAsk) =>
    /* oxlint-disable effect/noAsyncFunction -- a React action: the transition awaits the step back, so its pending state is React's, and the answer lands in the same action. */
    startTransition(async () => {
      const exit = await back(ask);
      /* oxlint-enable effect/noAsyncFunction */
      const answer = answerOf(exit);
      dispatch({ type: 'answered', ask, answer });
    });
  return (
    <View style={styles.back}>
      {bar.status === 'Moved' && (
        <Text testID="moved" style={styles.line}>
          {movedLine(bar.stage)}
        </Text>
      )}
      {bar.status === 'Refused' && (
        <Text role="alert" testID="back-alert" style={styles.line}>
          {alertLine(reference)}
        </Text>
      )}
      {Option.match(backOf(stage), {
        onNone: () => false,
        onSome: (landing) => {
          if (bar.status === 'Asking') {
            const { ask } = bar;
            return (
              <View style={styles.ask}>
                <Text testID="back-ask" style={styles.line}>
                  {askLine(reference, landing)}
                </Text>
                <View style={styles.answers}>
                  <Control
                    label="Move back"
                    shown="Move back"
                    pending={pending}
                    onPress={() => onConfirm(ask)}
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
          }
          return (
            <Pressable
              role="button"
              aria-label="Move back a stage"
              disabled={pending}
              onPress={() => dispatch({ type: 'opened', ask: { reference, from: stage } })}
              style={({ pressed }) => [
                styles.control,
                pressed && look.pressed,
                pending && look.disabled,
              ]}
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
