# Heartseed

Scripture memorization on One (React Native on iOS, react-native-web on the
web). Today (`app/index.tsx`) shows the passage the reader is learning and
one button, Say it, which hears the reader recite it; the word matcher
(`src/matcher.ts`) grades a recall against the verse.

Run it as a reader does with the verify skill,
`.claude/skills/verify-heartseed`. It drives through `bun run sim`
(`scripts/sim.ts`): the shared simulator driver `@manna/sim` with
Heartseed's values, `scripts/sim-app.ts` (the `verify-heartseed`
simulator, ports 8280-8289, iOS alone).

## Voice

The voice reads a verse aloud on the device and lights each word as it is
spoken; the reader can turn it off. No screen calls it yet (Say it reads no
word aloud): the hear phase will call `Voice.read`.

- `src/voice.ts` is the `Voice` service (Effect): `read`, `pause`,
  `resume`, `stop`, `setEnabled`, and the `view` a screen shows (`status`,
  the `verse`, its `words`, how many are `lit`, the `current` word range and
  how the reading `ended`), with its `changes`: a new subscriber starts at
  the current view, and one held up keeps only the last 16, so it always
  reaches the latest and never holds the history. Its rules are a pure reducer,
  `src/voice/reading.ts`: a command changes the view at its call, then makes
  its one source call, so no command waits on another's; an event changes
  the view only for the current utterance while a reading is under way, and
  a range lights the words it overlaps, never fewer than are lit. A word is
  one the matcher counts (`src/matcher/words.ts`), found by its UTF-16 span.
- The switch is kept under `heartseed/voice/enabled` in the app's settings
  store, `src/store.ts` (One's key-value store, or memory where it cannot
  open). Only the text `false` turns it off; a failed read or write is
  logged and never fails the service. `setEnabled` writes the switch while
  its stop is under way, not after it, one write at a time, each the
  switch the view holds then, so the store ends at the last call's switch
  however the stops settle.
- `src/voice/source.ios.ts` is the source on iOS: the Swift package
  `native/voice` over AVSpeechSynthesizer, which One's prebuild makes the
  local pod `OneSwiftPackages/voice`. Its voices and its events cross as the
  Codable structs `VoiceInfo` and `VoiceEvent`; the module's declaration
  (`native/voice/Voice.d.swift.ts`) is committed as One writes it, which
  neither the formatter nor the lint touches. `src/voice/source.ts` is every
  other platform's: no voices, and a speak that fails, so a reading ends
  `failed`.
- The module emits events only for the utterance it holds; one that JS
  stopped or replaced emits nothing more, so a late event cannot reach a
  reading that came after it, even across a JS reload, which restarts the
  ids at 1. It leaves the audio session alone and ends the held utterance
  on an interruption.
- On the simulator the voice makes no sound: the module never speaks there.
  It renders the utterance to buffers it drops, logs
  `[voice] speak utterance=<n> skipped=simulator`, and sends the render's
  word markers at their sample times, so the words light at the pace they
  would be heard. `src/voice/guard.test.ts` holds the Swift file to this.

## Dictation

Dictation hears the reader say a verse and lights each word as it is said,
marking a miss while they speak. Today's Say it calls it, through the app's
one runtime (`src/app.ts`, below).

- `src/dictation.ts` is the `Dictation` service (Effect): `start` (a verse
  and its cue), `finish`, `cancel`, `peek`, the `engines` report, and the
  `view` a screen shows (`status`, the `engine` it listens with, the
  `verse`, the matcher's view and how the recital `ended`), with its
  `changes` (a new subscriber starts at the current view, and one held up
  keeps only the last 16) and its `endings`, which deliver every ending to
  every reader, in order, however late it reads. Its rules are a pure
  reducer, `src/dictation/attempt.ts`: a command changes the view at its
  call, then makes its one source call, so no command waits on another's;
  an event counts only for the current session while a recital is under
  way. A recital tries the engines of `CHAIN` in order (`analyzer`, then
  `dictation`, then `recognizer`): one that answers `unavailable` (or a
  refused listen) before anything is heard falls back to the next under a
  new session id; anything else ends it. A finish waits for the source's
  end, at most `FINISH_GRACE_MS` (1.5 s) on the service's clock, then ends
  the recital itself and cancels the source.
- Each result's runs become the matcher's words by `wordsOf`
  (`src/dictation/words.ts`): a run splits at whitespace into its spoken
  words, which share its time evenly, never before the last final word or 0. A final result appends to the final words and empties the tail; any
  other is the whole tail. So every snapshot the matcher gets is one it
  accepts. A listen hints the verse's distinct word keys (`hintsOf`, at
  most 100), so the recognizer expects its archaic words.
- `src/dictation/script.ts` is the scripted word source: `recite` writes a
  recital as a recognizer reports it, and `scriptedSource` plays it on
  Effect's clock with no microphone, for tests.
