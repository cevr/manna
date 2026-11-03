import { Match, Option } from 'effect';
import { Fragment } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAccent } from '~/color';

import { AccentButton } from './AccentButton';
import { type Button, buttonsOf, type Kind } from './button';
import { type Command, Player, type Track } from './player';
import { playerFor } from './bar';

export function Toggle({
  track,
  state,
  send,
}: {
  readonly track: Track;
  readonly state: Player;
  readonly send: (command: Command) => void;
}) {
  const accent = useAccent();
  const drawn = (button: Button) =>
    Option.match(button.command, {
      onNone: () => <ActivityIndicator color={accent} accessibilityLabel={button.label} />,
      onSome: (command) => (
        <AccentButton
          title={titleOf(button.kind)}
          label={button.label}
          onPress={() => send(command)}
        />
      ),
    });
  const buttons = buttonsOf(state, track);
  if (Player.$is('Buffering')(playerFor(state, track)))
    return (
      <View style={styles.pair}>
        {buttons.map((button) => (
          <Fragment key={button.kind}>{drawn(button)}</Fragment>
        ))}
      </View>
    );
  return buttons.map((button) => <Fragment key={button.kind}>{drawn(button)}</Fragment>);
}

const titleOf = Match.type<Kind>().pipe(
  Match.when('play', () => 'Play'),
  Match.when('pause', () => 'Pause'),
  Match.when('again', () => 'Play again'),
  Match.when('retry', () => 'Retry'),
  Match.when('loading', () => ''),
  Match.exhaustive,
);

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
