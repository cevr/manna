# Heartseed

Scripture memorization on One (React Native on iOS, react-native-web on the
web). A fresh install opens the first minute (`src/first`, below): hear
the passage, say it with first letters, say it alone, and its first seed is
planted. Today (`app/index.tsx`) shows the passage the reader is learning,
its stage in the garden, and one big button, Say it, which hears the reader
recite it; the word matcher (`src/matcher.ts`) grades a recall against the
verse, and the garden (`src/garden.ts`) keeps it and grows the verse's
plant. Beside Today's heading, `Your field` opens the field (`src/field.ts`, below): a
row per passage, a plant per verse, the days sown and the harvest. Under
them, the session's `Minutes` and `Voice` choices sit, and atop the passage
a counts line says what the day's plan holds (`src/session.ts`, below).

Run it as a reader does with the verify skill,
`.claude/skills/verify-heartseed`. It drives through `bun run sim`
(`scripts/sim.ts`): the shared simulator driver `@manna/sim` with
Heartseed's values, `scripts/sim-app.ts` (the `verify-heartseed`
simulator, ports 8280-8289, iOS alone).

## Voice

The voice reads a verse aloud on the device and lights each word as it is
spoken; the reader chooses Off, Her or Him. Her and Him both read with the
system's best voice until the natural voice routes them. Two screens call it, through the app's
runtime (`src/app.ts`), and Say it reads no word aloud:

- the first minute's hear phase (`Voice.read` at `Listen`, `Voice.stop` at
  a `Next` during a reading: the atoms `voiceView`, `listen` and `hush`);
- Today, on the plan's new piece: while `Voice` is not Off, no
  reading is under way and the action button reads `Say it`, a `Listen`
  button sits in the fixed footer before it (`listenTo`, which reads the
  shown piece's own text once, and `readingAloud(voiceView)`). While the
  voice reads, `Listen` is gone; it comes back at the reading's end
  (finished, failed or interrupted) and after an unheard, cancelled or
  refused recital. A press of `Say it` stops the voice before the
  recognizer listens. A review, `Next`, the done state and an unread
  garden never show `Listen`; a making of the plan (a Minutes tap, a
  return, an add or a remove of a passage) does not stop a reading, and a
  tap of `Voice` onto Off does; a tap from Her to Him lets it go on. Listening is
  offered, not required, and writes nothing.

- `src/voice.ts` is the `Voice` service (Effect): `read`, `pause`,
  `resume`, `stop`, `choose`, and the `view` a screen shows (`choice`,
  `enabled` (not Off), `status`,
  the `verse`, its `words`, how many are `lit`, the `current` word range and
  how the reading `ended`), with its `changes`: a new subscriber starts at
  the current view, and one held up keeps only the last 16, so it always
  reaches the latest and never holds the history. Its rules are a pure reducer,
  `src/voice/reading.ts`: a command changes the view at its call, then makes
  its one source call, so no command waits on another's; an event changes
  the view only for the current utterance while a reading is under way, and
  a range lights the words it overlaps, never fewer than are lit. A word is
  one the matcher counts (`src/matcher/words.ts`), found by its UTF-16 span.
- The choice is one list, `CHOICES` (`off`, `her`, `him`), and
  `nextChoice` steps it, wrapping. It is kept under `heartseed/voice/choice`
  in the app's settings store, `src/store.ts` (One's key-value store; no
  memory store stands in where it cannot open, below), as the text `off`,
  `her` or `him`. A launch reads that key when its text is exactly one of
  the three; otherwise (missing, any other text, a failed read) it reads
  the old switch, `heartseed/voice/enabled`, whose text exactly `false` is
  Off and anything else Her, so a reader who turned the voice off stays
  Off. A launch writes nothing, and the old key is never written, removed
  or cleared, so a rollback build still reads it. A failed read or write
  is logged (`voice.store.failed`) and never fails the service; after a
  failed write the view keeps the reader's choice for the session, so the
  next write once the store opens lands. `choose` writes the new key while
  its stop is under way, not after it, one write at a time, each the
  choice the view holds then, so the store ends at the last call's choice
  however the stops settle. Choosing Off stops a reading under way, ending
  it `off`; choosing Her or Him changes the view only.
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

