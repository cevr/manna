import { Option } from 'effect';
import { StyleSheet, Text, View } from 'react-native';

import { color, useAccent, useOnAccent } from '~/color';
import { type Fingering, FRETS_DRAWN, type Play } from '~/hymns/shapes';

const STRING_GAP = 22;
const FRET_GAP = 28;
const DOT = 18;
const MARKS = 20;
const LABEL = 30;

const WIDTH = LABEL + STRING_GAP * 5 + DOT + LABEL;
const HEIGHT = MARKS + FRET_GAP * FRETS_DRAWN + 4;

const xOf = (string: number) => LABEL + DOT / 2 + string * STRING_GAP;

const yOf = (fret: number) => MARKS + (fret - 0.5) * FRET_GAP;

export function ChordBox({
  fingering,
  label,
  testID,
}: {
  readonly fingering: Fingering;
  readonly label: string;
  readonly testID: string;
}) {
  const accent = useAccent();
  const onAccent = useOnAccent();
  const fromNut = fingering.first === 1;
  const barreFret = Option.match(fingering.barre, { onNone: () => 0, onSome: (b) => b.fret });
  return (
    <View role="img" aria-label={label} testID={testID} style={styles.box}>
      <View aria-hidden style={StyleSheet.absoluteFill}>
        {Array.from({ length: 6 }, (_, s) => (
          <View key={`s${s}`} style={[styles.string, { left: xOf(s) }]} />
        ))}
        {Array.from({ length: FRETS_DRAWN + 1 }, (_, f) => (
          <View
            key={`f${f}`}
            style={[styles.fret, { top: MARKS + f * FRET_GAP }, f === 0 && fromNut && styles.nut]}
          />
        ))}
        {!fromNut && (
          <Text testID={`${testID}-first`} style={styles.first}>
            {`${fingering.first}fr`}
          </Text>
        )}
        {fingering.strings.map((play, s) => (
          <Mark key={`m${s}`} play={play} string={s} />
        ))}
        {Option.toArray(fingering.barre).map((b) => (
          <View
            key="barre"
            testID={`${testID}-barre`}
            style={[
              styles.barre,
              {
                left: xOf(b.from) - DOT / 2,
                width: (b.to - b.from) * STRING_GAP + DOT,
                top: yOf(b.fret - fingering.first + 1) - DOT / 2,
                backgroundColor: accent,
              },
            ]}
          >
            <Text style={[styles.finger, { color: onAccent }]}>{b.finger}</Text>
          </View>
        ))}
        {fingering.strings.flatMap((play, s) => {
          if (play._tag !== 'Fretted' || play.fret === barreFret) return [];
          return [
            <View
              key={`d${s}`}
              testID={`${testID}-dot-${s}`}
              style={[
                styles.dot,
                {
                  left: xOf(s) - DOT / 2,
                  top: yOf(play.fret - fingering.first + 1) - DOT / 2,
                  backgroundColor: accent,
                },
              ]}
            >
              <Text style={[styles.finger, { color: onAccent }]}>{play.finger}</Text>
            </View>,
          ];
        })}
      </View>
    </View>
  );
}

function Mark({ play, string }: { readonly play: Play; readonly string: number }) {
  if (play._tag === 'Fretted') return [];
  return (
    <Text style={[styles.mark, { left: xOf(string) - DOT / 2 }]}>
      {(play._tag === 'Muted' && 'x') || 'o'}
    </Text>
  );
}

const styles = StyleSheet.create({
  box: { width: WIDTH, height: HEIGHT },
  string: {
    position: 'absolute',
    top: MARKS,
    width: StyleSheet.hairlineWidth * 2,
    height: FRET_GAP * FRETS_DRAWN,
    backgroundColor: color.ink,
  },
  fret: {
    position: 'absolute',
    left: xOf(0),
    width: STRING_GAP * 5,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: color.ink,
  },
  nut: { height: 4 },
  first: {
    position: 'absolute',
    top: MARKS + FRET_GAP / 2 - 9,
    left: 0,
    width: LABEL - 4,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
    color: color.muted,
  },
  mark: {
    position: 'absolute',
    top: 0,
    width: DOT,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
    color: color.ink,
  },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barre: {
    position: 'absolute',
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finger: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
});
