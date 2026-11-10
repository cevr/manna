import { RegistryProvider, useAtomMount, useAtomSet, useAtomValue } from '@effect/atom-react';
import { Effect, Layer, Option, Stream, SubscriptionRef } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { color } from '~/color';
import { targetsOf, type SeekTarget, type SeekTargets } from '../follow/seek-targets';
import type { Timeline } from '../follow/timeline';
import type { HymnText } from '../hymns/text';
import { still } from '../hymns/chords';
import { HoldLifetime } from './LivePlayer';
import { Command, Playback, playerOn, Player } from './player';
import { soundOn } from './sound';
import { keptOf } from './stanzas';
import { HoldCommand, type HoldState } from './word-seek';

const number = 991;
const text: HymnText = {
  number,
  title: 'Fixture',
  topic: '',
  firstLine: '',
  sections: [
    { kind: 'stanza', n: 1, lines: ['alpha beta', 'alpha beta'] },
    { kind: 'stanza', n: 2, lines: ['alpha beta', 'alpha beta'] },
  ],
};
const timeline: Timeline = {
  tempo: { microsPerQuarter: 5_000_000, numerator: 4, denominator: 4 },
  first: 1000,
  end: 21_000,
  lines: [1000, 6000, 11_000, 16_000].map((start, index) => {
    let syllables = [start + 100, start + 200];
    let words = [0, 1];
    if (index === 2) syllables = [start + 100, start + 100];
    if (index === 3) {
      syllables = [];
      words = [];
    }
    return { start, until: start + 5000, syllables, words, played: true, even: false };
  }),
};

const probeOn = () => {
  const off = Effect.runSync(SubscriptionRef.make(false));
  const count = Effect.runSync(SubscriptionRef.make(0));
  const last = Effect.runSync(SubscriptionRef.make(-1));
  const choice = Atom.make<ReadonlyArray<number>>([]);
  const intro = Atom.make(false);
  const key = Atom.make(still);
  const tempo = Atom.make(100);
  const targetsFor = (hymn: number, chosen: ReadonlyArray<number>) => {
    if (hymn !== number) return Option.none();
    return targetsOf(text, timeline, chosen);
  };
  const idle = Effect.succeed({ state: 'idle' as const, positionMs: 0 });
  const inert = Playback.of({
    play: () => idle,
    pause: idle,
    resume: idle,
    seek: () => idle,
    status: idle,
    stop: Effect.void,
    connection: Stream.make(true),
    remote: Stream.empty,
    announce: () => Effect.void,
  });
  const clock = soundOn(
    Layer.succeed(Playback, inert),
    () => Option.some(timeline),
    off,
    (_number, chosen) => keptOf(text.sections, chosen),
  );
  const observed = Layer.effect(Playback)(
    Effect.gen(function* () {
      const device = yield* Playback;
      return Playback.of({
        ...device,
        seek: (to) =>
          SubscriptionRef.update(count, (n) => n + 1).pipe(
            Effect.andThen(SubscriptionRef.set(last, to)),
            Effect.andThen(device.seek(to)),
          ),
      });
    }),
  ).pipe(Layer.provide(clock));
  const player = playerOn(
    observed,
    250,
    () => key,
    () => tempo,
    () => choice,
    intro,
    targetsFor,
    Atom.make(false),
  );
  return {
    player,
    choice,
    intro,
    commits: Atom.subscriptionRef(count),
    last: Atom.subscriptionRef(last),
    targets: Atom.make((get) => targetsFor(number, get(choice))),
  };
};
type Probe = ReturnType<typeof probeOn>;

const positionOf = (state: Player): number => {
  if (Player.$is('Playing')(state) || Player.$is('Paused')(state) || Player.$is('Buffering')(state))
    return Math.round(state.at * 1000);
  return -1;
};
const selection = (state: HoldState): Option.Option<SeekTarget> => {
  if (state._tag === 'Free') return Option.none();
  return Option.some(state.target);
};

const stepLine = (
  targets: SeekTargets,
  hold: HoldState,
  direction: number,
): Option.Option<number> => {
  if (hold._tag === 'Free') return Option.none();
  const at = targets.lines.findIndex((line) => line.line === hold.target.line);
  return Option.map(Option.fromUndefinedOr(targets.lines[at + direction]), (line) => line.line);
};
const stepWord = (
  targets: SeekTargets,
  hold: HoldState,
  direction: number,
): Option.Option<number> => {
  if (hold._tag === 'Free') return Option.none();
  const line = targets.lines.find((line) => line.line === hold.target.line);
  if (!line || line._tag !== 'WordTimed') return Option.none();
  let at = -1;
  if (hold.target._tag === 'Word') at = hold.target.word;
  return Option.map(Option.fromUndefinedOr(line.words[at + direction]), (word) => word.word);
};