Today's action button while the verse shown is not done (Session, below),
and the first minute's in letters and alone. A recital carries its piece,
its reference and its text: the matcher's words, the marks, the summary,
and the recall's `reference` and `words` are that piece's. A press on
Today recites the verse the run shows under the ladder's cue (Garden,
below): each word not
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
  `recite({ cue, keep }, piece)` (start a recital of `piece` under the
  matcher's cue, kept or not, or finish the one under way; it never
  replaces one, and a piece with no words starts nothing), `press`
  (`recite(TODAY, passage)`: no cue, kept, the layer's passage),
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
  sounds the growth chime, and the voice over `voiceSource`, its choice in
  the same store (`appLayer`'s parts: `source`, `haptics`, `store`,
  `chime`, `voice`, and `pieces`, the verses the app holds text for, each
  `{ reference, text, words, group }` in the app's order; the runtime
  passes the passage alone, and the session plans over these, then the
  reader's passages: Session, below). Every screen that hears the reader takes
  Dictation from here. The runtime is not kept alive: when the root leaves,
  its scope closes, Dictation cancels a recital under way and the voice
  stops a reading under way. `press`, `next`, `sayAs`, `peek` and `choose`
  run to their ends. `press({ piece, item })` (`pressToday(piece, item)`)
  reads the garden's `settled` view, behind every keep handed to it before
  the press, so a grade changed to Again just before is said under the
  letters it gives back, holds `item` in the session (Session, below), and
  recites `piece` under `cueIn` of that view for its reference (no cue when
  the garden is unread). `sayAs(how)` recites the passage, as the first
  minute does.
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
  group `Grade`, and the action button `Say it`, `Listening` or `Next`
  (Session, below). A word lights with
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
   With the voice's stored choice Off there is no `Listen`; the first
   minute never writes the choice.
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
the field's button `Today` (shown `‹ Today`), in the bar fixed above the
field's scroll view, comes back to Today as it was. The field, the
chooser (Choosing a passage, below) and About (below) are in place in the
root route (`app/index.tsx`): no route, no link, no tab. Which of Today,
the field, the chooser and About shows is the root's state for the launch, never stored, so
every launch opens on the pending frame, then the first minute or Today,
and whenever Say it listens the screen is Today. Until a
read completes, and for a session whose read failed, there is no field and
no control: an unread garden cannot know the days sown, and an unread
session's recitals are written all the same, so the next launch counts
them.

- `src/field.ts` is the rule, pure: `fieldOf(garden, passages)` over a
  `Read` view and the passages taught: the promise's, a passage of one
  verse, then each the reader holds, in the order chosen, carrying its
  range (the root maps them, `app/index.tsx`; with the reader's passages
  unread, the promise's alone). The field shows once both the garden's and
  the passages' views are known. The passages come first,
  each verse a plant at `stageOf` its plant, or `not planted` before its
  first recall (drawn as bare soil); a verse is one plant wherever it
  shows; then each other verse the garden
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
- Nothing is stored for the field itself: no key, no value, no setting;
  it reads only the garden's and the passages' views, and writes only
  through a landed remove (Choosing a passage, below). Every number
  derives from the garden's view each time the field shows.
- `src/field/screen.tsx` draws a `Field`: the bar (the way back, then
  `Add a passage`, the limit line or the ask), the heading, the
  counts, one card per row titled by its passage (plain text, never a
  heading, so a reference spelled `Your field` or `Today` adds none), each
  plant `PlantMark` (`src/sayit/draw.tsx`, Today's drawing, with bare soil
  for a verse not planted) over its verse number, one image to the screen
  reader labelled `<reference>, <stage>`, and a legend of the four stages,
  hidden from the screen reader, over the caption `Mark 4:28`. No other
  number shows, and nothing moves. Every text is Palette A's ink (the
  counts in Today's summary style), never the muted grey, so each reads at
  WCAG AA's 4.5:1 on the ground and on a card. Under the scroll view a
  fixed foot holds one control, `About`, in the field's outlined pill
  style, at least 44 pt tall and clear of the home indicator; like every
  field control it is disabled while a remove is pending.

## About

`About` on the field opens the About screen (`src/about/screen.tsx`,
`AboutScreen({ onField })`): a bar fixed above a scroll view holding the
way back, `Your field` (shown `‹ Your field`), which returns to the field;
in the scroll view the one heading `About`, the natural voice's credits
(`CREDITS`, one paragraph, `about-credits`) and the Apache License 2.0
whole (`about-licence`), which the bundle owes for the natural voice's
vendored code. Every text is Palette A's ink, at WCAG AA on the ground.
It reads and writes nothing in the store.

- The licence is `native/natural/kokoro/LICENSE` byte for byte, never
  trimmed or reflowed, served as the virtual module
  `virtual:heartseed-licence` (its default export the text):
  `vite/licence.ts`'s `readLicence()` reads the file and, run as a script,
  prints it as JSON, and `vite/plugin.ts` serves it as it does the other
  bundle-time modules. `src/virtual.d.ts` declares it and
  `src/test/setup.ts` stands it in from `readLicence()`; no file under
  `src` or `app` holds a copy of the text.

## Passages

The reader may learn passages of the KJV beside the app's own promise.
The free tier holds 3 passages of up to 20 verses each. These are the data
and the session's seams; Choosing a passage, below, is how the reader adds
and removes one.

- **The corpus** is the whole KJV in the bundle, as the virtual module
  `virtual:heartseed-kjv`: an array of the canon's 1,189 chapters in canon
  order, each one string of its verses in order joined by a newline, each
  verse as `displayText` shows it, the display rule applied once, when
  the app is bundled. `vite/kjv.ts` derives it from `@manna/core`'s KJV
  through `vite/passage.ts`'s `readVerses` (`readChapters`; `chaptersOf`
  is the pure derivation) and fails the build with `CorpusMismatch` when the
  chapters are not the canon's in order, when a chapter's verses skip or
  repeat a number, or when a verse's shown text holds a newline.
  `vite/plugin.ts`'s one `passage()` plugin serves both virtual modules
  (`export default <json>;`), each derived once per process. Measured at
  4,175,613 B as JSON and 4,158,904 B as `hermesc -O` bytecode, under the
  4.3 MB the unit allows.
- **The lazy read.** `src/kjv.ts` is the one product module that imports
  the corpus, and no product module names `kjv.json` (`src/passages/guard.test.ts`;
  `docs/lessons.md`, `heartseed-corpus-through-one-module`). Importing it
  splits no chapter: `versesOf(book, chapter)` splits the one asked for,
  and answers `[]` for a chapter the canon does not have (book 0 or 67,
  chapter 0 or past the book, a fraction), so Today's first frame never
  waits on the corpus.
- **A passage** (`src/passages.ts`) is a `Range` `{ book, chapter, first,
  last }` of whole numbers in one chapter, `1 ≤ first ≤ last ≤` the
  chapter's verse count (`inChapter`). A reader may add one of at most 20
  verses (`choosable`); a whole chapter of 20 verses or fewer counts. Its
  reference is the canon's: `John 15:1-5`, or its one verse's
  (`passageReference`, `verseReference`).
- **The stored list** is the key `heartseed/passages`, a JSON array of
  ranges in the order chosen. It is read once, as the `Passages` service
  starts: one `get`, tried 3 times in all (10 ms, then 20 ms apart, as the
  garden's read). No key reads as no passages; a list of ranges in their
  chapters reads whole, of any length and any number (the caps are an
  add's, so a later tier lifts them without a migration); anything else,
  or three failed reads, is `Unread`, which claims no list and is never
  written over. Faults are logged as `passages.read.retry`,
  `passages.read.failed` and `passages.write.failed`, with the key, the
  method or reason and a count, never a verse.
- **An add** answers, in this order: `Unread`, `Invalid` (not choosable),
  `Full` (3 or more held), else `Added` once the list with the range at
  its end is written, or `Failed` when the write is refused (the view
  stays). **A remove** takes out the first passage equal to the range in
  all four fields: `Unread`, `Absent`, else `Removed` once written, or
  `Failed`. Each runs in call order, one at a time (a semaphore), so two
  at once never pass the cap or take one passage twice; a duplicate or an
  overlap may be added. `changes` streams each view. A remove never
  touches a recall: a removed passage's plants stay in the garden, its
  verses leave the pieces, and the field shows them as any plant no piece
  names.
- **The pieces** (`piecesOf(own, view)`) are the app's own (`appLayer`'s
  `pieces`, the promise by default), then each passage's verses in
  passage and verse order, each with its corpus text, its words counted
  as the matcher counts them and its passage's reference as its group.
  Each reference is kept once, at its first place, so a passage over
  Isaiah 41:10 shares the promise's plant. With the passages unread, the
  app's own alone.
- **An add or a remove is a making.** `addPassage(range)` and
  `removePassage(range)` in `src/app.ts` answer the service's answer, and
  after `Added` or `Removed` alone run `Session.remake`: a plan made in
  this launch is made again at that instant over the passages now, with
  the hold kept only while a recital is under way. Before the first plan,
  in an unread garden or with the passages unread it makes nothing.

## Choosing a passage

The reader adds and removes passages from the field, and chooses one on
the chooser, the root's third screen, in place like the field. Nothing a
reader must reach sits where a scroll can hide it: the field's bar, the
chooser's header and its footer are fixed outside the scroll views.

- **The field's bar** holds `‹ Today` (named `Today`), then, with the
  passages read, `Add a passage` while fewer than 3 are held, else the
  limit line "3 passages, the most for now. Remove one to add another."
  (testID `limit`), which a stored list of 4 or more shows too, so the bar
  never offers an add the service would refuse. With the passages unread
  it offers neither and no row offers `Remove`: the app never writes over
  what it could not read.
- **The rows** are the promise's, then each passage held, in the order
  chosen, titled by its reference, then every other plant as a passage of
  one verse (Field, above). Each passage row, and no other, holds
  `Remove <its reference>`, which finds its passage by the row's range,
  never by its place. The promise is not the reader's choice and has none.
- **Remove asks once**, in the bar in place of `Add a passage` or the limit
  line: "Remove <reference>? Its plants stay in your field." (testID
  `ask`), with `Remove` and `Keep`. `Keep` closes it. `Remove` runs
  `removePassage` (`uprootPassage`, `src/app.ts`); the service takes out
  the first equal passage, so with equal rows either row's `Remove` takes
  one. On `Removed` the row leaves and its plants stay, a planted verse
  then a row of its own; on any other answer the row stays and the bar
  says "<reference> was not removed. Try again." (`role="alert"`). Another
  row's `Remove` moves the ask; leaving the field drops the ask and the
  alert, and the next tap of a field control clears the alert.
- **The chooser** (`src/chooser/screen.tsx`) opens at the books, with no
  range. Its fixed header holds one way back and the step's one heading:
  `‹ Your field` over `Add a passage` (the plain labels `Old Testament`
  and `New Testament`, then the 66 books in canon order, from
  `@manna/core/bible`'s `BIBLE_BOOKS`), `‹ Books` over the book (one
  button per chapter, named `<Book> <c>`), and `‹ Chapters` over
  `<Book> <chapter>`: every verse of the chapter (`versesOf`), never a
  virtualized list, each a checkbox named by its reference, checked while
  inside the range. A back to the chapters or the books clears the range.
  The step and the range are one value, under one reducer.
- **The range rule** is `tapVerse(chosen, verse, count)` (`src/chooser.ts`),
  pure and total: a tap outside `1..count` or on a fraction changes
  nothing; with no range, or a range of more than one verse, a tap gives
  that verse alone; with one verse chosen, a tap on it clears the range, a
  tap after it gives the range to that verse and a tap before it the range
  from that verse, each clipped to 20 verses counted from the verse first
  chosen. Every range it gives is choosable.
- **The footer**, fixed under the verses, holds the range's reference
  (testID `chosen-reference`) and count (`chosen-count`: `1 verse`,
  `<n> verses`), the cap `Up to 20 verses` always, `Plant` while a range is
  chosen, and the plant's line. `Plant` runs `addPassage`
  (`plantPassage`): on `Added` the field shows with the new row last among
  the passages; on `Full` the footer shows the limit line, and on any other
  answer "<reference> was not planted. Try again." (`role="alert"`). The
  range stays either way, so a retry is one tap, and the next tap on the
  chooser clears the line.
- **One change at a time.** From a tap of `Plant`, or of the ask's
  `Remove`, until its answer, a tap of `Plant`, the ask's `Remove` or
  `Keep`, `Add a passage`, a row's `Remove`, a verse or a back changes
  nothing, and each shows as disabled. A ref, set in the tap's own turn,
  holds it, so two taps in one turn make one change: a double tap never
  stores a passage twice or removes two.
- **Today after a change.** A landed add or remove is a making (Passages,
  above), so back on Today the run shows the new plan: its reference, the
  counts line and `Listen` on a new verse. On a day a verse was first
  planted (the first minute's day among them) no new verse shows; after the
  next 04:00 local, the first verse no plant names is new.
- Nothing else is stored: opening, stepping, tapping verses, backing out,
  `Keep` and unread passages write nothing, and there is no route or key
  of the chooser's own.

## Session

The daily session is the plan of what to tend today: the due reviews, then
one new piece, within the minutes the reader chose. Today holds its two
choices in a second row of its fixed header, under `Today` and
`Your field`, outside the scroll view: the radio group `Minutes` (`2 min`,
`5 min`, `10 min`, `20 min`) and the button `Voice` (the voice's choice,
`heartseed/voice/choice`). A tap of `Voice` cycles Off → Her → Him → Off
(`cycleVoice`, `src/app.ts`: `Voice.choose(nextChoice(choice))`, the view
changing at the call, so two quick taps cycle twice); it shows
`Voice: Off`, `Voice: Her` or `Voice: Him`, its label stays `Voice` and its
accessibility value is the word, so VoiceOver reads "Voice, Her, button".
The row wraps, each pill is 44 pt tall, and the chosen minutes and a
`Voice` not Off take the grade pills' style.
They show once their reads complete, in a read garden and an unread one,
and stay shown and working while Say it listens; the pending frame and the
first minute show neither. At the top of the scroll view, above the
reference, the counts line (`testID="session"`) says what the plan holds.

Today runs the plan one verse at a time. In a read garden with a plan it
shows one item: the held one if any, else the plan's first item not done.
It shows the item's reference (`testID="reference"`), its words under its
cue (the full text for the new piece, `cueIn` for a review), its stage
line, and the action button. A press of `Say it` recites that item's own
piece and holds the item. Once the item is done (its plant holds a recall
more than at the plan's making, read from the garden, never from the
recital's end, so a refused write never moves on), the result and the
`Grade` group stay, a grade can still change, and the button reads `Next`;
a recital that is unheard, cancelled or refused leaves `Say it` on the
same item. `Next` drops the hold. With no item left (every item done and
none held, or a plan with no items) Today shows the done state: the
scroll view holds the counts line alone, `Nothing to tend now`, with no
reference, verse, stage, grade, summary or button. A making of the plan
with no recital under way drops the hold, and an earlier result with it;
a making while a recital listens or finishes keeps the hold, so the verse
recited stays shown until its `Next`, even when the new plan leaves it
out. While nothing is held Today shows no recital's marks, summary,
result, grades or alert. The hold survives the field and back; nothing of
the run is stored, so a relaunch makes a new plan with nothing held. With
no plan (an unread garden) Today shows the first piece whole with a
working `Say it`, and never `Next`, a done state or a hold.

A return to the foreground makes the plan again, so a reader who leaves
the app open overnight finds the morning's verses. A return is React
Native's `AppState` turning `active` after a `background` since the last
`active`; the launch's `currentState` is the first state seen. `inactive`
alone (the notification center, Control Center, a system prompt such as
the microphone's, a call banner) is no return, nor is a second `active`;
`inactive → background → inactive → active` is one. At a return with a
plan made in this launch, a read garden and no recital under way, the plan
is made at that instant with the minutes chosen now, the hold is dropped
(a shown result, its grades and `Next` go), and the run starts at the new
plan's first item not done. A return while a recital listens or finishes,
in the pending frame, in the first minute or in an unread garden changes
nothing: no plan is made, the hold and the screen stay, and nothing is
written. The next return, Minutes tap or relaunch makes the plan.

The action button and the `Grade` group lie in a fixed footer under the
scroll view, so however long the verse or the result, they are on screen
without a scroll; the only controls in the scroll view are a missed word's
marks. The alert stays in the scroll.

- `src/session.ts` is the rule, pure: `planOf` over a `Read` view, the
  pieces the app holds text for (`appLayer`'s `pieces`, by default
  Today's passage alone, then the reader's passages' verses: Passages,
  above; each its reference, its word count and its group; `TextPiece`
  adds its text), the instant, the zone's offset at it
  and the minutes. `isDone` reads an item's done from the garden.
  - A plant is due at FSRS's due. While it holds one recall that carries
    an offset and started from 18:00 to 03:59:59.999 by that offset's local
    clock, it is due no earlier than the 04:00 that ends that recall's day
    (`dayOf`, `src/day.ts`): plant at night, recall in the morning, and
    travel moves no due instant. A record kept before recalls carried an
    offset keeps FSRS's due.
  - The new piece is the first piece, in the app's order, with no plant.
    None is offered when any plant was first recalled today, or when every
    piece is planted. A plant no piece names is never offered, and a
    reference in two pieces counts once, as the first.
  - A recital is estimated at 10 s and half a second a word; the budget is
    the minutes. The new piece's estimate is reserved first, then the due
    reviews are taken, earliest due first (ties by reference in code
    units), while each fits what is left, stopping at the first that does
    not; the first is always taken. So the plan never outgrows the budget
    except by its one review, and after any absence the rest wait for later
    plans, the oldest first: never a pile.
  - The reviews are mixed: each next is the earliest due of another group
    than the last placed, else the earliest due. The new piece comes last.
  - Nothing is rescheduled, written or stored.
- `countsOf(plan, garden)` is the counts line, of the items not done: an
  item is done once its plant holds more recalls than when the plan was
  made (the new piece, once it is planted), derived from the garden, never
  stored. It reads `<n> to tend`, `1 new` and `about <k> min` (the
  estimates' sum rounded up to whole minutes) joined by `·`, or
  `Nothing to tend now`. It names no backlog and no word for late.
- `src/session/service.ts` is the `Session` service in the app's layer. It
  reads the minutes once per launch from `heartseed/session/minutes`, the
  text `2`, `5`, `10` or `20` by a schema of the four literals; a missing
  key, any other text or a failed read means 5, and nothing is written at
  launch. A tap on a radio shows the choice at once and writes it; a failed
  write keeps the choice for the launch, and the next launch reads what is
  stored. The plan is made from the runtime's `Clock` and `offsetAt` at
  that instant when Today first shows in a launch with the garden read
  (after `Continue` in the first launch), again at each Minutes tap, at
  each return to the foreground (`wake`, a no-op with no plan, an
  unread garden or a recital under way, read in the same step as the
  making), and after each `Added` or `Removed` passage (`remake`, a no-op
  with no plan, an unread garden or unread passages, keeping the hold while a recital is
  under way).
  It is made in one step from the garden's view, Dictation's and the
  passages' as they are, never waiting on a keep under way, so a recital
  whose keep lands after it counts as done, over the pieces of that step
  (`piecesOf`). Nothing else makes it again: time passing, a recital, a
  grade, Again, a Voice tap, `Listen`, an add or a remove answered
  otherwise, or the field and back. An unread garden or unread passages
  have no plan and no counts line. The service also holds the run's one
  piece of state, the item held (`hold`, `next`), over the pieces of the
  launch's start, then of each making (its view's `pieces` and `held`). It needs `Dictation`: a making reads whether a
  recital is under way in the same synchronous step as the making, and
  keeps the hold only then.
- `src/foreground.ts` is the return rule, pure (`lifeStep` from `UNSEEN`,
  and `returnsOf` over a stream of states), the `Foreground` service (its
  `states`: the state at subscription first, then each change) and
  `wakeLayer`, which runs `Session.wake` at each return for the runtime's
  life (`Effect.forkScoped`). `src/foreground/source.ts` is its live
  source, the one module that names `AppState`: it reads `currentState`
  and adds the `change` listener in one step, and removes the listener
  when the runtime's scope closes (on react-native-web, where
  `addEventListener` may return nothing, it removes nothing). `appLayer`
  builds it by default; its `foreground` part lets a rig stand in at the
  service.
- `src/session/run.ts` is `shownOf(view, garden)`, what Today shows of the
  run, pure: `Unplanned` (no plan: the first piece), the `Item` with its
  piece, whether it is held and whether it is done, or `Done`. A held item
  shows with the piece it was held with (the view's `heldPiece`, kept
  beside the hold and dropped with it), never `Done`, even when a making
  took its verse out of the pieces: a remove of its passage while its
  recital is under way keeps the verse, its marks, `Listening` and then
  its result on Today until `Next`. The plan made then holds none of the
  removed verses, so after `Next` Today never offers one. The view's
  `pieces` and `held` keep their meaning.

## Natural voice

The natural voice reads a piece with Kokoro-82M instead of the system
voice, and lights each word as it is read. It holds its pronunciation
list, the rule from a piece's text to what the model is given, the native
module that downloads, renders and plays, and a `VoiceSource` over it; no
screen a reader sees calls it yet. The reader's choice of Off, Her or Him
is the `Voice` cycle hsspeaker built (`cycleVoice`, Voice and Session
above); hsnatural routes Her and Him to this voice.

- `data/kjv-phonemes.json` maps every distinct word key of the KJV (13,756)
  to its phonemes in Kokoro's symbols: Misaki 0.9.4's English G2P for the
  key alone (with its espeak-ng fallback), or the key's entry in
  `data/kjv-phonemes.overrides.json`, which replaces Misaki's guess (empty
  today; the owner's listening fills it, at most 200 entries, each a KJV
  key that differs from Misaki's). It holds words and phonemes only, no
  verse text. Heteronyms (read, lead, wind) take Misaki's default sense,
  and names its guess.
- `data/kokoro-vocab.json` is Kokoro's symbol vocabulary, byte for byte the
  `vocab.json` of Hugging Face `FluidInference/kokoro-82m-coreml` at
  revision `2568276a60ff6e7f312afce3dc9e3f07521cb48d`.
- `data/lexicon.py` writes the list. Regenerate it from the repository
  root with `uv run --no-project --python 3.12 apps/heartseed/data/lexicon.py`
  after editing the overrides; its inline metadata pins Misaki, spaCy,
  `en_core_web_sm` and espeak-ng's loader, and only then are uv and the
  network needed. It writes the keys sorted, one entry a line, so two runs
  write the same bytes; `src/natural/data.test.ts` holds the list's hash,
  which a regeneration updates. The tests never run Python. espeak-ng runs
  only on the dev machine and nothing of it ships.
- `src/natural/plan.ts` is the rule, pure. `planOf(words, vocab, text)`
  plans a piece's displayed text, as `src/voice/reading.ts` speaks it. A
  word is a whitespace run that holds a letter or a number; its key is the
  run without its leading and trailing characters that are neither, looked
  up as written. A word speaks the `,.:;?!()` of its edges around its
  phonemes, other edge characters silent, and words join with one space,
  counted in code points. A clause ends at a word whose spoken trail holds
  one of `,.:;?!`; a clause of at most `CHUNK_CAP` (200) symbols stays in
  one chunk, and a longer one may break between any of its words. Clauses
  pack greedily into chunks of at most 200 symbols with their joining
  spaces. Each chunk's ids are BOS 0, the spoken symbols' ids, EOS 0, and
  each word's mark is the index of its first phoneme, after its spoken
  lead, with the whole run's location and length in UTF-16 units, as the
  system voice's word marks give them. An unknown key, a symbol outside the
  vocab, a word over 200 symbols alone or a text with no word plans none.
  `startsOf(chunk, durations)` gives each word's start in the chunk's audio
  from the model's frames per id: `SAMPLES_PER_FRAME` (600) times the
  frames of the ids before its mark; durations that are not one whole,
  positive count per id give none.
- `src/natural/lexicon.ts` carries the list and the vocab into the bundle:
  `lexicon()` builds the two maps once, from `virtual:heartseed-lexicon`,
  which `vite/plugin.ts` serves as `vite/lexicon.ts` prints it. Nothing in
  `src/app.ts`'s graph reaches it yet.
- `native/natural` is the Swift package (module `Natural`, the local pod
  `OneSwiftPackages/natural`), for iOS 18 and later like the app. Its
  `kokoro` folder vendors FluidAudio's seven-stage Core ML chain for
  Kokoro (six files at commit `ee78635d23d52379117554ba72358b65a0612447`,
  with FluidAudio's LICENSE byte for byte); each file's header names its
  upstream path and what changed for Heartseed (the `#if TTS` wrapper,
  and the constants trimmed to the English chain), and `kokoro/README.md`
  lists them. It is vendored, not a dependency, since One's prebuild takes
  no SwiftPM dependency. `ModelStore.swift` loads the seven compiled stages
  from one folder; `Natural.swift` is the module, whose declaration
  (`Natural.d.swift.ts`) is committed as One writes it.
- **The download.** `src/natural/manifest.ts` pins the 39 files of the
  download (`FILES`, in path order): 38 of Hugging Face
  `FluidInference/kokoro-82m-coreml`, folder `ANE/`, at revision
  `2568276a60ff6e7f312afce3dc9e3f07521cb48d`, and `am_michael.bin`
  (`AM_MICHAEL`, converted from the same revision's rows, The mirror,
  below); 83,332,513 bytes, each with its SHA-256, and the mirror
  `https://models.heartseed.app/kokoro/2568276a60ff/`.
  `install` keeps them in `Application Support/Heartseed/natural/<revision>`,
  a folder marked out of backups before its first byte, one file at a time
  in the manifest's order: a file is fetched into `natural/.partial`,
  hashed with CryptoKit and moved into place only when its hash matches; a
  mismatch is fetched again at most twice, then fails `check`. It asks for
  the missing bytes plus 50 MB free (`space`), waits for a network in Low
  Data Mode (`waiting`), fails `network` on any status but 200 or a lost
  connection, and fails `cancelled` at `cancelInstall`; a second `install`
  fetches only what is missing, so a 38-file install fetches only
  `am_michael.bin`. `baseFor(dev, asked)` gives the base: a release build
  always the mirror, a development build a plain
  `http(s)://host[:port]/folder/` it is asked for.
- **The voices.** `VOICES` (`manifest.ts`) is `af_heart` and `am_michael`;
  a voice's pack is the file `<voice>.bin` of `FILES`. No other file of
  `src/natural` names a pack path, and the Swift module outside `kokoro/`
  names no voice: the voice is data.
- **Loading.** `load(revision, files, voice)` takes the voice as a pack
  path of `files`, or throws `voice`. The first load of a revision in a
  process hashes every file again and loads the seven stages; a later one
  keeps the stages and reads only the voice's pack (from disk, or a cache
  by path), hashing nothing. Loads apply in call order, so the last one
  called leaves its voice current; a voice change halts a held reading,
  and a memory warning drops the packs with the stages. It logs
  `[natural] load ms=<n> units=<u> voice=<path> stages=<loaded|kept>`.
- **Routing.** On the simulator every stage runs on the CPU. On a device,
  iOS 27 and later run the noise and tail stages on the CPU and the rest on
  the Neural Engine; earlier ones run the noise and tail on the GPU.
- **Rendering and playing.** `render(utterance, chunk, ids)` runs the chain
  on a chunk's ids, one render at a time off the main actor, and returns
  each id's frames and the sample count; JS checks `samples = 600 × Σframes`
  and gives `play` each word's start sample (`startsOf`). On a device,
  `play` schedules the chunks gapless on one `AVAudioEngine` player at
  24 kHz and sends `start`, a `range` at each word's start sample and
  `finish`; on the simulator it plays nothing, logs
  `[natural] play … skipped=simulator`, and sends the same events by a wall
  clock. Events go only to the held reading, matched by generation, so a JS
  reload's reused ids cannot collide; an interruption or an engine
  configuration change (a route change) ends it as `interrupt`. The module
  never sets the audio session. A render of chunk 0 writes the marker
  `natural/reading`, removed when the reading ends; a marker found at
  start says `crashed` once.
- `src/natural/module.ts` is the module's seam (`NaturalModule`, a
  `Context.Service`); `src/natural/source.ios.ts` is it over the Swift
  module, the only importer of `Natural.swift`, and `src/natural/source.ts`
  is every other platform's, which holds nothing and refuses each call.
- `src/natural/voice.ts`, `naturalVoiceSource(lexicon)`, is a `VoiceSource`
  over the module, so `src/voice.ts` reads with it unchanged: a speak stops
  the module, fails `VoiceUnavailable` for a voice not in `VOICES`, else
  plans the text, loads the speak's voice (`<voice>.bin`), then renders and
  plays chunk by chunk
  (the next chunk renders while one plays). Chunk 0's failure fails the
  speak; a later chunk's stops the module and sends `interrupt`. A speak
  let go (stopped, replaced or ended) returns at once.
- **The probe.** `app/probe/natural.tsx` (`heartseed://probe/natural?base=…&voice=…&soak=…`)
  is a development probe that renders and starts nothing in a release
  build. It reads in the link's `voice`, one of `VOICES` (else
  `af_heart`), and shows it as `voice <name>`. `Install`, `Cancel`, `Load`, `Read` (Today's passage through the
  voice over the natural source), `Stop`, `Remove` and `Soak` (each verse
  rendered in canon order, no play) show counts only, never a word
  (`src/natural/probe.ts`). `.claude/skills/verify-heartseed/features/natural.md`
  drives it.
- **The model server.** `bun run natural:serve -- --port <p> --cache <dir>
  [--host 127.0.0.1|0.0.0.0] [--corrupt <path>]` (`scripts/natural-serve.ts`)
  fills the cache from Hugging Face at the pinned revision, checking each
  file and converting `am_michael.bin` from its rows (`fillPinned`), and
  serves `GET` and `HEAD` of the 39 paths, so the simulator and a
  development phone install with no mirror; `--corrupt` flips the middle
  byte of one file as served. It never ships.
- Credits: Misaki (hexgrad/misaki, Apache-2.0) made the list; Kokoro's
  vocabulary is hexgrad/Kokoro-82M's (Apache-2.0), as FluidInference
  publishes it. The model is Kokoro-82M (hexgrad, Apache-2.0), in the Core
  ML conversion of laishere/kokoro-coreml (Apache-2.0, per its LICENSE),
  run by code from FluidAudio (Apache-2.0).

## The mirror

The mirror serves the natural voice's model files at
`https://models.heartseed.app/kokoro/2568276a60ff/<path>` (`MIRROR` in
`src/natural/manifest.ts`). It is an R2 bucket, `heartseed-models`, filled
by a copy job from Hugging Face. Nothing in the app imports `infra/`.

### The stack

`alchemy.run.ts` declares one resource, the bucket (`infra/bucket.ts`):

- The bucket `heartseed-models` is served publicly at the custom domain
  `models.heartseed.app` (`new URL(MIRROR).host`); the heartseed.app zone
  is on Cloudflare. The `r2.dev` host stays off.
- It has no CORS (only the native app reads it), no lifecycle rules and no
  locks.
- The bucket is adopted when it exists and retained on destroy, with no
  `forceDestroy`, so a deploy never deletes the files.
- Only the stage `prod` exists; the stack refuses any other stage, since a
  second one would take the same bucket and domain.

State lives in the Cloudflare state store. No CI workflow deploys this
stack.

### The files and their keys

- The mirror's list is `MIRROR_FILES` (`infra/models/plan.ts`): the
  download, `FILES`, in path order, 39 files and 83,332,513 bytes. Each is stored under `kokoro/2568276a60ff/<path>`
  (`keyOf`), so `MIRROR + path` is the file's URL. A new revision is a new
  folder.
- `am_michael.bin` is the second voice, `am_michael`. FluidInference ships
  only `ANE/af_heart.bin`, so the copy converts `voices/am_michael.json` of
  the same repository and revision (`infra/models/voice-pack.ts`,
  `voicePackOf`): its keys `"1"` to `"510"` in numeric order, each a row of
  256 numbers, each written as a little-endian fp32, every other key
  ignored; 522,240 bytes, pinned by SHA-256 in `AM_MICHAEL`. Any JSON that
  breaks the rule (a missing row, a row of another length, a value that is
  not exactly an fp32) is refused. The same rule turns
  `voices/af_heart.json` into the pinned `af_heart.bin` byte for byte.
- Every object is stored with `Content-Type: application/octet-stream` and
  `Cache-Control: public, max-age=31536000, immutable`. A key is never
  replaced, so immutable holds, and one non-text type keeps the edge from
  compressing the `.json`, `.md` and `.mil` files, so the bytes the phone
  hashes are the stored ones.

### The copy job

`bun run models:copy -- --cache <dir> [--dry-run]` (`infra/models/copy.ts`,
the job in `infra/models/job.ts`) fills a cache and copies it into the
bucket. The cache is the one `natural:serve` uses, `tmp/natural-models/` at
the repository root, so files fetched by one are kept by the other.

- **The fill** (`fillWith` in `scripts/natural-serve.ts`, over
  `fetchPinned` in `infra/models/source.ts`, which the model server's
  `fillPinned` uses too): in list order, a cached file
  at its size and SHA-256 is kept and never fetched; any other is fetched
  from `resolve/2568276a60ff6e7f312afce3dc9e3f07521cb48d/ANE/<path>` (for
  `am_michael.bin`, `voices/am_michael.json`, converted), checked, written
  to `<path>.partial` and renamed into place. The first failure stops the
  fill and fails the run before any R2 call. There is no retry: a rerun
  resumes.
- **The plan:** the job lists `kokoro/2568276a60ff/` once and compares each
  file's cached MD5 and size with the key's: the same → kept; no key →
  uploaded; other bytes → conflict, never put and never replaced (the fix
  is a new revision folder). Keys outside the list are never touched, and
  nothing is ever deleted.
- **The upload:** four at a time, through the R2 REST object endpoint with
  the key's slashes literal (`infra/models/r2.ts`, the hymnal's adapter).
  R2's answer must carry the file's MD5 and size, or the file is failed; a
  failed put fails that file alone. Each upload may take 10 minutes and the
  listing 3, retries included.
- **The check:** the job lists the prefix again; verified counts the files
  R2 holds with their size and MD5. The run succeeds only at 39 verified
  with no conflict and no failure, and a rerun puts only what R2 lacks.

A real run ends with

```
models-copy run files=39 bytes=83332513 fetched=0 target=kept 0 uploaded 39 conflict 0 failed 0 verified 39/39
```

and exits non-zero (`CopyIncomplete`) when any count falls short.
`--dry-run` fills and checks the cache alone: it reads Hugging Face, builds
no Cloudflare layer, reads no profile and touches no R2, and ends with

```
models-copy dry-run files=39 bytes=83332513 fetched=<n> target=unread
```

`bun run test:mirror` runs the stack's tests over a fake Hugging Face, a
fake bucket and a recording HTTP client; none uses the network.

### Deploying and copying

The orchestrator runs these, with the owner's yes, from
`apps/heartseed` on main, with the owner's default Alchemy profile. Its
token needs R2 bucket and object write on the account, and Zone and DNS
write on heartseed.app, which must be in the same account. Stop at the
first result that differs:

1. `bun run plan`: one create, the bucket `heartseed-models` with the
   domain `models.heartseed.app`, and nothing else.
2. `bun run deploy` (the package's typecheck, tests and `test:slow` first).
3. `bun run models:copy -- --cache $PWD/../../tmp/natural-models --dry-run`.
4. `bun run models:copy -- --cache $PWD/../../tmp/natural-models`, then
   again: the second run keeps 39 and uploads 0, `verified 39/39`.
5. `curl -sI https://models.heartseed.app/kokoro/2568276a60ff/am_michael.bin`
   answers 200 with `content-length: 522240` and both headers above.

### Cost

The 39 files are 83.3 MB, about 0.08 GB-month. R2's free tier is 10
GB-month, 1 million Class A and 10 million Class B operations a month,
account-wide, with free egress. If the account's hymn recordings already
pass 10 GB, the mirror adds at most one billed GB-month, $0.015 a month. A
copy is 39 PUTs and 2 listings (Class A), once; an install is at most 39
GETs (Class B) when the edge does not serve them.

## Tests

- The unit tests (`*.test.ts(x)`, not `*.slow.test.*`) run as parts, each a
  package script and a task of `turbo.json` that the commandless `test` task
  depends on, so the gate runs each as its own task and
  `bun run test:budget @manna/heartseed` times each alone (under 1 s). The
  `src` parts run with `src/test/setup.ts` as the preload (react-native-web
  for `react-native`, the bundled passage for `virtual:heartseed-passage`,
  the corpus for `virtual:heartseed-kjv`, the licence for
  `virtual:heartseed-licence`, a happy-dom document); `test:infra` and `test:mirror` run with none.
  - `test:matcher`: `src/matcher.property.test.ts`, the matcher's generated
    recalls.
  - `test:voice`: `src/voice.property.test.ts` (the voice against its model,
    the choice over both keys) and `src/voice` (the read rule of the choice
    over every text of both keys and failed reads, `choose` in command
    order and in bursts, and the native module's guards).
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
    prototype's colours, full corn after a held launch, and no claim in
    any frame of a held launch), through `src/test/stage-rig.tsx`.
  - `test:today-reads`: `src/garden/today-reads.test.tsx`, the same stage
    over failed reads (every listing, every open: no claim in any frame
    of the session, and the recital kept or not) and over another verse's
    plant at full corn, which never shows as the passage's.
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
    rule names (any disk, the voice's choice and its old switch, and launch
    read, held or not; a speak that
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
  - `test:field-bar` and `test:field-bar-lists`:
    `src/field/bar-remove.test.tsx` and `bar-twice.test.tsx`, then
    `bar-lists.test.tsx` and `bar-kinds.test.tsx`, generated readers
    through `src/test/bar-walk.ts` over `src/test/bar-rig.tsx` (the root
    over the device's store, whose passages' key alone may fail its reads;
    every frame held to one heading, no bar control, alert or limit line
    inside a scroll view, no add beside the limit line or at 3 held,
    nothing offered over unread passages, every field control, `About`
    among them, disabled while a remove is pending, and every seen text of the field and the
    chooser at AA): stored lists of 0-5 or more passages with equal ones,
    garbled values and 1-3 failed reads; a row's `Remove`, then `Keep`,
    another row, leaving, or the ask's `Remove` landing or refused, once,
    twice in one turn or with `Today` or `Keep` in the same turn;
    `Add a passage` left or planted; after every tap the field, the bar
    and the disk against `src/test/choose-model.ts` and the passages'
    model; each file's floors met by its own devices.
  - `test:about`: `src/about/screen.test.tsx`, About through the bar rig:
    from Today to the field, its `About` outside every scroll view and
    44 pt tall, About's one heading, the credits word for word, the licence
    equal to the file, every text at AA, the way back, nothing written and
    a relaunch on Today; `About` disabled in every frame of a pending
    remove; a recital started while About shows brings Today; and the
    plugin serving `virtual:heartseed-licence` as `vite/licence.ts` prints
    it.
  - `test:session`: `src/session.property.test.ts`, the daily plan
    (`planOf`) and Today's counts line (`countsOf`) against the rules
    written plainly in `src/test/session-model.ts` (ts-fsrs's due dates,
    days by their own arithmetic, zones by `Intl`), over generated gardens,
    pieces, zones, instants, absences and lengths, each case's coverage
    held to floors; and `src/session/service.test.ts`, the session service
    over a store in memory and a garden set by hand, under a test clock:
    generated launches hold the stored minutes (the four texts, bad texts,
    failed reads, refused writes, nothing written at launch) and the
    plan's moment (Today's first `begin`, each tap) to the same model.
  - `test:header`: `src/session/header.test.tsx`, Today's header through
    `src/test/session-rig.tsx`: generated devices and launches (stored
    minutes, the voice's choice and its old switch, failed reads, unread
    and held listings, the first minute) and taps (Voice stepping the
    cycle, refused writes, taps while Say it listens, the field and back),
    every frame held to where the choices may show (only under Today's
    heading, outside the scroll view, which holds no control but a missed
    word's mark), the first values shown, and the disk (the old switch
    never written); and a pending frame with the session's and the voice's
    views at hand shows neither.
  - `test:pill`: `src/session/pill.test.tsx`, the `Voice` button through
    the same rig: from each start (the choice `her`, `him` or `off`, only
    the old switch `false` or `true`, junk over `false`, nothing), at
    launch and after each of four taps, one button labelled `Voice`, its
    word and value, its fill and its height, each tap's stored choice and
    the old key unchanged, and a relaunch showing the last; two taps in one
    turn cycle twice; a refused write then a relaunch.
  - `test:counts`: `src/session/counts.test.tsx`, Today's counts line
    through the same rig: generated devices (fresh installs planted
    through the first minute in the evening or the day, disks of the
    passage's history beside verses no piece names), launches in zones
    that change, at an evening planting's morning, the next 04:00 and the
    passage's due, unread and held, and commands (recitals heard, missed,
    unheard, refused or unwritten, Again, Minutes taps while Say it
    listens and after time passes, Voice taps, time, the field and back);
    after every step the line is `src/test/session-model.ts`'s counts of
    the plan it made at Today's first show and at each Minutes tap, over
    the disk's recalls, and an unread launch shows no line in any frame.
  - `test:session-held`: `src/session/held.property.test.ts`, the held
    verse at the session seam: generated devices holding the promise and
    one to three passages (one held twice, one over the promise's verse),
    each round a hold on a new verse, a passage verse's review or the
    promise's, its recital listening, finishing or finished, then a remove
    of its passage, of another, of one held twice, or an add, through
    `addPassage` and `removePassage`, then `Next`; after every step the
    plan, the pieces and the hold against the models, and `shownOf` the
    held item with its own piece until `Next`, never a verse that left the
    pieces after it.
  - `test:session-visit`: `src/session/visit.property.test.ts`, a visit at
    the session seam: generated devices teaching Fear, with its verses
    planted at a share, promises of other collections known whole (one,
    two or three verses) or one verse alone, and held passages, in five
    zones, each walking taps on a known promise (over an open visit or a
    held result), Say it on the item shown (kept, refused by the store or
    under way), `Next`, a Minutes tap, a return, an add or a remove (with
    and without a recital under way) and time; after every step the plan,
    the pieces, the hold, the visit (each baseline its recall count at the
    tap) and the counts line against the models, and `shownOf` the held
    item, else the visit's first not done, else the plan's
    (`src/test/promise-model.ts`).
  - `test:run`: Today's run through `src/test/run-rig.tsx` (pieces given
    to `appLayer`, a recognizer that hears the text a test names, at once
    or held back while the recital finishes, Dictation's cancel, refused
    recall writes and unread listings; every Today frame held to the
    footer rule: no control in the scroll view but a missed word's mark,
    at most one action button): `src/run/footer.test.tsx`, the action
    button and the grades under the scroll view through a recital, a grade
    and the field and back.
  - `test:run-walk`, `test:run-hold`, `test:run-edges`, `test:run-end`,
    `test:run-cells`: `src/run/run.test.tsx`, `hold.test.tsx`,
    `edges.test.tsx`, `end.test.tsx` and `cells.test.tsx`, Today's run against `src/test/run-model.ts` (over
    `src/test/session-model.ts`'s plan) on generated devices through
    `src/test/run-walk.ts`, each shown word held to its piece's cue,
    leaning toward whole plans (many pieces and groups, Next, every
    recital's ending, Again), the hold's moments (a Minutes tap while a
    recital listens or finishes whose plan holds the item first or leaves
    it out, a tap with a result or after an unheard recital, the field, a
    relaunch), the edges (the first minute, the done state, unread
    launches, zones) and the recital's endings (cancelled, finishing, and
    a Minutes tap after each ending that kept nothing) and a Minutes tap
    around each ending (every cell of the ending, the tap's moment while
    the recital listens, finishes or after its end, and whether the new
    plan moves the held item or keeps it first, `CELLS`); each case's
    floors met by its own devices.
  - `test:wake`: `src/wake/life.test.ts` (the return rule over every
    sequence of up to six host states after each launch state, and long
    random ones, against `src/test/wake-model.ts`), `src/wake/service.test.ts`
    (`Session.wake` over generated devices: gardens, holds, every minutes
    choice, recitals listening, finishing and ended, Minutes taps, time from
    a minute to a month, an evening planting's 03:50 and 04:10, zones and
    unread launches), `src/wake/source.test.ts` (one `AppState` listener
    per running launch of the app's layer, none once it closes, a wake per
    return) and `src/wake/guard.test.ts` (one host adapter names
    `AppState`).
  - `test:wake-walk`, `test:wake-quiet`, `test:wake-clocks`: `src/wake/wake.test.tsx`,
    `quiet.test.tsx` and `clocks.test.tsx`, Today's run walked through
    `src/test/wake-walk.ts` over `src/test/wake-rig.tsx` (the run rig with the
    host's state in the test's hands, each state sent taken by the session
    before the next step) against `src/test/wake-model.ts`, leaning toward
    returns at every run state (the done state, a review, the new piece,
    Next pending, after an unheard recital or a refused write, on the
    field, every minutes choice), toward the returns that change nothing (a
    recital listening or finishing, the first minute's phases, unread
    launches, `inactive` alone and a second `active`) and toward the clocks
    (aways of minutes to a month, many returns, zones, evening plantings);
    each case's floors met by its own devices.
  - `test:wake-edges`: `src/wake/edges.test.tsx`, the first minute's phases
    and Continue's own plan, the pending frame and a subscription read in
    the background, an unread garden's result, a return while a recital
    finishes, and 03:50 and 04:10 after a planting at 21:00 in Los Angeles,
    Kathmandu and Lord Howe; and `src/wake/listen-edges.test.tsx`, Listen at a
    90-word new piece after a review (two taps in one turn read once), a
    refused speak, and Say it stopping the voice before the recognizer
    listens.
  - `test:wake-listen`, `test:wake-reading`: `src/wake/listen.test.tsx` and
    `reading.test.tsx`, the same walk leaning toward Listen with
    `wake-rig.tsx`'s reading voice: where Listen shows at every settle
    (`listenModel`) and in every frame, the text each speak reads, Voice
    taps and their stored choice, and each way a reading ends or goes on
    (its finish or interruption, Say it, a tap onto Off, a relaunch; a
    Minutes tap, a return, the field, a tap from Her to Him); each case's
    floors met by its own devices.
  - `test:corpus`: `src/passages/corpus.test.ts`, every verse of the KJV
    through `versesOf` against `test/passages-model.ts`, every book's
    chapter bounds, and the module's reads in a child process
    (`test/kjv-lazy-rig.ts`); and `src/passages/guard.test.ts`, `src/kjv.ts`
    the one product file that names the corpus module, and none that names
    the source file.
  - `test:passages`: `src/passages/ranges.property.test.ts`, the range rule
    and the references over every chapter of all 66 books; and
    `src/passages/service.test.ts`, 300 generated devices of stored values,
    read faults, adds and removes (`test/passages-rig.tsx`), judged against
    `test/passages-model.ts` at every step; and
    `src/passages/pieces.property.test.ts`, the pieces over generated lists
    of the app's own pieces and of passages, against the model's.
  - `test:passages-session`: `src/passages/session.test.ts`, generated
    devices walking adds, removes, adds and removes at once, Minutes,
    holds, recitals and returns
    through `addPassage` and `removePassage` over a store that yields at
    every call, the plan, the hold, the pieces and the disk judged against
    the models at every step; and a reader's first three days in five zones.
  - `test:chooser`: `src/chooser/range.property.test.ts`, the range a
    reader taps (`tapVerse`) against `test/choose-model.ts`'s rule written
    plainly: every range of 1-20 verses and every tap from 0 to one past
    the end in chapters of 1, 2, 3, 5, 19-22, 39-41 and 176 verses, with
    fractions, a negative and NaN; 20,000 generated taps over chapters of
    1-176 verses; and long tap sequences folded against the rule, every
    answer choosable.
  - `test:chooser-lists`: `src/chooser/lists.test.tsx`, the chooser in
    happy-dom through `src/test/chooser-rig.tsx` (`ChooserScreen` over the
    app's layer and the device's store, beside a stand-in field that opens
    it again; every frame held to one heading, no back, `Plant`, alert or
    limit line inside the scroll view, `Plant` only over a reference of
    1-20 verses, and every seen text at AA): the 66 books in canon order
    under the two testaments' labels, a sample of books' chapters against
    the corpus, and every verse of Psalms 119 and 117, Isaiah 41 and
    chapters of 20 and 21 verses under each kind of range, with the header,
    the footer and each back, against `src/test/choose-model.ts`.
  - `test:chooser-walk`, `test:chooser-steps` and `test:chooser-leave`:
    `src/chooser/walk-plant.test.tsx`, `walk-taps.test.tsx` and
    `walk-leave.test.tsx`, generated readers
    through `src/test/chooser-walk.ts` over the same rig: stored lists of
    0-3 passages or a garbled value, chapters opened and backed out of,
    taps by pattern, and `Plant` landing, refused, `Full` or `Unread`,
    tapped twice in one turn or with a back in the same turn, then a
    retry, a verse or leaving; after every tap the screen, the stored
    passages and every other key against the models; each file's floors
    met by its own devices.
  - `test:reader-today`, `test:reader-unread`, `test:reader-add`,
    `test:reader-add-back` and `test:reader-remove`:
    `src/chooser/reader-today.test.tsx`, `reader-unread.test.tsx`,
    `reader-add.test.tsx`, `reader-add-back.test.tsx` and
    `reader-remove.test.tsx`, generated readers through
    `src/test/reader-walk.ts` over the run's rig (the root over a disk, a
    recognizer that hears the verse said, a frozen clock, a zone), in UTC,
    Los Angeles, Kathmandu, Lord Howe and Chatham, through Today (`Say it`
    then `Next`, Minutes, a relaunch after the next 04:00), the field
    (`Today`, a remove asked, kept, refused or tapped twice) and the
    chooser (backs, taps by pattern, `Plant` refused, retried or tapped
    twice); after every command Today's shown verse, counts line and
    `Listen` against the plan made at each making over the reader's
    pieces, the field and the chooser against `src/test/choose-model.ts`,
    and the disk; every frame of every screen held to `barFaults`; each
    file's floors met by its own devices. `test:chooser-leave` also runs
    `src/chooser/fixed.test.tsx`, which keeps every screen's fixed
    controls outside its scroll views in every frame.
  - `test:promises`: `src/promises`. `content.test.ts`, the fourteen
    promise collections through the app's corpus: Selah's ids and titles
    in its order, 10-12 promises each, 158 over 188 verses, each 1-3
    verses of its chapter with text and at most 70 words, none twice, and
    the Fear collection alone taught. `pieces.property.test.ts`, the
    pieces with collections taught (`piecesOf` over `collectionPieces`)
    against `src/test/promise-model.ts` for generated passages over Fear's
    verses and the promise, unread ones, and taught ids left out, empty,
    one, several or unknown, then 36 launches of the app's layer whose
    session's pieces and plan after `begin` meet the model and
    `planModel`. `field.property.test.ts`, the field's rows over
    `fieldPassagesOf` against `fieldRule`, a Fear verse in a held passage
    in both rows and a removed passage's Fear verse kept in the Fear row;
    `field.test.tsx`, the root's field with the Fear row after the held
    passage and no `Remove` on it, and no taught row with the part left
    out.
  - `test:need`: `src/need/need.property.test.ts`, When I need…'s cards
    (`needOf`) against the rule written plainly in
    `src/test/promise-model.ts`: every subset of the Fear collection's 14
    verses with Fear taught, 3,000 generated gardens over all 188 promise
    verses with near misses and one verse alone of a longer promise, taught
    sets of none, one, several and all in any order, each case's floors
    met; then every card in the situations' order, an empty garden, and the
    first minute's promise under Strength.
  - `test:need-screen`: `src/need/screen.test.tsx`, When I need… through
    the root over `src/test/need-rig.tsx`, which holds every frame to the
    screens' rules (one heading, `When I need…` only on Today and outside
    its scroll view, on When I need… no control in the scroll view but a
    promise, every control at least 44 tall and every text at AA): the
    header's `When I need…` beside `Your field` in a row that wraps, the
    cards after the first minute with and without the `promises` part, and
    a visit of another collection's promise kept over the bar's `Today`
    and the field, said, then the done state, its recall the one write.
  - `test:need-offer`: `src/need/offer.test.tsx`, no `When I need…` in the
    first minute, an unread garden or over unread passages, and none while
    Say it listens.
  - `test:need-walk-a`, `test:need-walk-b`, `test:need-walk-c`:
    `src/need/walk-{a,b,c}.test.tsx`, When I need… and a visit walked
    through the root (`src/test/need-walk.ts`), two generated devices each
    (seeds 3, 4 and 6), held after every command to `shownModel`,
    `countsModel` over `planModel`, `needModel` and `fieldPassagesModel`,
    and to the disk's rule (no key added but the recalls said and the
    minutes after a tap), each part's floors met.
  - `test:natural`: `src/natural`, the natural voice's plan, seam and probe:
    `src/natural/plan.property.test.ts`, `planOf` and `startsOf` against a
    model written in the test over a small hand-built lexicon and vocab
    (seeded texts, the cap at 200 and 201 for a clause, a word and a packed
    pair, code points against UTF-16 units, marks after a spoken lead, and
    durations that do not fit); and `src/natural/data.test.ts`, the
    committed data: the vocab's pinned hash, the list's bytes as the
    generator last wrote them, its keys sorted and unique, and every
    phoneme and override spoken in the vocab; `src/natural/manifest.test.ts`,
    the 39 pinned files, the voices and `baseFor` over seeded asks;
    `src/natural/guard.test.ts`, the native module's guards (its committed
    declaration equals One's, the simulator branch never starts the engine
    and logs its skip, no file sets the audio session, only
    `source.ios.ts` names the Swift file, the vendored headers and
    LICENSE); `src/natural/lexicon.test.ts`, the bundled list and vocab;
    and `src/natural/probe.test.ts`, the probe's lines, a read's tally over
    seeded views (order ok only for each word lit once, in order, to a
    finish), the soak's count and tally, and one soaked verse over a
    stand-in module. It leaves out `src/natural/voice.test.ts`, which is
    its own part.
  - `test:natural-voice`: `src/natural/voice.test.ts`, the natural voice's
    `VoiceSource` against a model written in the test, over 300 seeded
    histories of a stand-in module that answers each load and render when
    the history says (speaks of one to three chunks and of a text no plan
    takes, malformed renders, a refused play, events of the held utterance
    and of others, a reload): its module calls, the events it forwards and
    each speak's state after every step.
  - `test:rest`: the other test files at the root of `src`, named file by
    file.
  - `test:infra`: `scripts` and `vite`, with `scripts/sim.test.ts`
    (Heartseed's `sim` over a stand-in Drive: its values, the web and a
    port outside 8280-8289 refused before any step, and `install` waiting
    for Today's reference), `scripts/natural-serve.test.ts` (the model
    server over a fake cache on a port the system picks, with no network:
    the fill, `GET`, `HEAD`, 404 and `--corrupt`), `vite/kjv.test.ts`
    (the corpus's derivation and its build faults, and the plugin's two
    modules) and `vite/lexicon.test.ts` (the pronunciation list as the
    plugin serves it).
  - `test:mirror`: `infra`, the mirror's stack, with no preload:
    `infra/models/plan.test.ts` (the list, the keys, the headers and the
    plan's keep, upload and conflict), `infra/models/voice-pack.test.ts`
    (seeded packs, -0, the extremes, the ignored keys and every refusal),
    `infra/models/r2.test.ts` (the R2 adapter over a recording client:
    literal slashes, the listing's cursor, retries and denials on the test
    clock, the put timeout) and `infra/models/job.test.ts` (the copy and
    the dry run over a fake Hugging Face, a fake bucket and a temp cache).

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
