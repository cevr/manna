import { useAtom } from '@effect/atom-react';
import { Array as Arr, Option } from 'effect';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color } from '~/color';
import { plain, useCue } from '~/feel/cue';
import { hymnAt } from '~/hymns/hymns';
import { settings } from '~/store';

import { Chip } from './Chip';
import { MOST_SCALE } from './DialView';
import { ALL, chosenOf, countOf, toggle } from './stanzas';

export const StanzaChips = memo(function StanzaChips({ number }: { readonly number: number }) {
  const count = useMemo(
    () =>
      Option.match(hymnAt(String(number)), {
        onNone: () => 0,
        onSome: (hymn) => countOf(hymn.sections),
      }),
    [number],
  );
  if (count < 2) return <></>;
  return <Chips number={number} count={count} />;
});

function Chips({ number, count }: { readonly number: number; readonly count: number }) {
  const [choice, setChoice] = useAtom(settings.stanzas(number));
  const cue = useCue();
  const chosen = chosenOf(choice, count);
  const tap = (stanza: number) => {
    cue(plain('press'));
    setChoice(toggle(choice, stanza, count));
  };
  const all = () => {
    cue(plain('press'));
    setChoice(ALL);
  };
  return (
    <View testID="stanzas" role="group" aria-label="Stanzas" style={styles.section}>
      <Text style={styles.heading} maxFontSizeMultiplier={MOST_SCALE} aria-hidden>
        Stanzas
      </Text>
      <View style={styles.chips}>
        {Arr.range(1, count).map((stanza) => (
          <Chip
            key={stanza}
            testID={`stanza-${stanza}`}
            label={`Stanza ${stanza}`}
            hint="Chooses whether Play sings this stanza"
            checked={chosen.includes(stanza)}
            onPress={() => tap(stanza)}
          >
            {String(stanza)}
          </Chip>
        ))}
        {choice.length > 0 && (
          <Chip testID="stanzas-all" label="All" hint="Sings every stanza again" onPress={all}>
            All
          </Chip>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingHorizontal: 16 },
  heading: { fontSize: 13, fontWeight: '600', color: color.muted, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
