import { BIBLE_BOOKS } from '@manna/core/bible';
import { Clock, Effect, Fiber, Layer, ManagedRuntime, Option, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { useParams } from 'one';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import passage from 'virtual:heartseed-passage';

import { versesOf } from '../../src/kjv';
import { lexicon } from '../../src/natural/lexicon';
import { baseFor, FILES, REVISION, TOTAL_BYTES } from '../../src/natural/manifest';
import { NaturalModule, type InstallEvent, type Rendered } from '../../src/natural/module';
import {
  linesOf,
  probeBegun,
  readBegun,
  readRendered,
  readSeen,
  soakAsked,
  soakBegun,
  soakCounted,
  soakVerse,
  type ProbeView,
  type ReadTally,
} from '../../src/natural/probe';
import { naturalModule } from '../../src/natural/source';
import { naturalVoiceSource } from '../../src/natural/voice';
import { layer as voiceLayer, Voice } from '../../src/voice';

const dev = typeof __DEV__ !== 'undefined' && __DEV__;

type Show = (change: (view: ProbeView) => ProbeView) => void;

/** The module with each render's frames, samples and ms handed to `record`, for the read's tally. */
const recording = (record: (rendered: Rendered) => void) =>
  Layer.effect(
    NaturalModule,
    Effect.gen(function* () {
      const module = yield* NaturalModule;
      return NaturalModule.of({
        ...module,
        render: (utterance, chunk, ids) =>
          module
            .render(utterance, chunk, ids)
            .pipe(Effect.tap((rendered) => Effect.sync(() => record(rendered)))),
      });
    }),
  ).pipe(Layer.provide(naturalModule));

/** The probe's runtime: the module itself, and the voice over the natural source over the recording module, with a memory store. */
const runtimeOf = (show: Show) =>
  ManagedRuntime.make(
    Layer.merge(
      naturalModule,
      voiceLayer.pipe(
        Layer.provide(
          Layer.merge(
            naturalVoiceSource(lexicon()).pipe(
              Layer.provide(
                recording((rendered) =>
                  show((view) => ({ ...view, read: readRendered(view.read, rendered) })),
                ),
              ),
            ),
            KeyValueStore.layerMemory,
          ),
        ),
      ),
    ),
  );

type Runtime = ReturnType<typeof runtimeOf>;

/** Asks the module what the phone holds and shows it. */
const refresh = (show: Show) =>
  Effect.gen(function* () {
    const module = yield* NaturalModule;
    const status = yield* module.status(REVISION, FILES);
    show((view) => ({ ...view, status }));
  });

/** Shows each download event, and what the phone holds once the download ends. */
const watchInstall = (show: Show, ended: () => void) =>
  Effect.gen(function* () {
    const module = yield* NaturalModule;
    yield* module.subscribeInstall((event) => {
      show((view) => ({ ...view, install: Option.some(event) }));
      if (event.kind === 'done' || event.kind === 'failed') ended();
    });
    yield* refresh(show);
    return yield* Effect.never;
  }).pipe(Effect.scoped);

const install = (show: Show, base: Option.Option<string>) =>
  Effect.gen(function* () {
    const module = yield* NaturalModule;
    yield* module.install(baseFor(dev, base), REVISION, FILES).pipe(
      Effect.catchTag('NaturalUnavailable', (error) =>
        Effect.sync(() => {
          const refused: InstallEvent = {
            kind: 'failed',
            bytes: 0,
            total: TOTAL_BYTES,
            reason: error.reason,
          };
          show((view) => ({ ...view, install: Option.some(refused) }));
        }),
      ),
    );
  });

const load = (show: Show) =>
  Effect.gen(function* () {
    const module = yield* NaturalModule;
    const outcome = yield* module.load(REVISION, FILES, 'af_heart.bin').pipe(
      Effect.map((millis) => ({ _tag: 'Loaded' as const, millis })),
      Effect.catchTag('NaturalUnavailable', (error) =>
        Effect.succeed({ _tag: 'Refused' as const, reason: error.reason }),
      ),
    );
    show((view) => ({ ...view, load: Option.some(outcome) }));
    yield* refresh(show);
  });

/** Reads Today's passage through the voice and tallies its views, from `Read` to the reading's end. */
const read = (show: Show) =>
  Effect.gen(function* () {
    const voice = yield* Voice;
    const began = yield* Clock.currentTimeMillis;
    show((view) => ({ ...view, read: readBegun }));
    const watch = yield* Effect.forkChild(
      voice.changes.pipe(
        Stream.mapEffect((seen) =>
          Effect.map(Clock.currentTimeMillis, (now) => ({ seen, at: now - began })),
        ),
        Stream.scan(
          (): ReadTally => readBegun,
          (tally, { seen, at }) => readSeen(tally, seen, at),
        ),
        Stream.tap((tally) =>
          Effect.sync(() =>
            show((view) => ({ ...view, read: { ...tally, renders: view.read.renders } })),
          ),
        ),
        Stream.takeUntil((tally) => tally.phase._tag === 'Ended'),
        Stream.runDrain,
      ),
      { startImmediately: true },
    );
    yield* voice.read(passage.text);
    yield* Fiber.join(watch);
    yield* refresh(show);
  });

/** The first `asked` KJV verses in canon order. */
function* versesInOrder(asked: number) {
  let given = 0;
  for (const book of BIBLE_BOOKS) {
    for (let chapter = 1; chapter <= book.chapters; chapter++) {
      for (const verse of versesOf(book.number, chapter)) {
        if (given >= asked) return;
        given++;
        yield verse;
      }
    }
  }
}

/** Renders every chunk of the first `asked` verses through the module, no play, and counts. */
const soak = (show: Show, asked: number) =>
  Effect.gen(function* () {
    const module = yield* NaturalModule;
    show((view) => ({ ...view, soak: soakBegun(asked) }));
    yield* module.load(REVISION, FILES, 'af_heart.bin').pipe(
      Effect.catchTag('NaturalUnavailable', (error) =>
        Effect.sync(() =>
          show((view) => ({
            ...view,
            load: Option.some({ _tag: 'Refused', reason: error.reason }),
          })),
        ),
      ),
    );
    const words = lexicon();
    let utterance = 0;
    for (const verse of versesInOrder(asked)) {
      utterance++;
      const outcome = yield* soakVerse(words, utterance, verse);
      show((view) => ({ ...view, soak: soakCounted(view.soak, outcome) }));
      if (utterance % 1000 === 0) yield* refresh(show);
    }
    yield* refresh(show);
  });

const remove = (show: Show) =>
  Effect.gen(function* () {
    const module = yield* NaturalModule;
    yield* module.remove.pipe(
      Effect.catchTag('NaturalUnavailable', (error) =>
        Effect.logWarning('natural.probe.remove').pipe(
          Effect.annotateLogs({ reason: error.reason }),
        ),
      ),
    );
    show((view) => ({ ...view, load: Option.none() }));
    yield* refresh(show);
  });

const BUTTONS = ['Install', 'Cancel', 'Load', 'Read', 'Stop', 'Remove', 'Soak'] as const;

type Button = (typeof BUTTONS)[number];

/**
 * A development probe for the live check of the natural voice
 * (verify-heartseed, `features/natural.md`): it installs the pinned model
 * files from the link's `base` (D7's `baseFor`), loads them, reads Today's
 * passage through the voice over the natural source, and soaks the KJV
 * verse by verse (`soak`, a count). It shows counts only, never a word. A
 * release build renders nothing and starts nothing.
 */
export default function NaturalProbe() {
  const params = useParams<{ readonly base?: string; readonly soak?: string }>();
  const asked = soakAsked(Option.fromNullishOr(params.soak));
  const base = Option.fromNullishOr(params.base);
  const [view, setView] = useState<ProbeView>(() => probeBegun(asked));
  const [runtime, setRuntime] = useState<Option.Option<Runtime>>(Option.none());
  const [busy, setBusy] = useState<Option.Option<Fiber.Fiber<void>>>(Option.none());
  useEffect(() => {
    if (!dev) return;
    const made = runtimeOf(setView);
    setRuntime(Option.some(made));
    const ended = () => {
      made.runFork(refresh(setView));
    };
    made.runFork(watchInstall(setView, ended));
    return () => {
      Effect.runFork(made.disposeEffect);
    };
  }, []);
  if (!dev) return;

  const tap = (button: Button) =>
    Option.match(runtime, {
      onNone: () => {},
      onSome: (made) => {
        switch (button) {
          case 'Install':
            made.runFork(install(setView, base));
            return;
          case 'Cancel':
            made.runFork(NaturalModule.use((module) => module.cancelInstall));
            return;
          case 'Load':
            made.runFork(load(setView));
            return;
          case 'Read':
            setBusy(Option.some(made.runFork(read(setView))));
            return;
          case 'Stop':
            Option.match(busy, {
              onNone: () => {},
              onSome: (fiber) => {
                made.runFork(Fiber.interrupt(fiber));
              },
            });
            made.runFork(Voice.use((voice) => voice.stop));
            return;
          case 'Remove':
            made.runFork(remove(setView));
            return;
          case 'Soak':
            setBusy(Option.some(made.runFork(soak(setView, asked))));
            return;
        }
      },
    });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.buttons}>
        {BUTTONS.map((button) => (
          <Pressable
            key={button}
            accessibilityRole="button"
            accessibilityLabel={button}
            onPress={() => tap(button)}
            style={styles.button}
          >
            <Text style={styles.label}>{button}</Text>
          </Pressable>
        ))}
      </View>
      {linesOf(view).map((line) => (
        <Text key={line.split(' ')[0]} style={styles.line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 80, paddingHorizontal: 24, gap: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#E5E5EA',
  },
  label: { fontSize: 17, color: '#1C1C1E' },
  line: { fontSize: 17, color: '#1C1C1E' },
});
