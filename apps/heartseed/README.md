# Heartseed

Scripture memorization on One (React Native on iOS, react-native-web on the
web). A fresh install opens the first minute (`src/first`, below): hear
the passage, say it with first letters, say it alone, and its first seed is
planted. Today (`app/index.tsx`) shows the passage the reader is learning,
its stage in the garden, and one big button, Say it, which hears the reader
recite it; the word matcher (`src/matcher.ts`) grades a recall against the
verse, and the garden (`src/garden.ts`) keeps it and grows the verse's
plant. Beside Today's heading, `Your field` opens the field (`src/field.ts`, below): a
row per passage, a plant per verse, the days sown and the harvest.

Run it as a reader does with the verify skill,
`.claude/skills/verify-heartseed`. It drives through `bun run sim`
(`scripts/sim.ts`): the shared simulator driver `@manna/sim` with
Heartseed's values, `scripts/sim-app.ts` (the `verify-heartseed`
simulator, ports 8280-8289, iOS alone).

## Voice

The voice reads a verse aloud on the device and lights each word as it is
spoken; the reader can turn it off. The first minute's hear phase is the
one screen that calls it (`Voice.read` at `Listen`, `Voice.stop` at a
`Next` during a reading), through the app's runtime (`src/app.ts`: the
atoms `voiceView`, `listen` and `hush`); Say it reads no word aloud.

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
  store, `src/store.ts` (One's key-value store; no memory store stands in
  where it cannot open, below). Only the text `false` turns it off; a
  failed read or write is logged and never fails the service: a failed
  read is on, and after a failed write the view keeps the reader's switch
  for the session, so the next write once the store opens lands. `setEnabled` writes the switch while
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

Today's one button, and the first minute's in letters and alone. A press
recites the passage under the ladder's cue (Garden, below): each word not
yet said shows that cue (whole, its first letter, or nothing), each
word lights as the reader says it, with one soft haptic tick, and a missed word
shows only a mark that a tap reveals (a peek). The recital finishes itself
when its last word lights, or at a press. When it ends `finished`, Today
shows the count (`<lit> of <total> words`, and `, <n> peeked` once a word
was peeked), the matcher's suggested grade (Hard at most under any cue but
nothing), and FSRS's four grades with the suggestion chosen; the reader can
change it. Any other ending shows one alert and the verse only as its cue,
and keeps nothing. Say it reads no word aloud.

