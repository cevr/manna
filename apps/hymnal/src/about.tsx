/**
 * Settings → About: who made the sounds the recordings are played on, as
 * their licences ask (`RECORDING_CREDITS`). The Salamander piano is CC BY 3.0,
 * so its credit names the work, the author and the licence with its address;
 * a licence with an address opens it when pressed. The meaning table is
 * made from EmbeddingGemma, so it carries the notice the Gemma Terms of Use
 * ask for (`GemmaNotice`) and the Terms themselves, shown on a press
 * (`GemmaTerms`).
 */

import { RECORDING_CREDITS, type CreditLine } from '@manna/hymnal/recordings';
import { Option } from 'effect';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';

import { gemmaTerms } from '../assets/meaning/gemma-terms.js';
import { color, useAccent } from '~/color';

function Credit({ line, accent }: { readonly line: CreditLine; readonly accent: ColorValue }) {
  return (
    <Text style={styles.credit} dynamicTypeRamp="body">
      {`${line.part}: ${line.work} by ${line.author}, `}
      {Option.match(Option.fromUndefinedOr(line.licenceUrl), {
        onNone: () => line.licence,
        onSome: (url) => (
          <Text role="link" style={{ color: accent }} onPress={() => void Linking.openURL(url)}>
            {line.licence}
          </Text>
        ),
      })}
      .
    </Text>
  );
}

const GEMMA_TERMS = 'https://ai.google.dev/gemma/terms';
const GEMMA_POLICY = 'https://ai.google.dev/gemma/prohibited_use_policy';

/**
 * The notice the Gemma Terms of Use ask of a work made from a Gemma model
 * (section 3.1): that the meaning table is made from EmbeddingGemma and
 * modified, that Gemma is provided under the Terms (with their address),
 * and that its use is restricted by the Prohibited Use Policy.
 */
function GemmaNotice({ accent }: { readonly accent: ColorValue }) {
  const link = (url: string, words: string) => (
    <Text role="link" style={{ color: accent }} onPress={() => void Linking.openURL(url)}>
      {words}
    </Text>
  );
  return (
    <Text style={styles.credit} dynamicTypeRamp="body">
      {
        'Hymns about this and More like this: a word table and hymn vectors made from EmbeddingGemma by Google, a Gemma model, and modified (cut to 4 and 8 bits). Gemma is provided under and subject to the Gemma Terms of Use found at '
      }
      {link(GEMMA_TERMS, 'ai.google.dev/gemma/terms')}
      {'. Their use is subject to the restrictions of the '}
      {link(GEMMA_POLICY, 'Gemma Prohibited Use Policy')}.
    </Text>
  );
}

/**
 * The Gemma Terms of Use, word for word, the copy section 3.1 asks to be
 * given with the meaning table: a button that shows them in place, and
 * hides them again.
 */
function GemmaTerms({ accent }: { readonly accent: ColorValue }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID="gemma-terms"
        role="button"
        aria-label="Gemma Terms of Use"
        aria-expanded={open}
        onPress={() => setOpen((was) => !was)}
        hitSlop={8}
      >
        <Text style={[styles.credit, { color: accent }]} dynamicTypeRamp="body">
          Gemma Terms of Use
        </Text>
      </Pressable>
      {open && (
        <Text testID="gemma-terms-text" selectable style={styles.terms} dynamicTypeRamp="footnote">
          {gemmaTerms}
        </Text>
      )}
    </>
  );
}

export function About() {
  const accent = useAccent();
  return (
    <>
      <Text role="heading" aria-level={2} style={styles.heading} dynamicTypeRamp="footnote">
        About
      </Text>
      <View style={styles.group}>
        <Text style={styles.credit} dynamicTypeRamp="body">
          {RECORDING_CREDITS.lead}
        </Text>
        {RECORDING_CREDITS.lines.map((line) => (
          <Credit key={line.part} line={line} accent={accent} />
        ))}
        <GemmaNotice accent={accent} />
        <GemmaTerms accent={accent} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  heading: {
    marginLeft: 16,
    marginTop: 16,
    fontSize: 13,
    color: color.muted,
    textTransform: 'uppercase',
  },
  group: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 8,
  },
  credit: { fontSize: 15, color: color.ink },
  terms: { fontSize: 13, color: color.ink },
});
