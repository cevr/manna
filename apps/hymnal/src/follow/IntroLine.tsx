import { Option } from 'effect';
import { type ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { color, useAccent } from '~/color';

import { CountIn } from './CountIn';
import { useCountLine, useIntro } from './follow';
import { type Intro as Shown, readingOf } from './intro';

export function WithIntro({
  index,
  children,
}: {
  readonly index: number;
  readonly children: ReactNode;
}) {
  const counts = useCountLine() === index;
  if (index !== 0 && !counts) return children;
  return (
    <View>
      {children}
      {when(index === 0, <Intro />)}
      {when(counts, <CountIn />)}
    </View>
  );
}

const when = (shown: boolean, node: ReactNode): ReactNode => {
  if (shown) return node;
  return <></>;
};

function Intro() {
  const { intro, running } = useIntro();
  return Option.match(intro, {
    onNone: () => <></>,
    onSome: (shown) => <Fill intro={shown} running={running} />,
  });
}

function Fill({ intro, running }: { readonly intro: Shown; readonly running: boolean }) {
  const accent = useAccent();
  const fill = useRef(new Animated.Value(intro.share)).current;
  useEffect(() => {
    fill.setValue(intro.share);
    if (!running) return () => {};
    const run = Animated.timing(fill, {
      toValue: 1,
      duration: intro.left,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
    });
    run.start();
    return () => run.stop();
  }, [fill, intro.share, intro.left, running]);
  const reading = readingOf(intro);
  return (
    <View
      accessible
      role="progressbar"
      aria-label="Introduction"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={reading.now}
      aria-valuetext={reading.text}
      testID="intro"
      style={styles.track}
    >
      <Animated.View
        style={[styles.fill, { backgroundColor: accent, transform: [{ scaleX: fill }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -5,
    height: 2,
    backgroundColor: color.line,
    overflow: 'hidden',
  },
  fill: { height: 2, width: '100%', transformOrigin: 'left' },
});