- `src/sayit.ts` is the `SayIt` service (Effect) over `Dictation`:
  `recite({ cue, keep })` (start a recital under the matcher's cue, kept
  or not, or finish the one under way; it never replaces one), `press`
  (`recite(TODAY)`: no cue, kept, Today's recital in an unread garden),
  `peek`, `choose`, and the `view` Today shows (the latest Dictation view,
  `startedAt`, the `choice` and the recital's `cue`) with its `changes`. On each of Dictation's
  `changes` it shows Dictation's view as it is then, and ticks for the
  words lit since the last view it showed of the same recital; the endings
  come from Dictation's `endings`, which loses none, the n-th ending being
  the n-th recital's. Each change of a kept recital's finished recall (its
  first suggestion, a changed grade, a later peek) is handed once to
  `Recalls`, keyed for the scheduler by `startedAt` on the service's own
  clock, with `offset`: the device zone's offset at that `startedAt`
  (`offsetAt`, `src/day.ts`), read once at the press from the same clock
  reading and kept through every rewrite of the recital, whatever zone the
  device is in by then. A recital that is not kept carries that to its end
  and hands nothing over. `Haptics` is the tick.
- `src/app.ts` is the app's one runtime: one Dictation over the source
  this build hears, Say it over it, `liveHaptics` (One's soft impact), the
  garden (below), which takes Say it's recalls over the app's store and
  sounds the growth chime, and the voice over `voiceSource`, its switch in
  the same store (`appLayer`'s parts: `source`, `haptics`, `store`,
  `chime`, `voice`). Every screen that hears the reader takes Dictation
  from here. The runtime is not kept alive: when the root leaves, its
  scope closes, Dictation cancels a recital under way and the voice stops
  a reading under way. `press`, `sayAs`, `peek` and `choose` run to their
  ends. `press` (`pressToday`) reads the garden's `settled` view, behind
  every keep handed to it before the press, so a grade changed to Again
  just before is said under the letters it gives back, and recites under
  `cueIn` of that view (`todayCue`: no cue when the garden is unread).
- The source: `sourceKind({ dev, simulator })` (`src/sayit/source.ts`)
  answers the module's replay of the probe's plan only when `dev`
  (`__DEV__`, nothing else) and the simulator (One's device info; a read
  that fails or takes over 2 s counts as a device) are both true, so a
  release build and a development build on a phone hear the microphone.
- `src/sayit/screen.ts` reads what Today draws from Say it's view, and
  `wordOf` how each word shows (its ink, whether it is hidden, its name);
  `src/sayit/draw.tsx` holds the drawing Today and the first minute share
  (the word, a word in letters `Initial`, a word not yet said under its cue
  `Unsaid`, the large round button, its pulse, the plant mark, the
  palette), and `app/index.tsx` draws Today with it: the verse whole
  (`passage`) only under the full text with no recital shown, else one
  element per word (`word-<i>`), so each is its own accessibility element
  (a word not yet said under its cue: whole in the cue's ink under the full
  text, its first letter or number alone in the same ink and named by it
  under letters, the rest laid out unseen and hidden, the cue's ink being
  the palette's mute darkened to AA contrast on the ground, as the first
  minute's letters are too; under no cue an empty slot its width,
  hidden from the screen reader; a half-heard word hidden, a mark
  named `Missed word <n>`, a peeked word `<word>, peeked`), the radio
  group `Grade`, and the button `Say it` or `Listening`. A word lights with
  a short fade and the button pulses while it listens; Reduce Motion stills
  both (Reanimated's `ReduceMotion.System`).
- `src/sayit/guard.test.ts` holds the source choice, the one Dictation, no
  word aloud (outside the first minute, the one reader of the voice's
  atoms) and the soft tick to the sources.

## First minute

One promise, the passage, in three phases, then its seed; no sign-up and
no setting. The root route (`app/index.tsx`) decides once per launch, at
the garden's read, what it shows in place (no navigation, no other route):

- While the read runs (a held store, its retries), a pending frame with the
  reference alone: no heading, no button, no stage and no plant.
- A read garden holding no recall of any verse (an empty disk, or only
  records the garden skips) opens the first minute. A read garden holding
  any verse's recall opens Today, and so does an `Unread` one: a garden
  that could not be read cannot know there is no seed.
- Planting the seed does not swap the screen: Planted shows until
  `Continue`, which opens Today at `Stage: seed`.

The phases (`src/first/screen.tsx`, with the phase bar, the large round
button and the Georgia verse of the prototype):

1. `Hear it`: the verse whole, one element per word. `Listen`, shown only
   while the voice is on and not reading, reads it (`Voice.read`); nothing
   speaks without a tap. While it reads, the words spoken are in ink and
   the voice's current range is `aria-selected`. A reading that ends
   `finished` goes on by itself; any other ending leaves the words whole
   and offers `Listen` again. `Next` stops the voice (`Voice.stop`, which
   does nothing when no reading is under way, so a reading started a moment
   before the screen drew it stops too) and goes on; a `Listen` tapped after
   it reads nothing.
   With the voice's stored switch off there is no `Listen`; the first
   minute never writes the switch.
2. `Say it with help`: each word's first letter or number alone, the rest
   laid out unseen and hidden from the screen reader. `Say it` recites with
   the matcher's cue `initials` and keeps nothing (`recite({ cue:
   'initials', keep: false })`); a finished recital, any words missed, goes
   on, and one not heard shows Say it's alert and stays.
3. `Say it alone`: no word shows before it is said; `Say it` recites with
   no cue and keeps its recall with the suggested grade. Planted shows once
   the garden's read holds the passage's plant, never at the recital's end,
   so a refused write shows the count and `Say it` again.
4. `Planted`: `Stage: seed`, the seed drawn large and `Continue`. Planting
   never sounds.

The flow's rules are a pure reducer, `src/first/flow.ts`: `openingOf` the
garden's view decides the opening and `shownOpening` holds it for the
launch; `step` moves each phase on only at its own input (Next, the
voice's ending, a recital of the phase's own, the garden's plant), and no
phase moves back. A recital is the phase's own when Say it's `startedAt`
differs from the one the phase began with. Nothing of the flow is stored
but the alone recital's recall, so a relaunch mid-flow starts again at
`Hear it`, and the runtime's close stops a reading under way.

## Garden

Every verse the reader has said is a plant: seed, then blade, then ear,
then full corn (Mark 4:28). Today shows the passage's stage under its
words (named `Stage: <stage>` for the screen reader), with a small plant
beside it drawn as the prototype draws it, and, while a finished recital is
on the screen, how that recital grew it (`Grew to an ear.`). Cues fade
across days by stage, the ladder (`cueAt`, `cueIn`): a passage not yet
planted shows and is said under the full text, a seed under its first
letters, a blade, an ear and full corn under nothing; Again makes a seed,
so the letters come back. In an unread garden Today shows the verse whole
and it is said with nothing, claiming no stage. Until the
garden's read of the store completes, and for the whole session when it
failed, Today claims nothing: no stage, no plant, no growth, so a planted
verse never reads as not planted. A growth plays one soft sound, which
Silent mode mutes. Nothing leaves the device.

- `src/store.ts` is the app's store: One's key-value store named
  `heartseed` (the SQLite file `one-kv-heartseed.sqlite` on a phone, local
  storage on the web) under Effect's `KeyValueStore`. It holds the settings
  and the garden's recalls. It opens at its first call and keeps the handle
  for the layer's life; a call made while it is not open tries the open
  first, so an open that throws fails that one call (`KeyValueStoreError`,
  logged `store.failed` with the method and key) and the next call tries
  again. Each launch opens anew, and the handle a layer opened is closed
  when its scope closes (op-sqlite gives each open its own connection, so
  the close is that layer's alone). A failure is a failure: nothing stands in
  for the device, no memory store, no cached keys, no write reported done
  that One's store refused. `src/store.test.ts` holds it to this over the
  test `one` module's device (`src/test/one.tsx`), and bans the memory,
  storage and file-system stores from the app's sources.
- `src/fsrs.ts` is FSRS-6, the scheduler Selah uses: its default weights,
  90% retention, learning steps of 1 and 10 minutes, a relearning step of
  10 minutes, short-term stability, no fuzz, intervals up to 36,500 days.
  `review(card, grade, at)` is pure and equals ts-fsrs 5.4.2's basic
  scheduler on every field (a devDependency the tests alone import).
  Elapsed days are UTC calendar days, and a review's time is its recital's
  `startedAt` (the stored `offset` plays no part; only days sown reads it).
- `src/garden.ts` is the `Garden` service (`view` and its `changes`) and
  the `Recalls` Say it hands its recalls to. Each recall is one record of
  the store under `heartseed/recall/<reference>/<startedAt>`, whose value is
  the recall's nine fields as JSON (`reference`, `startedAt`, `offset`,
  `grade`, `suggested`, `words`, `missed`, `peeked`, `extra`) and nothing
  else. `offset` is the device zone's offset at `startedAt` in whole minutes
  east of UTC, ISO's sign (New York `-300` in winter, `-240` in summer,
  Kolkata `330`, Kathmandu `345`), an integer within ±1080. A record kept
  before hslocal has no `offset` and reads as a recall all the same; it is
  never rewritten or migrated. A record whose `offset` holds anything else
  (a string, a fraction, `null`, a boolean, beyond ±1080) is no recall and
  is skipped whole. A later keep of the same recital writes the same key,
  start and offset, so the last one wins. A key's day stamp never changes
  once stored: a keep to a key that already holds a recall (a new recital
  whose start reuses an earlier one's after the clock went back, maybe in
  another zone) keeps that recall's `offset`, or its lack of one for an old
  record, and only a key written for the first time takes the press's
  offset. A read garden knows the stored recall from its view; an unread
  one reads that one key first. When that read fails, the keep writes as a
  first write, with the press's offset (`garden.keep.unstamped`): a
  finished recital is never lost, and the one cost is that a key already
  stored under another stamp (a start reused after the clock went back,
  with that read failing while writes work) can move its day.
  The garden writes no other key and removes none. Nothing else is stored: a
  plant's card is the fold of its recalls in `startedAt` order from a new
  card, and its stage is read from its recalls and their cards each time.
- The read: the garden's view is `Read` (every planted verse's plant, maybe
  none) or `Unread`, never anything between. At start an attempt lists the
  store's keys once and reads every key under `heartseed/recall/`; any call
  that throws (the open, the listing or one record's read) fails the
  attempt whole, and no partial view is published. It tries three times in
  all (`READ_ATTEMPTS`, 10 ms and then 20 ms apart, each failure logged
  `garden.read.retry`); past that the garden is `Unread` for the session
  (`garden.read.failed`) and lists the store no more until the next launch;
  a keep then reads only its own key, for the stamp it holds.
  A value that is no valid recall of its own key, or a listed key with no
  value, is skipped and logged (`garden.record.skipped`), and the read stays
  complete.
- The stage rule (`stageOf`), applied after each recall in `startedAt`
  order: full corn once the card's stability is at least 21 days; else a
  seed at the first recall or one graded Again; else a blade when the
  recall was helped, by a peek or by the cue the stage before it gives
  (first letters at a seed); else an ear (recalled with nothing, a miss
  with no peek included). The help is derived from the recalls, never
  stored, so a history said with nothing at a seed reads as a blade.
  `growthOf(plant, startedAt)` is the recital's growth: the stage over the
  recalls before it and over those up to it, some only when there were
  recalls before and the stage rose.
- A keep runs alone, in call order (one lock over the whole keep), and
  `settled` reads the view behind that lock. A keep
  equal to its known record does nothing; a failed write logs
  `garden.keep.failed` and changes nothing. Once the write lands, the view
  changes, and a recital that grew its verse logs `garden.grew` and sounds
  `Chime.grow` once in the launch, at its first keep that grows it:
  planting never sounds. An `Unread` garden still writes each keep, but its
  view stays unread and it never sounds, since the history a growth is
  measured from is unknown; the next launch reads what it wrote.
- The sound (`src/garden/sound.ts`) is made in code: two soft sine tones a
  fifth apart, 0.7 s, a 16-bit mono WAV named by the hash of its bytes.
  `src/garden/chime.ios.ts` hands it once, in the background, to the Swift
  package `native/growth` (One's prebuild makes it the local pod
  `OneSwiftPackages/growth`), which writes it under Caches and makes it a
  system sound; a growth plays it by its id, fire and forget, and one
  before the load lands plays nothing. System Sound Services are muted by
  the ring/silent switch and leave the audio session alone, so Silent mode
  is respected and Dictation's session is never touched. On the simulator
  the module plays nothing and logs `[growth] play sound=grow
  skipped=simulator`; each load logs `[growth] load sound=grow`.
  `src/garden/chime.ts` is every other platform's: silent, logged
  `garden.chime`. `src/garden/guard.test.ts` holds the Swift file to this,
  and the module's declaration (`native/growth/Growth.d.swift.ts`) is
  committed as One writes it.
- `gardenView` (`src/app.ts`) is the runtime's atom over `Garden.changes`;
  Today (`app/index.tsx`) reads the passage's plant from it.

## Field

The field is the reader's progress: every passage is a row and every verse
a plant, at the stage the garden derives. Today offers it as the button
`Your field` once the garden's read completes, and never while Say it
listens (leaving Today then would leave the microphone open off-screen).
It sits in Today's header beside the heading, outside the scroll view, so
however much a recital adds (the recap, the grades, the growth line, an
alert) it is on screen without a scroll and clear of the home indicator;
the field's button `Today` comes back to Today as it was. Both are in place
in the root route (`app/index.tsx`): no route, no link, no tab. Whether the
field shows is the root's state for the launch, never stored, so every
launch opens on the pending frame, then the first minute or Today. Until a
read completes, and for a session whose read failed, there is no field and
no control: an unread garden cannot know the days sown, and an unread
session's recitals are written all the same, so the next launch counts
them.

- `src/field.ts` is the rule, pure: `fieldOf(garden, passages)` over a
  `Read` view and the passages taught (today one, Today's passage of one
  verse; `hspassage` gives passages their verses). The passages come first,
  each verse a plant at `stageOf` its plant, or `not planted` before its
  first recall (drawn as bare soil); then each other verse the garden
  holds, alone, in the order first sown: by its earliest recall's
  `startedAt`, then by its reference in code units. References match
  exactly (`Isaiah 41:1`, `Isaiah 41:100` and `Isaiah 41:10 ` are three
  other verses).
- Days sown (`1 day sown`, `<n> days sown`) is the number of distinct days
  (`dayOf`, `src/day.ts`) among every recall the read holds, of any verse.
  A record with an `offset` counts for the reader's local day by that
  stored offset, starting at 04:00 (Anki's rollover, the day hsdaily's
  session uses): `floor((startedAt + offset × 60 000 − 4 h) / 86 400 000)`,
  so 03:59:59.999 is the day before and 04:00 the day itself, and daylight
  saving, a part-hour zone and the zone the device is in now change
  nothing (owner, 2026-11-05: "local day"). A record kept before hslocal
  keeps the UTC date base counted it on (`floor(startedAt / 86 400 000)`),
  so the upgrade cannot lower the count. Each day is a function of its
  record alone; the garden writes recalls and never removes one, and a
  grade change, Again or a peek rewrites the same recital with the same
  start and offset, and a new recital that reuses a stored start keeps that
  key's stamp, so the count never falls under travel or any clock: it
  is no streak. The one exception is an unread keep whose read of a reused
  key's stamp fails while its write lands: the recital is kept with its
  press's offset rather than lost, and that key's day may move. The costs: a recital between 00:00 and 04:00 counts for the
  day before; an old evening record keeps its UTC date, so on the
  upgrade's day it and a new next-morning recital can share a day; and
  where the runtime keeps the zone it launched in after the reader changes
  zone (Hermes may, until a relaunch), a record's day is that old zone's.
- The harvest (`1 verse at full corn`, `<n> verses at full corn`) is the
  number of verses whose stage is full corn now (stability of 21 days or
  more), derived, never stored: Again on a verse at full corn takes it out.
- Nothing is stored for the field: no key, no value, no setting; it never
  reads the store and never writes. Every number derives from the garden's
  view each time the field shows.
- `src/field/screen.tsx` draws a `Field`: the way back, the heading, the
  counts, one card per row titled by its passage (plain text, never a
  heading, so a reference spelled `Your field` or `Today` adds none), each
  plant `PlantMark` (`src/sayit/draw.tsx`, Today's drawing, with bare soil
  for a verse not planted) over its verse number, one image to the screen
  reader labelled `<reference>, <stage>`, and a legend of the four stages,
  hidden from the screen reader, over the caption `Mark 4:28`. No other
  number shows, and nothing moves. Every text is Palette A's ink (the
  counts in Today's summary style), never the muted grey, so each reads at
  WCAG AA's 4.5:1 on the ground and on a card.

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
    and `src/sayit` but its cue tests (Today's Say it in happy-dom through
    `src/test/today-rig.tsx`, the source Say it hears, and its guards).
  - `test:cue`: `src/sayit/cue.test.tsx` and `src/sayit/cue-say.test.tsx`,
    Today's cue in happy-dom through the same rig: the passage at rest under
    each stage's cue, a recital under letters and under the full text, a
    recital not heard, an unread garden, every pending frame of a held
    launch at each stage, each cue word's exact first letter and its AA
    contrast, and no run of the verse outside its words.
  - `test:garden`: `src/store.test.ts` (the store over the device),
    `src/fsrs.property.test.ts` (FSRS-6 against ts-fsrs),
    `src/garden.property.test.ts` (the stage and growth rules, and the
    garden against its model over the real store on the device across
    launches, failed opens, listings, reads and writes, old records with no
    `offset` beside new ones, and each bad `offset` skipped whole),
    `src/ladder.property.test.ts` (stage, cue and growth after every recall
    of generated histories), `src/press.test.ts` (the cue Today's press
    recites under, a keep in flight, a refused write, an unread garden, and
    generated presses in zones every side of UTC: each record's nine fields
    and its press's offset, kept through a refused write, a grade change and
    Again after the device changed zone; a press that reuses a stored
    start after the clock went back, in a read or an unread garden, keeping
    that key's stamp, old or new, or, when an unread keep's read of that
    stamp fails, still writing it with the press's offset), and
    in `src/garden` the growth sound and the native module's guard.
  - `test:today`: `src/garden/today.test.tsx`, Today's stage in happy-dom
    over the real store on the device (the journey from not planted to a
    blade and an ear and back to a seed across a restart, reached with another verse's
    recall on the disk so Today opens, each stage's look in the
    prototype's colours, and no claim in any frame of a held launch or an
    unread session).
  - `test:first`: `src/first/flow.test.ts` and `src/first/screen.test.tsx`,
    the flow's reducer against its model
    (`src/test/first-model.ts`) and the first minute in happy-dom over the
    real store on the device (the journey to one seed and Today, the voice
    off, a Next during a reading and a relaunch mid-flow, an unread launch,
    a held launch, and each letter in the cue's ink at AA contrast on its
    ground at rest and while its recital listens, while the hear phase's
    unread words, the phase line and the reference keep the mute; and every
    element of every phase at rest, of the hear phase reading and of the
    letters listening keeps base's look, the letters' ink alone left out).
  - `test:root`: `src/first/root.test.tsx`, the root route on fixed devices
    through `src/test/first-rig.tsx` (the rig: stand-ins for the device's
    store, the voice's source and the recognizer, a model of the first
    minute, and its frame and settle oracles): the whole first minute, a
    recital with every word missed, each unheard ending, refused and down
    writes, Next during a reading, two queued Listen taps, an unread launch
    that writes, and a relaunch mid-recital. Every frame and settle is
    checked: the heading, what a sighted reader and the screen reader get
    of each word, the hear phase's ink and selection, claims and setting
    words, the speaks and stops, and the whole disk with its write count
    and each kept record's nine fields, its `offset` the test zone's at its
    `startedAt`.
  - `test:walk-letters`, `test:walk-alone`, `test:walk-write`,
    `test:walk-launch`, `test:walk-disk`, `test:walk-relaunch`,
    `test:walk-planted`, `test:walk-reading` and `test:walk-taps`: each
    `src/first/walk-<group>.property.test.tsx`, the same rig over a few
    generated devices from one seed. The generator draws every input the
    rule names (any disk, switch and launch read, held or not; a speak that
    lands or is refused and every kind of voice event; recitals that hear
    any subset of the words, end every way Dictation ends, or are held open;
    writes that land, are refused or meet a down device that recovers;
    queued taps; a relaunch anywhere), steered toward the part's own group
    of coverage floors, which its generated devices alone must meet.
  - `test:field`: `src/field.property.test.ts`, the field's rule over
    generated read gardens, each read in several device zones, against the
    rule written plainly (`src/test/field-model.ts`: references of any
    non-empty string, canonical twins beside each other, counts with no
    ceiling, a failing garden shrunk; a day by the record's own wall clock
    through `src/test/day-model.ts`, never `src/day.ts`): old and new
    records, offsets of zones every side of UTC and the bounds ±1080, the
    04:00 edge to the millisecond, UTC midnight for old records, daylight
    saving north, south and by half an hour, a clock set back, and bad
    offsets; and `src/field/sown.test.ts`, days sown as a model test over the
    garden on the device across keeps, Again, peeks, refused writes then
    landed, relaunches, unread sessions, zone changes while open and
    between launches, and new recitals at the start of a stored record, old
    or new, from another zone, with each keep's read of its key's stamp
    failing or not apart from its write, the device holding the model's
    record after every keep, never falling but in the one excused history
    (a stored key whose stamp read failed while its write landed); and
    `src/field/unread.test.tsx`, no field offered in any frame of a held
    launch, an unread session or the first minute; and
    `src/field/reach.test.tsx`, the control outside Today's scroll view
    before and after a recital that grows the passage, and one view of Say
    it deciding both the control and the field: with the root's news of
    Say it held back, a tap in the first frame that offers the control
    after a growing recital opens the field.
  - `test:field-unread`: `src/field/unread-keep.test.tsx`, an unread
    session whose listing and then its keep's read of its key fail, or
    whose every record read fails, while writes work: its finished recital
    is written with its zone's offset and the next healthy launch counts
    its day.
  - `test:field-screen`: `src/field/screen.test.tsx`, the field from Today
    in happy-dom over the real store on the device through
    `src/test/field-rig.tsx` (the rig holds every frame to the field's
    rules: the control only on a read, quiet Today, never inside a scroll
    view; each field frame the
    rule's rows, plants, drawings, days sown and harvest as seen and
    exposed, every text at AA contrast; each open and way back leaving the
    whole disk and taking no write, remove or clear): the way there and
    back through recitals, Again and a relaunch; and
    `src/field/garden.test.tsx`, a generated garden past 140 other verses
    of any reference, canonical twins each its own plant, each label the
    exact reference and each verse number the text after its last colon.
  - `test:field-walk` and `test:field-grades`: `src/field/walk.test.tsx`
    and `src/field/walk-grades.test.tsx`, generated sequences of opens,
    ways back, recitals, Again, peeks and relaunches through
    `src/test/field-walk.ts`, each command's writes modelled apart from the
    app; each file's seeds reach its own floors (relaunches, or Again).
  - `test:session`: `src/session.property.test.ts`, the daily plan
    (`planOf`) and Today's counts line (`countsOf`) against the rules
    written plainly in `src/test/session-model.ts` (ts-fsrs's due dates,
    days by their own arithmetic, zones by `Intl`), over generated gardens,
    pieces, zones, instants, absences and lengths, each case's coverage
    held to floors.
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
  `src` file, and `test:infra` holds `parts.test.ts`. The walk parts share
  one set of inputs, so an edit of one walk file reruns every walk part.
