import { Effect, Fiber, Layer, Option, Stream } from 'effect';
import { useParams } from 'one';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import passage from 'virtual:heartseed-passage';

import { Dictation, layer, type DictationView, type EngineReport } from '../../src/dictation';
import { recite, type DictationStep, type RecitePlan } from '../../src/dictation/script';
import { replaySource } from '../../src/dictation/source';

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

/** The recital the probe plays: the passage without its 11th word, finalized every 5 words, 150 ms a word. */
const PLAN = { skip: [10], every: 5, pace: 150 } as const;

/** How the probe's recital says the archaic words: as written, as a recognizer hears them, or modernized. */
type Script = 'exact' | 'hear' | 'modern';

const SAYS: Readonly<Record<Script, RecitePlan>> = {
  exact: PLAN,
  hear: { ...PLAN, say: 'hearing' },
  modern: { ...PLAN, say: 'modern' },
};

/** The link's `script`: `hear` or `modern`, anything else (or none) `exact`. */
const scriptOf = (asked: Option.Option<string>): Script =>
  Option.getOrElse(
    Option.filter(asked, (text): text is Script => text === 'hear' || text === 'modern'),
    (): Script => 'exact',
  );

const finalTexts = (steps: readonly DictationStep[]) =>
  steps.filter((step) => step.final).flatMap((step) => step.runs.map((run) => run.text));

/** The number of source words the script's recital of `verse` says otherwise than written. */
const saidOtherwise = (verse: string, script: Script) => {
  const written = finalTexts(recite(verse, PLAN));
  return finalTexts(recite(verse, SAYS[script])).filter((text, n) => text !== written[n]).length;
};

/** The time the script gave source word `index`: spoken word n runs from n·pace to n·pace + pace/2. */
const scriptTime = (index: number) => {
  const n = index - PLAN.skip.filter((skipped) => skipped < index).length;
  return { start: n * PLAN.pace, end: n * PLAN.pace + PLAN.pace / 2 };
};

/** The probe's lines: the ending, the script and the words it says otherwise, each mark status's count, the extra words, the grade, the words matched at the script's time, and each engine's status. Counts only, never a word. */
const linesOf = (view: DictationView, engines: readonly EngineReport[], script: Script) => {
  const marks = view.matcher?.marks ?? [];
  const count = (status: string) => marks.filter((mark) => mark.status === status).length;
  const timed = marks.filter((mark) => {
    const want = scriptTime(mark.index);
    return (
      mark.status === 'matched' && mark.time?.start === want.start && mark.time.end === want.end
    );
  }).length;
  return [
    `ended ${view.ended ?? 'none'}`,
    `script ${script}`,
    `said ${saidOtherwise(view.verse ?? '', script)}`,
    `matched ${count('matched')}`,
    `missed ${count('miss')}`,
    `tentative ${count('tentative')}`,
    `pending ${count('pending')}`,
    `extra ${view.matcher?.extraWordCount ?? 0}`,
    `grade ${view.matcher?.suggestedGrade ?? 'none'}`,
    `timed ${timed}`,
    ...engines.map((report) => `${report.engine} ${report.status}`),
  ];
};

/** Plays the passage through the native module's replay and hands each view and the engines' report to the screen. */
const probe = (
  plan: RecitePlan,
  show: (view: DictationView) => void,
  report: (engines: readonly EngineReport[]) => void,
) =>
  Effect.gen(function* () {
    const dictation = yield* Dictation;
    yield* Effect.forkScoped(
      Stream.runForEach(dictation.changes, (view) => Effect.sync(() => show(view))),
    );
    yield* dictation.start(passage.text);
    report(yield* dictation.engines);
    return yield* Effect.never;
  }).pipe(
    Effect.provide(layer.pipe(Layer.provide(replaySource(recite(passage.text, plan))))),
    Effect.scoped,
  );

/**
 * A development probe for the live check of dictation (verify-heartseed,
 * `dictation-script`, `dictation-hear`, `dictation-modern`): it recites
 * Today's passage through the native module's scripted replay, never the
 * microphone, its archaic words as written, as a recognizer hears them
 * (the link's `script=hear`) or modernized (`script=modern`), and shows
 * counts only. A release build renders nothing and starts nothing.
 */
export default function DictationProbe() {
  const params = useParams<{ readonly script?: string }>();
  const script = scriptOf(Option.fromNullishOr(params.script));
  const [view, setView] = useState<Option.Option<DictationView>>(Option.none());
  const [engines, setEngines] = useState<readonly EngineReport[]>([]);
  useEffect(() => {
    if (!dev) return;
    const fiber = Effect.runFork(
      probe(SAYS[script], (next) => setView(Option.some(next)), setEngines),
    );
    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [script]);
  if (!dev || Option.isNone(view)) return;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {linesOf(view.value, engines, script).map((line) => (
        <Text key={line.split(' ')[0]} style={styles.line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 80, paddingHorizontal: 24, gap: 8 },
  line: { fontSize: 17, color: '#1C1C1E' },
});
