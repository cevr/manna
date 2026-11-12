/**
 * The field as home draws it, the app's home. Fixed above the scroll view
 * sit the greeting by the hour and one card (`./card`): the Today card
 * with the day's line and its one full-width button (`Start`, or
 * `Practice anyway` when nothing is due). Nothing else is fixed, so what
 * starts the day is the first and largest thing on the screen.
 *
 * In the scroll view: the heading `Your field` with the days sown and the
 * harvest; the label `Lists` with `Add a list` while fewer than 3 passages
 * and lists are held together, else the limit line; one furrow per row
 * (`./plot`), whose title (`Open <title>`) opens the list's own page,
 * where a held list is removed; the legend under Mark 4:28; then the rows
 * `Settings`, which opens the Settings sheet (`../settings/sheet`) over
 * home, and `How Heartseed works`, which replays the welcome.
 *
 * While the root's tour shows the tips (`./tips`): `tip-1` fixed under the
 * card, `tip-2` under `Lists` while `Add a list` shows, `tip-3` under the
 * first furrow's row, and the quiet `Got it` fixed under the scroll view;
 * home has no fixed foot otherwise.
 *
 * A tap on a plant starts its verse at once, whatever its stage, and Today
 * shows it, with no card between (owner, 2026-11-12: "If you wanna go
 * back, you can easily go back from that page"); a tap on a plant nothing
 * starts (before a plan) does nothing. Whether the sheet is open is the
 * screen's own state, dropped when the reader leaves. With the passages
 * unread it offers no add. Home holds no remove.
 */

import { Option } from 'effect';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'one';

import { LIMIT_LINE } from '../chooser';
import { harvestText, sownText, type Field } from '../field';
import type { Furrow, Greeting } from '../home';
import type { TodayCard } from '../home/today';
import { themed, useThemed } from '../look';
import { heldCount, MOST_PASSAGES, type PassagesView } from '../passages';
import { useLook } from '../sayit/draw';
import { Pill } from '../first/intro';
import { SettingsSheet } from '../settings/sheet';
import { TodayCardView, type StartKind } from './card';
import { Control, Furrows, Icon, Legend } from './plot';
import { Tip } from './tips';

/** The label `Lists` and what it offers with the passages read: `Add a list`, else the limit line at 3 held. */
function Lists({
  passages,
  tips,
  onAdd,
}: {
  readonly passages: PassagesView;
  readonly tips: boolean;
  readonly onAdd: () => void;
}) {
  const styles = useThemed(sheets);
  const offers = passages._tag === 'Read' && heldCount(passages) < MOST_PASSAGES;
  const full = passages._tag === 'Read' && heldCount(passages) >= MOST_PASSAGES;
  return (
    <View style={styles.lists}>
      <Text style={styles.label}>Lists</Text>
      {offers && (
        <Control
          testID="add-list"
          label="Add a list"
          shown="Add a list"
          icon="add"
          pending={false}
          onPress={onAdd}
        />
      )}
      {offers && tips && <Tip n={2} />}
      {full && (
        <Text testID="limit" style={styles.limit}>
          {LIMIT_LINE}
        </Text>
      )}
    </View>
  );
}

/** A row at the field's end: a button the width of the field, named and showing `label`. */
function EndRow({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const look = useLook();
  const styles = useThemed(sheets);
  return (
    <Pressable
      testID="end-row"
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [styles.endRow, pressed && look.pressed]}
    >
      <Text style={styles.endText}>{label}</Text>
      <Text aria-hidden style={styles.endText}>
        ›
      </Text>
    </Pressable>
  );
}

/**
 * The field screen over `field` (its days sown and harvest), its `furrows`
 * and the reader's `passages`, greeting by `greeting`; the Today card
 * `card`, and on a plant's verse what `starts` gives it. `onToday` is
 * `Start`'s way to Today, `onStart` the way `Practice anyway` and a tap on
 * a plant start a verse, `onAdd` the way to the Add a list sheet,
 * `onAbout` the Settings sheet's way to About, `onHow` the replay of the
 * welcome (`How Heartseed works`, and the sheet's `Show the welcome
 * again`, which closes the sheet in the same turn) and `onOpen` the way to
 * a furrow's list view, by its id. While `tips`, home shows its three tips
 * and `Got it` (`onGotIt`) fixed under the scroll view.
 */
export function FieldScreen({
  field,
  furrows,
  passages,
  greeting,
  card,
  starts,
  tips,
  onToday,
  onStart,
  onAdd,
  onAbout,
  onHow,
  onGotIt,
  onOpen,
}: {
  readonly field: Field;
  readonly furrows: readonly Furrow[];
  readonly passages: PassagesView;
  readonly greeting: Greeting;
  readonly card: TodayCard;
  readonly starts: (verse: string) => Option.Option<StartKind>;
  readonly tips: boolean;
  readonly onToday: () => void;
  readonly onStart: (verse: string) => void;
  readonly onAdd: () => void;
  readonly onAbout: () => void;
  readonly onHow: () => void;
  readonly onGotIt: () => void;
  readonly onOpen: (id: string) => void;
}) {
  const look = useLook();
  const styles = useThemed(sheets);
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState(false);
  const onPlant = (reference: string) => {
    if (Option.isSome(starts(reference))) onStart(reference);
  };
  return (
    <View style={look.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <View testID="greeting" style={styles.greeting}>
          <Icon name={greeting.icon} size={28} />
          <Text style={styles.greetingText}>{greeting.words}</Text>
        </View>
        <TodayCardView card={card} pending={false} onToday={onToday} onStart={onStart} />
        {tips && <Tip n={1} />}
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          look.content,
          styles.content,
          { paddingTop: 8, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.head}>
          <Text role="heading" aria-level={1} style={look.title}>
            Your field
          </Text>
          <Text testID="sown" style={look.summary}>
            {sownText(field.sown)}
          </Text>
          <Text testID="harvest" style={look.summary}>
            {harvestText(field.harvest)}
          </Text>
        </View>
        <Lists passages={passages} tips={tips} onAdd={onAdd} />
        <Furrows
          furrows={furrows}
          onPlant={onPlant}
          onOpen={onOpen}
          underFirst={tips && <Tip n={3} />}
        />
        <Legend />
        <View style={styles.ends}>
          <EndRow label="Settings" onPress={() => setSettings(true)} />
          <EndRow label="How Heartseed works" onPress={onHow} />
        </View>
      </ScrollView>
      {tips && (
        <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>
          <Pill label="Got it" onPress={onGotIt} />
        </View>
      )}
      {settings && (
        <SettingsSheet
          onDone={() => setSettings(false)}
          onAbout={onAbout}
          onWelcome={() => {
            setSettings(false);
            onHow();
          }}
        />
      )}
    </View>
  );
}

const sheets = themed((color, face) =>
  StyleSheet.create({
    top: { paddingHorizontal: 24, paddingBottom: 8, gap: 12 },
    scroll: { flex: 1 },
    content: { gap: 16 },
    greeting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    greetingText: { fontFamily: face, fontSize: 15, fontWeight: '600', color: color.sun },
    head: { gap: 6 },
    lists: { gap: 8 },
    label: { fontFamily: face, fontSize: 13, fontWeight: '600', color: color.ink },
    limit: { fontFamily: face, fontSize: 15, lineHeight: 21, color: color.ink },
    ends: { gap: 8, marginTop: 8 },
    foot: { paddingHorizontal: 24, paddingTop: 12 },
    endRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: color.card,
    },
    endText: { fontFamily: face, fontSize: 17, fontWeight: '600', color: color.ink },
  }),
);