function ProbeBody({ probe }: { readonly probe: Probe }) {
  const { player } = probe;
  useAtomMount(player.send);
  useAtomMount(player.remote);
  useAtomMount(player.keys);
  useAtomMount(player.tempos);
  useAtomMount(player.stanzas);
  useAtomMount(player.beats);
  const state = useAtomValue(player.state);
  const hold = useAtomValue(player.hold.state);
  const targets = useAtomValue(probe.targets);
  const commits = useAtomValue(probe.commits);
  const last = useAtomValue(probe.last);
  const chosen = useAtomValue(probe.choice);
  const send = useAtomSet(player.send);
  const sendHold = useAtomSet(player.hold.send);
  const setChoice = useAtomSet(probe.choice);
  const setIntro = useAtomSet(probe.intro);
  const preview = selection(hold);
  const line = Option.map(preview, (target) => target.line);
  const word = Option.flatMap(preview, (target) => {
    if (target._tag === 'Word') return Option.some(target.word);
    return Option.none();
  });
  let origin = -1;
  if ('origin' in hold) origin = hold.origin;
  const receipt = `player=${state._tag} hold=${hold._tag} line=${Option.getOrElse(line, () => -1)} word=${Option.getOrElse(word, () => -1)} targetMs=${Option.getOrElse(
    Option.map(preview, (target) => target.ms),
    () => -1,
  )} originMs=${origin} positionMs=${positionOf(state)} commits=${commits} commitMs=${last} choice=${chosen.join(',') || '0'}`;
  const finalize = (release: boolean) => {
    if (hold._tag === 'Free') return;
    if (release) sendHold(HoldCommand.Release({ token: hold.token }));
    else sendHold(HoldCommand.Cancel({ token: hold.token }));
  };
  const lineStep = (direction: number) =>
    Option.match(targets, {
      onNone: () => {},
      onSome: (targets) => {
        if (hold._tag === 'Free') return;
        Option.match(stepLine(targets, hold, direction), {
          onNone: () => {},
          onSome: (line) =>
            sendHold(HoldCommand.Select({ token: hold.token, line, word: Option.none() })),
        });
      },
    });
  const wordStep = (direction: number) =>
    Option.match(targets, {
      onNone: () => {},
      onSome: (targets) => {
        if (hold._tag === 'Free') return;
        Option.match(stepWord(targets, hold, direction), {
          onNone: () => {},
          onSome: (word) =>
            sendHold(
              HoldCommand.Select({
                token: hold.token,
                line: hold.target.line,
                word: Option.some(word),
              }),
            ),
        });
      },
    });
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <HoldLifetime player={player} />
      <Text testID="scrub-status" accessibilityLabel={receipt} style={styles.status}>
        {receipt}
      </Text>
      <View style={styles.controls}>
        <Control
          id="scrub-play"
          label="Play fixture"
          onPress={() => {
            setIntro(false);
            send(Command.Start({ track: { number, title: 'Fixture' } }));
          }}
        />
        <Control
          id="scrub-begin"
          label="Begin"
          onPress={() =>
            Option.match(targets, {
              onNone: () => {},
              onSome: (targets) => sendHold(HoldCommand.Begin({ targets })),
            })
          }
        />
        <Control id="scrub-prev-line" label="Previous line" onPress={() => lineStep(-1)} />
        <Control id="scrub-next-line" label="Next line" onPress={() => lineStep(1)} />
        <Control id="scrub-prev-word" label="Previous word" onPress={() => wordStep(-1)} />
        <Control id="scrub-next-word" label="Next word" onPress={() => wordStep(1)} />
        <Control id="scrub-release" label="Release" onPress={() => finalize(true)} />
        <Control id="scrub-cancel" label="Cancel" onPress={() => finalize(false)} />
        <Control
          id="scrub-invalidate"
          label="Invalidate"
          onPress={() => sendHold(HoldCommand.Invalidate({ reason: 'timeline' }))}
        />
        <Control id="scrub-pause" label="Pause" onPress={() => send(Command.Pause())} />
        <Control
          id="scrub-replace"
          label="Replace"
          onPress={() => send(Command.Start({ track: { number: number + 1, title: 'Fixture' } }))}
        />
        <Control
          id="scrub-stanza"
          label="Stanzas"
          onPress={() => {
            if (chosen.length === 0) setChoice([2]);
            else setChoice([]);
          }}
        />
        <Control
          id="scrub-count-in"
          label="Count in"
          onPress={() => {
            setIntro(true);
            send(Command.Start({ track: { number, title: 'Fixture' } }));
          }}
        />
      </View>
    </ScrollView>
  );
}

function Control({
  id,
  label,
  onPress,
}: {
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.control}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

/** An isolated silent numeric fixture; its registry and settings end with this route. */
export function WordSeekProbe() {
  const [probe] = useState(probeOn);
  return (
    <RegistryProvider>
      <ProbeBody probe={probe} />
    </RegistryProvider>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16, backgroundColor: color.ground },
  status: { color: color.ink, fontSize: 16 },
  controls: { gap: 8 },
  control: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: color.soft,
    borderRadius: 12,
  },
  label: { color: color.ink, fontSize: 16 },
});
