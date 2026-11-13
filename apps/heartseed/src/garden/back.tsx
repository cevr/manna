/**
 * Move back a stage, in Today's footer on a verse Today shows by a tap (a
 * row of a list, a plant of home, `Practice this list`), at rest: no
 * recital under way or shown. A verse past a seed offers the control
 * `Move back a stage`; a seed offers none, as no stage lies below it.
 *
 * A tap puts the ask in its place, `Move <reference> back to <stage>? It
 * comes due again soon.`, with `Move back` and `Keep`. From a tap of the
 * ask's `Move back` until its answer, no tap of either changes anything and
 * each shows as disabled. `Moved` drops the ask and leaves the line `Moved
 * back to <stage>.` (`id=moved`), the stage line above it already the new
 * stage, with the control again while the verse stands past a seed; any
 * other answer drops the ask and leaves the alert `<reference> was not
 * moved back. Try again.` until the next tap. The ask, the line, the alert
 * and the pending state are the control's own, dropped when it leaves.
 */

import { useAtomSet } from '@effect/atom-react';
import { Option } from 'effect';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { moveBack } from '../app';
import { Control } from '../field/plot';
import { themed, useThemed } from '../look';
import { useLook } from '../sayit/draw';
import { backOf, type Stage } from '../garden';

/** Each stage as the ask and the moved line name it. */
const NAMED: Readonly<Record<Stage, string>> = {
  seed: 'a seed',
  blade: 'a blade',
  ear: 'an ear',
  'full corn': 'full corn',
};

/** The control's own state: whether the ask shows, the stage the last step back landed on, the alert of one that did not land, and whether one is pending. */
interface Bar {
  readonly asking: boolean;
  readonly moved: Option.Option<Stage>;
  readonly alert: Option.Option<string>;
  readonly pending: boolean;
}

const IDLE: Bar = { asking: false, moved: Option.none(), alert: Option.none(), pending: false };

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
  const [bar, setBar] = useState<Bar>(IDLE);
  const busy = useRef(false);
  const back = useAtomSet(moveBack, { mode: 'promise' });
  const to = backOf(stage);
  /** The ask's `Move back`: the step back runs once, nothing else answers until it does. */
  const onConfirm = (landing: Stage) => {
    if (busy.current) return;
    busy.current = true;
    setBar((now) => ({ ...now, pending: true }));
    const settle = (answer: string) => {
      busy.current = false;
      if (answer === 'Moved') return setBar({ ...IDLE, moved: Option.some(landing) });
      setBar({
        ...IDLE,
        alert: Option.some(`${reference} was not moved back. Try again.`),
      });
    };
    void back(reference).then(settle, () => settle('Failed'));
  };
  /** A tap of the control or of `Keep`: nothing while a step back is pending, else the line and the alert clear and `then` runs. */
  const tapped = (then: () => void) => {
    if (busy.current) return;
    then();
  };
  return (
    <View style={styles.back}>
      {Option.match(bar.moved, {
        onNone: () => false,
        onSome: (landed) => (
          <Text testID="moved" style={styles.line}>
            {`Moved back to ${NAMED[landed]}.`}
          </Text>
        ),
      })}
      {Option.match(bar.alert, {
        onNone: () => false,
        onSome: (alert) => (
          <Text role="alert" testID="back-alert" style={styles.line}>
            {alert}
          </Text>
        ),
      })}
      {Option.match(to, {
        onNone: () => false,
        onSome: (landing) => {
          if (bar.asking)
            return (
              <View style={styles.ask}>
                <Text testID="back-ask" style={styles.line}>
                  {`Move ${reference} back to ${NAMED[landing]}? It comes due again soon.`}
                </Text>
                <View style={styles.answers}>
                  <Control
                    label="Move back"
                    shown="Move back"
                    pending={bar.pending}
                    onPress={() => onConfirm(landing)}
                  />
                  <Control
                    label="Keep"
                    shown="Keep"
                    pending={bar.pending}
                    onPress={() => tapped(() => setBar(IDLE))}
                  />
                </View>
              </View>
            );
          return (
            <Pressable
              role="button"
              aria-label="Move back a stage"
              onPress={() => tapped(() => setBar({ ...IDLE, asking: true }))}
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