- `src/dictation/source.ios.ts` is the source on iOS: the Swift package
  `native/dictation`, which One's prebuild makes the local pod
  `OneSwiftPackages/dictation`. `microphoneSource` listens; `replaySource`
  has the module play a script in its place (the simulator's source).
  `src/dictation/source.ts` is every other platform's: no engines, and
  every listen refused, so a recital ends `unavailable`. The module's
  declaration (`native/dictation/Dictation.d.swift.ts`) is committed as One
  writes it.
- On a device the module asks for the microphone, then runs the engine:
  SpeechAnalyzer with SpeechTranscriber, SpeechAnalyzer with
  DictationTranscriber, or SFSpeechRecognizer with on-device recognition
  required (it also asks for speech recognition). Recognition never leaves
  the device. An analyzer engine whose model is supported but not
  installed asks iOS to install it in the background and answers
  `unavailable` at once, so that recital falls to the next engine. While
  it listens it holds the audio session for recording and puts back what
  it found; an interruption ends the recital `interrupted`.
- The module emits events only for the session it holds; one that JS
  cancelled or replaced emits nothing more, so a late event cannot reach a
  recital that came after it, even across a JS reload.
- On the simulator the module opens nothing and asks for nothing: a listen
  logs `[dictation] listen session=<n> skipped=simulator` and fails
  `unavailable`. A replay (`[dictation] replay session=<n> steps=<count>`)
  opens nothing anywhere. `src/dictation/guard.test.ts` holds the Swift
  file to this.
- The manifest (`vite/app.ts`) declares the two prompts iOS shows before
  the first listen: speech recognition and the microphone.
- `app/probe/dictation.tsx` is a development probe for the live check
  (`.claude/skills/verify-heartseed/features/dictation.md`): it recites
  Today's passage, less its 11th word, through the module's replay and
  shows counts only. A release build renders nothing.

## Say it

Today's one button. A press recites the passage: its words hide, each word
lights as the reader says it, with one soft haptic tick, and a missed word
shows only a mark that a tap reveals (a peek). The recital finishes itself
when its last word lights, or at a press. When it ends `finished`, Today
shows the count (`<lit> of <total> words`, and `, <n> peeked` once a word
was peeked), the matcher's suggested grade, and FSRS's four grades with the
suggestion chosen; the reader can change it. Any other ending shows one
alert and the verse whole, and keeps nothing. Say it reads no word aloud.

- `src/sayit.ts` is the `SayIt` service (Effect) over `Dictation`: `press`
  (start a recital, or finish the one under way; it never replaces one),
  `peek`, `choose`, and the `view` Today shows (the latest Dictation view,
  `startedAt` and the `choice`) with its `changes`. On each of Dictation's
  `changes` it shows Dictation's view as it is then, and ticks for the
  words lit since the last view it showed of the same recital; the endings
  come from Dictation's `endings`, which loses none, the n-th ending being
  the n-th recital's. Each change of a finished recital's recall (its first
  suggestion, a changed grade, a later peek) is handed once to `Recalls`,
  keyed for the scheduler by `startedAt` on the service's own clock.
  `Haptics` is the tick.
- `src/app.ts` is the app's one runtime: one Dictation over the source
  this build hears, Say it over it, `liveHaptics` (One's soft impact) and
  `loggedRecalls` (counts and the reference logged as `sayit.recall.kept`,
  stored nowhere until the scheduler takes the seam). Every screen that
  hears the reader takes Dictation from here. The runtime is not kept
  alive: when Today leaves, its scope closes and Dictation cancels a
  recital under way. `press`, `peek` and `choose` run to their ends.
- The source: `sourceKind({ dev, simulator })` (`src/sayit/source.ts`)
  answers the module's replay of the probe's plan only when `dev`
  (`__DEV__`, nothing else) and the simulator (One's device info; a read
  that fails or takes over 2 s counts as a device) are both true, so a
  release build and a development build on a phone hear the microphone.
- `src/sayit/screen.ts` reads what Today draws from Say it's view, and
  `wordOf` how each word shows (its ink, whether it is hidden, its name);
  `app/index.tsx` draws it: one element per word, so each is its own
  accessibility element (an unsaid or half-heard word hidden from the
  screen reader, an unsaid one drawn as an empty slot its width, a mark
  named `Missed word <n>`, a peeked word `<word>, peeked`), the radio
  group `Grade`, and the button `Say it` or `Listening`. A word lights with
  a short fade and the button pulses while it listens; Reduce Motion stills
  both (Reanimated's `ReduceMotion.System`).
- `src/sayit/guard.test.ts` holds the source choice, the one Dictation, no
  word aloud and the soft tick to the sources.

## Tests

- The unit tests (`*.test.ts(x)`, not `*.slow.test.*`) run as parts, each a
  package script and a task of `turbo.json` that the commandless `test` task
  depends on, so the gate runs each as its own task and
  `bun run test:budget @manna/heartseed` times each alone (under 1 s). The
  `src` parts run with `src/test/setup.ts` as the preload (react-native-web
  for `react-native`, the bundled passage for `virtual:heartseed-passage`, a
  happy-dom document); `test:infra` runs with none.
  - `test:matcher`: `src/matcher.property.test.ts`, the matcher's generated
    recalls.
  - `test:voice`: `src/voice.property.test.ts` (the voice against its model)
    and `src/voice` (the native module's guards).
  - `test:dictation`: `src/dictation.property.test.ts` (the dictation
    service against its model) and `src/dictation` (the scripted source,
    the hints and the native module's guards).
  - `test:sayit`: `src/sayit.property.test.ts` (Say it against its model)
    and `src/sayit` (Today's Say it in happy-dom, the source Say it hears,
    and its guards).
  - `test:rest`: the other test files at the root of `src`, named file by
    file.
  - `test:infra`: `scripts` and `vite`, with `scripts/sim.test.ts`
    (Heartseed's `sim` over a stand-in Drive: its values, the web and a
    port outside 8280-8289 refused before any step, and `install` waiting
    for Today's reference).

  Run one with `bun run test:<part>` here, or all with `bun run test
  --filter=@manna/heartseed` at the repository root. A new test file at the
  root of `src` must be named in a part. `scripts/parts.test.ts` holds the
  parts to the files on disk: each unit-test file runs in exactly one part,
  no part takes a slow file, and `src` runs under the preload. A part's
  turbo inputs leave out the other parts' test files, never their sources,
  so an edit of one part's test reruns that part, plus `test:rest` and
  `test:infra`: `test:rest` holds `core-import.test.ts`, which reads every
  `src` file, and `test:infra` holds `parts.test.ts`.
