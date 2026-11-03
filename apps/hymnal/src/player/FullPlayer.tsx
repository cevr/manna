import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import { useNavigation, useParams, useRouter } from 'one';
import { memo, use } from 'react';
import {
  type ColorValue,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { color, useAccent } from '~/color';
import { plain, useCue } from '~/feel/cue';
import { hymnHref } from '~/home/Browse';
import { hymnAt } from '~/hymns/hymns';
import { ReadingControls } from '~/reader/ReadingSheet';

import { Bar, barFor, placeOf } from './bar';
import { usePlayer } from './context';
import { DialPanel } from './DialPanel';
import { ChordReaderContext, Dials, useThumb } from './Dials';
import { useShownPage } from './page';
import { Command, type HymnPlayer, Player, type Track, trackOf } from './player';
import { Scrubber } from './Scrubber';
import { clock } from './time';
import { ThumbEvent } from './thumb';
import { TitleGo, titleGoes } from './title';
import { Toggle } from './Toggle';
import { RecordingNotice } from './RecordingNotice';
import { PlayPage } from './PlayPage';
import { PlacementDial } from './PlacementDial';
import { StanzaChips } from './StanzaChips';
import { StartSwitches } from './StartSwitches';
import { TempoDial } from './TempoDial';

export function FullPlayer() {
  return Option.match(usePlayer(), {
    onNone: () => <Nothing />,
    onSome: (player) => <Sheet player={player} />,
  });
}

const caption: (player: Player) => string = Player.$match({
  Idle: () => 'Recording',
  Loading: () => 'Loading the recording…',
  Playing: () => 'Playing',
  Buffering: () => 'Loading the recording…',
  Paused: () => 'Paused',
  Ended: () => 'Played to the end',
  Stopped: () => 'Paused',
  Failed: ({ offline }) =>
    Option.match(Option.liftPredicate(offline, Boolean), {
      onNone: () => 'The recording could not be played.',
      onSome: () => 'The recording needs a connection.',
    }),
});

const useRoute = () => {
  const { hymn, page } = useParams<{ hymn: string; page: string }>();
  return {
    hymn: Option.flatMap(Option.fromNullishOr(hymn), hymnAt),
    page: Option.flatMap(Option.fromNullishOr(page), hymnAt),
  };
};

function Sheet({ player }: { readonly player: HymnPlayer }) {
  const current = useAtomValue(player.state);
  const route = useRoute();
  const owner = Option.orElse(
    Option.filter(route.page, (page) =>
      Option.exists(trackOf(current), (held) => held.number === page.number),
    ),
    () => route.hymn,
  );
  const bar = barFor(current, owner);
  const send = useAtomSet(player.send);
  return Bar.$match(bar, {
    Hidden: () => <Nothing />,
    Shown: ({ track, state, page }) => (
      <Held
        track={track}
        state={state}
        page={Option.filter(
          Option.orElse(route.page, () => page),
          (page) => page.number !== track.number,
        )}
        send={send}
      />
    ),
  });
}

function Held({
  track,
  state,
  page,
  send,
}: {
  readonly track: Track;
  readonly state: Player;
  readonly page: Option.Option<Track>;
  readonly send: (command: Command) => void;
}) {
  const accent = useAccent();
  const cue = useCue();
  const { at, length } = Option.getOrElse(placeOf(state), () => ({
    at: 0,
    length: Option.none<number>(),
  }));
  const pressed = (command: Command) => {
    cue(plain((Command.$is('Pause')(command) && 'pause') || 'play'));
    send(command);
  };
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View role="group" aria-label="Recording" style={styles.control}>
        <Title track={track} accent={accent} />
        <Text aria-live="polite" style={styles.caption} dynamicTypeRamp="subheadline">
          {caption(state)}
        </Text>
        <RecordingNotice number={track.number} />
        <View style={styles.position}>
          <Scrubber
            key={track.number}
            at={at}
            length={length}
            onSeek={(seconds) => send(Command.Seek({ seconds }))}
          />
          <View style={styles.times}>
            <Text style={styles.time} dynamicTypeRamp="footnote">
              {clock(at)}
            </Text>
            <Text style={styles.time} dynamicTypeRamp="footnote">
              {Option.match(length, { onNone: () => '–:––', onSome: clock })}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          {Option.match(page, {
            onNone: () => <></>,
            onSome: (track) => <PlayPage track={track} send={send} />,
          })}
          <Toggle track={track} state={state} send={pressed} />
        </View>
      </View>
      <TempoDial key={`tempo-${track.number}`} number={track.number} />
      <StanzaChips number={track.number} />
      <StartSwitches />
      <ChordSection key={track.number} track={track} />
      <Reading />
    </ScrollView>
  );
}

function Title({ track, accent }: { readonly track: Track; readonly accent: ColorValue }) {
  const navigation = useNavigation();
  const router = useRouter();
  const go = () =>
    TitleGo.$match(titleGoes(navigation.getState(), track.number), {
      Close: () => router.back(),
      Open: ({ number }) => {
        router.back();
        router.push(hymnHref(number));
      },
      Replace: ({ number }) => router.replace(hymnHref(number)),
    });
  return (
    <Pressable
      role="button"
      aria-label={`${track.number}, ${track.title}`}
      accessibilityHint="Opens the hymn's page."
      onPress={go}
    >
      {({ pressed }) => (
        <Text role="heading" aria-level={1} style={[styles.head, pressed && styles.pressed]}>
          <Text style={[styles.number, { color: accent }]}>{`${track.number} `}</Text>
          <Text style={styles.title}>{track.title}</Text>
        </Text>
      )}
    </Pressable>
  );
}

function Nothing() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text role="heading" aria-level={1} style={styles.head}>
        Player
      </Text>
      <Text style={styles.caption} dynamicTypeRamp="subheadline">
        No hymn is playing.
      </Text>
      <Reading />
    </ScrollView>
  );
}

const ChordSection = memo(function ChordSection({ track }: { readonly track: Track }) {
  const thumb = useThumb(track.number);
  const ownPage = Option.exists(useShownPage(), (shown) => shown.number === track.number);
  const dials = Option.filter(thumb.printed, () => thumb.state.chords && ownPage);
  return (
    <View role="group" aria-label="Chord settings" style={[styles.section, styles.control]}>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel} dynamicTypeRamp="body" aria-hidden>
          Chords
        </Text>
        {}
        <Switch
          accessibilityLabel="Chords"
          value={thumb.state.chords}
          onValueChange={() => thumb.send(ThumbEvent.Hold())}
        />
      </View>
      {Option.match(dials, {
        onNone: () => <></>,
        onSome: (printed) => (
          <DialPanel>
            <Dials thumb={thumb} printed={printed} tuner={false} />
          </DialPanel>
        ),
      })}
      {thumb.state.chords && <PlacementDial number={track.number} />}
    </View>
  );
});

const Reading = memo(function Reading() {
  return (
    <View style={styles.section}>
      <ReadingControls reading={use(ChordReaderContext).reading} />
    </View>
  );
});

const styles = StyleSheet.create({
  page: { padding: 24, gap: 16 },
  control: { gap: 16 },
  head: { fontSize: 22, fontWeight: '700', color: color.ink },
  pressed: { opacity: 0.6 },
  number: { fontVariant: ['tabular-nums'] },
  title: { color: color.ink },
  caption: { fontSize: 15, color: color.muted },
  position: { gap: 4 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 13, color: color.muted, fontVariant: ['tabular-nums'] },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
    gap: 8,
  },
  section: { paddingTop: 8 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  switchLabel: { fontSize: 17, color: color.ink },
});
