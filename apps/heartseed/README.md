# Heartseed

Scripture memorization on One (React Native on iOS, react-native-web on the
web). A fresh install opens the first minute (`src/first`, below): hear
the passage, say it with first letters, say it alone, and its first seed is
planted. Every later launch opens on home, the field (`src/field.ts`,
Field and Home, below): a row per passage, a plant per verse, the days
sown and the harvest, and fixed at its top the Today card that says what
the day's plan holds (`src/home/today.ts` over `src/session.ts`, below)
with one `Start`, or `Practice anyway` when nothing is due. `Start`,
`Practice anyway` or a tap on a verse's plant opens Today
(`app/index.tsx`), which shows the
passage the reader is learning, its stage in the garden, and one big
button, Say it, which hears the reader recite it; the word matcher
(`src/matcher.ts`) grades a recall against the verse, and the garden
(`src/garden.ts`) keeps it and grows the verse's plant. Beside Today's
heading, `‹ Your field` goes back to home. The session's `Minutes` and
`Voice` choices sit in home's Settings sheet (`src/settings/sheet.tsx`,
Settings, below), with the appearance and About.

Run it as a reader does with the verify skill,
`.claude/skills/verify-heartseed`. It drives through `bun run sim`
(`scripts/sim.ts`): the shared simulator driver `@manna/sim` with
Heartseed's values, `scripts/sim-app.ts` (the `verify-heartseed`
simulator, ports 8280-8289, iOS alone).

## Voice

The voice reads a verse aloud on the device and lights each word as it is
spoken; the reader chooses Off, Her or Him. Once the natural voice is
ready, Her reads in its `af_heart` and Him in its `bm_george`; until then,
while its crash fuse is blown, and for a reading whose natural start fails,
both read with the system's best voice (Natural voice, below). Two screens
call it, through the app's runtime (`src/app.ts`), and Say it reads no word
aloud:

- the first minute's hear phase (`Voice.read` at `Listen`, `Voice.stop` at
  a `Next` during a reading: the atoms `voiceView`, `listen` and `hush`);
- Today, on the plan's new piece: while `Voice` is not Off, no
  reading is under way and the action button reads `Say it`, a `Listen`
  button sits in the fixed footer before it (`listenTo`, which reads the
  shown piece's own text once, and `readingAloud(voiceView)`). While the
  voice reads, `Listen` is gone; it comes back at the reading's end
  (finished, failed or interrupted) and after an unheard, cancelled or
  refused recital. A press of `Say it` stops the voice before the
  recognizer listens. A review, `Next`, the done state, the end and an unread
  garden never show `Listen`; a making of the plan (a Minutes tap, a
  return, an add or a remove of a passage) does not stop a reading, and a
  tap of `Voice` (home's Settings sheet) onto Off does; a tap from Her to
  Him lets it go on. Listening is
  offered, not required, and writes nothing.

While the voice reads the shown piece's text and no recital's marks show,
Today shows the reading view (`src/reading/view.tsx`, testID `reading`) in
place of the whole passage (testID `passage`): one `word-<i>` text per word
(`shownWordsOf`, `src/reading/words.ts`: a word runs from its run's start
to the next word's, trimmed, so a mark-only run stays with the word before
it), each a direct child of `reading` with its own layout and its own
accessibility element. The words before the read point are in ink and the
rest quiet; the selected words (`aria-selected`, the `hearing` ground) are
the held word while held, else the voice's current range. Nothing animates.
At the reading's end the passage is whole again. The first minute's hear
phase (`src/first/screen.tsx`) shows the same view, under the same hold and
VoiceOver action, while the voice reads the passage, its own `ScrollView`
still while held; at rest its words are whole and all in ink, as before.
A sought reading that finishes ends hear as Listen's own does.

- **The hold.** The reading view carries a gesture-handler pan
  (`reading-hold`, `app/_layout.tsx` wraps every route in
  `GestureHandlerRootView`) that activates only after a still long press
  of 350 ms, so a swipe scrolls and never holds. At its activation the word
  under the finger (`wordAt`: the line nearest the point vertically, then
  the word in it nearest horizontally, over each word's box from its
  `onLayout`) is held, the voice pauses and one soft tick is felt
  (`holdReading`); each move holds the word under the finger; Today's
  `ScrollView` is still exactly while held. The end acts once, in
  `onFinalize`: a release reads on from the held word (`seekTo`), a cancel
  resumes (`letGo`). A reading that ends while held drops the hold, and the
  finger's later end calls nothing.
- **VoiceOver.** Each word offers one action, `Read from here`, which
  seeks to it.
- **The light probe** (`app/probe/light.tsx`, `heartseed://probe/light`)
  reads John 3:16 in the reading view and seeks by `Back 3` and
  `Forward 3`, for the simulator's drive, whose driver has no long-press
  drag (`.claude/skills/verify-heartseed/features/light.md`). It takes
  only `src/app.ts`'s atoms and renders nothing in a release build.

- `src/voice.ts` is the `Voice` service (Effect): `read`, `seek`, `pause`,
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
- `Voice.seek` (`seek(word)`) acts only while a reading is under way
  (reading or paused) and only for a whole `word` of the verse: it speaks the verse
  from that word's run as a new utterance, through the same call as
  `read`, with the words before it lit and the status `reading`; any other
  seek does nothing. The reducer keeps the utterance's `offset` in the
  verse (0 for a read), so a sought utterance's ranges, in the tail's own
  coordinates, light the verse's words.
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
- The matcher hears an archaic word in the modern words that sound the
  same, the recognizer's usual stumble (`thee` written `the`, `thy`
  written `thigh`, `wherefore` written `where for`): the sounds-alike
  table, `data/kjv-hearings.json`, read by `src/matcher/hearings.ts`. A
  hearing counts only for its own word and only one way: `thee` said
  where the verse has `the` is a miss, and a word's modern form (`you` for
  `thee`) or a pronoun never counts. `data/hearings.py` writes the table
  from Misaki 0.9.4's dictionary (`us_gold.json`) and the KJV's words, run
  from the repo root with
  `uv run --no-project --python 3.12 apps/heartseed/data/hearings.py`; its
  extras (`thai`, `yeah`) are the hearings the dictionary misses, each with
  its why.
- `src/dictation/script.ts` is the scripted word source: `recite` writes a
  recital as a recognizer reports it, and `scriptedSource` plays it on
  Effect's clock with no microphone, for tests. With `say: 'hearing'` (or
  `'modern'`) it says each archaic word as its first hearing (or modern
  form) in the word's own slot.
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
  shows counts only; the link's `script=hear` (or `script=modern`) says its
  archaic words as heard (or modernized). A release build renders nothing.

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
  `Unsaid`, the large round button, its pulse, the
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
  any verse's recall opens home (Home, below). An `Unread` garden opens
  Today, with no `Your field` in any frame of the launch: a garden that
  could not be read cannot know there is no seed, and has no field to
  show.
- Planting the seed does not swap the screen: Planted shows until
  `Continue`, which opens home, its plan made with the new seed in it (in
  the done state, `Nothing to tend now`).
- `Root` takes no props: the garden's read alone decides the opening, in
  the tests as on the device, so no test opens Today on a read garden.

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
4. `Planted`: `Stage: seed`, the still hand-drawn seed at 112 × 112 pt
   inside its 120 pt place, and `Continue`. Planting never sounds. No
   earlier phase draws a plant, including an alone recital whose write failed.

The flow's rules are a pure reducer, `src/first/flow.ts`: `openingOf` the
garden's view decides the opening (`pending`, `first`, `home` or
`today`) and `shownOpening` holds it for the launch; `step` moves each phase on only at its own input (Next, the
voice's ending, a recital of the phase's own, the garden's plant), and no
phase moves back. A recital is the phase's own when Say it's `startedAt`
differs from the one the phase began with. Nothing of the flow is stored
but the alone recital's recall, so a relaunch mid-flow starts again at
`Hear it`, and the runtime's close stops a reading under way.

## Garden

Every verse the reader has said is a plant: seed, then blade, then ear,
then full corn (Mark 4:28). Today shows the passage's stage under its
words (named `Stage: <stage>` for the screen reader), with a small plant
beside it from the hand-drawn set, and, while a finished recital is
on the screen, how that recital grew it (`Grew to an ear.`). Cues fade
across days by stage, the ladder (`cueAt`, `cueIn`): a passage not yet
planted shows and is said under the full text (whatever old pieces of it
are planted: Old pieces, below), a seed under its first
letters, a blade, an ear and full corn under nothing; Again makes a seed,
so the letters come back. In an unread garden Today shows the verse whole
and it is said with nothing, claiming no stage. Until the
garden's read of the store completes, and for the whole session when it
failed, Today claims nothing: no stage, no plant, no growth, so a planted
verse never reads as not planted. A growth plays one soft sound, which
Silent mode mutes. Nothing leaves the device.

The still drawing (`PlantImage`, `src/home/plant.tsx`) uses the bundled
`ICON_IMAGES` of the effective scheme now: seed, blade, ear and corn for
full corn. Today uses 28 × 28 pt; the first minute's Planted alone uses
112 × 112 pt. Source and defaultSource match, the image fits without crop,
scale or tint, and the artwork includes its soil. One hidden `plant`
wrapper holds one hidden `plant-image`; neither adds a name or control.
A read, unplanted Today says `Stage: not planted` without a drawing; an
unread Today and the bare done state draw none. Scheme changes replace
the source while mounted without changing the stage or flow. Home and
the end keep their own drawings and motion.

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
a plant, at the stage the garden derives. It is home, the screen a read
launch opens on (Home, below). Today goes back to it by the button
`Your field` (shown `‹ Your field`), shown once the garden's read
completes and never while Say it listens (leaving Today then would leave
the microphone open off-screen). It sits in Today's header beside the
heading, outside the scroll view, so however much a recital adds (the
recap, the grades, the growth line, an alert) it is on screen without a
scroll and clear of the home indicator. Home has no control named `Today`:
it opens Today by the Today card's `Start` or `Practice anyway`, or a
tap on a verse's plant, and
Today then shows as it was (a held result kept). Home, Today, the chooser
(Choosing a passage, below) and About (below) are in
place in the root route (`app/index.tsx`): no route, no link, no tab.
Which of these four screens shows is the root's state for the launch,
never stored, so every launch opens on the pending frame, then the first
minute, home or (unread) Today, and whenever Say it listens the screen is
Today. Until a read completes, and for a session whose read failed, there
is no field and no control: an unread garden cannot know the days sown,
and an unread session's recitals are written all the same, so the next
launch counts them.

- `src/field.ts` is the rule, pure: `fieldOf(garden, passages)` over a
  `Read` view and the passages taught: the promise's, a passage of one
  verse, then each the reader holds, in the order chosen, carrying its
  range, then each Handbook list held, in the order planted, titled by its
  title, then each taught collection, titled by its title, its verses in
  order, with no range (`fieldPassagesOf`, `src/promises/taught.ts`, over
  the app's layer's taught part, mapped in `app/index.tsx`; with the
  reader's passages unread, the promise's and the taught ones). Each row's
  passage is a `List` (`listsOf`, `src/lists.ts`; Home, below). The field
  shows once the garden's and the passages' views and the taught part are
  known. The passages come first,
  each verse a plant at `stageOf` its own plant, or `not planted` before
  its first whole recital (drawn as bare soil, whatever old pieces of it
  are planted); a verse is one plant wherever it shows; then each other
  verse the garden
  holds, alone, in the order first sown: by its earliest recall's
  `startedAt`, then by its reference in code units. An old piece is never
  a row or a plant: its plant folds into its verse's row (Old pieces,
  below), and counts toward that verse's first recall. References match
  exactly (`Isaiah 41:1`, `Isaiah 41:100` and `Isaiah 41:10 ` are three
  other verses).
- Days sown (`1 day sown`, `<n> days sown`) is the number of distinct days
  (`dayOf`, `src/day.ts`) among every recall the read holds, of any verse
  or old piece.
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
  number of verses whose own plant's stage is full corn now (stability of
  21 days or more; an old piece never counts), derived, never stored: Again on
  a verse at full corn takes it out.
- Nothing is stored for the field itself: no key, no value, no setting;
  it reads only the garden's and the passages' views, and writes only
  through a landed remove (Choosing a passage, below). Every number
  derives from the garden's view each time the field shows.
- `src/field/screen.tsx` draws a `Field` in home's layout (Home,
  below), its furrows and legend in `src/field/plot.tsx` and its cards in
  `src/field/card.tsx`. Fixed above the scroll view: the greeting (testID
  `greeting`, the sun or the moon, then its words in `sun`, plain text),
  then one card: the Today card, or a remove's ask (Choosing a passage, below), and under it a remove's
  alert. Nothing else: no `When I need…`, no gear, no add. It holds no way
  back: home is the root. The Today card (testID `today-card`, the rule
  `todayOf` in `src/home/today.ts`) holds once a plan is made its headline
  (`today-headline`: `<n> verse(s) · about <k> min`, n the distinct
  verses of the plan's items not done, or of the item the run shows when
  none is open; else `All tended for today`) and its parts (`today-parts`:
  `<r> to review` and `1 new` joined by `·`, a zero part left out; else
  `Nothing is due right now.`), and one filled full-width button: `Start`
  exactly when `beginsOf` holds (the run shows an item, or over unread
  passages the first piece to say), which opens Today and writes nothing;
  else `Practice anyway` while `weakestOf` names a verse (the planted
  verse `startOf` starts at the lowest stage, then the earlier last
  recall, then the reference), which starts it as a tap on its plant
  does; else no button. With no plan and no button the card
  is absent. In the scroll view: the heading `Your field`, the days sown
  and the harvest, the label `Lists` with `Add a list` (testID
  `add-list`, opening the Add a list sheet over home: Choosing a passage)
  or the limit line, one furrow per row (`furrowsOf`; testID `row`), a
  legend of the four stages (testID `legend`), hidden from the screen
  reader, over the caption `Mark 4:28`, then two rows the width of the
  field (testID `end-row`): `Settings` (Settings, below) and `How
  Heartseed works`, which opens About (About, below). A
  furrow's head holds its icon (`furrow-icon`), its title as one button
  named `Open <title>`, at least 44 pt tall, showing the title and a `›`
  hidden from the screen reader (never a heading, so a reference spelled
  `Your field` or `Today` adds none), which opens the list's own page
  (Lists, below), and its caption (`captionOf`, `src/home.ts`, testID
  `caption`: `<n> verse(s) · <r> ready today` when r > 0, else `<n>
  verse(s) · <p> planted` when p > 0, else `<n> verse(s) to learn`); then
  its plants, then a soil line. Home holds no `Remove`: a list is removed
  from its own page. Each
  plant (testID `field-plant`) is one button at least 44 × 44 pt named
  `<reference>, <stage>`, then `, ready today` for a verse of the plan's
  open items, never shown selected; inside it,
  hidden, the gold dot (testID `dot`, filled `sun`, at least 3:1 on the
  ground) when ready, the stage's image
  (`seed`, `blade`, `ear` or `corn` from `ICON_IMAGES`, of the scheme
  now) or bare soil (`plant-soil`) for a verse not planted, and no number.
  Every icon is hidden from the screen reader; nothing moves.
  Every text is in a text role at WCAG AA on what lies behind it. At most
  one filled button shows on home.
- **A tap on a plant** goes straight into Today on its verse, whole, with
  no card between (owner, 2026-11-12: "If you wanna go back, you can
  easily go back from that page anywhere"): while `startOf` starts
  something on the verse (a review of a planted verse, the plan's own
  item on it, or a canon verse not planted learned fresh) it runs
  `startHere` and opens Today once it settles; before a plan, when nothing
  starts, the tap does nothing. Home holds no choice and no chosen card.
- **The greeting** reads the runtime's `Clock` when home shows
  (`greetingNow`, `src/app.ts`, over `greetingAt`), in the reader's zone,
  and again at each return to the foreground while home shows (Session,
  below: `Returns`); never in between, so home left open across 12:00
  keeps its greeting until it shows again or the app returns.

## About

`About` in home's Settings sheet (Settings, below), and home's `How
Heartseed works` row, open the About screen
(`src/about/screen.tsx`, `AboutScreen({ onField })`): a bar fixed above a
scroll view holding the way back, `Your field` (shown `‹ Your field`),
which returns to the field with the sheet closed; in the scroll view the
one heading `About`, the natural voice's credits (`CREDITS`, one
paragraph, `about-credits`) and the Apache License 2.0 whole
(`about-licence`), which the bundle owes for the natural voice's vendored
code. Every text is the scheme's ink, at WCAG AA on the ground. About has
no foot and writes nothing: the reader's appearance is chosen in the
Settings sheet.

- The licence is `native/natural/kokoro/LICENSE` byte for byte, never
  trimmed or reflowed, served as the virtual module
  `virtual:heartseed-licence` (its default export the text):
  `vite/licence.ts`'s `readLicence()` reads the file and, run as a script,
  prints it as JSON, and `vite/plugin.ts` serves it as it does the other
  bundle-time modules. `src/virtual.d.ts` declares it and
  `src/test/setup.ts` stands it in from `readLicence()`; no file under
  `src` or `app` holds a copy of the text.

## Settings

Home's scroll view ends with the row `Settings` (`src/field/screen.tsx`,
testID `end-row`): a button the width of the field, at least 52 pt tall,
its word and a `›`, at WCAG AA in both schemes. Nothing named `Settings`
lies above the scroll view. No other screen
has a control named `Settings`: not Today, the chooser, About, the first
minute or an unread garden.

The row opens the Settings sheet (`src/settings/sheet.tsx`,
`SettingsSheet({ onDone, onAbout })`): React Native's `Modal`, `slide`,
`pageSheet`, `allowSwipeDismissal` (iOS lets a page sheet be swiped down
only with it), `onRequestClose` (the swipe down, the web's Escape) and its
backdrop the scheme's ground, so no white container shows in dark. Home
mounts it only while open; the open state is home's own, never stored and
never a route, so leaving home (Start, a plant's tap, Add a list,
About, a recital that brings Today) or a relaunch closes it.

- **The header,** fixed above the sheet's scroll view, holds the one
  heading `Settings` and `Done`, and wraps under large text.
- **The scroll view** holds, in order: `A day's tending` over the radio
  group `Minutes` (`2 min`, `5 min`, `10 min`, `20 min`; Session, below);
  `Reads new verses aloud` over the `Voice` button (Voice, above, and
  Session); `Appearance` over the appearance's radio group (Look, below);
  then `About` (About, above). Each choice shows once its stored choice is
  read. Every control is at least 44 pt tall, and every text is in a text
  role at WCAG AA on the sheet's ground, in both schemes.
- **A tap** goes through the app's own atoms (`chooseMinutes`,
  `cycleVoice`, `chooseAppearance`, `src/app.ts`): it shows at once in the
  sheet and on home under it, and is stored unless the store refuses it. A
  Minutes tap makes the plan again at the tap, so home's Today card, gold
  dots and `Start` change under the open sheet. An appearance tap
  re-themes every screen, the sheet included. Opening or closing the sheet
  writes nothing; `Done`, the swipe down and Escape leave home as it was,
  the plan kept.
- `src/settings/choices.tsx` holds the two controls the sheet shows, each
  under its line (`MinutesChoice`, `VoiceChoice`): the sheet is the only
  place a reader chooses the minutes and the voice.

## Passages

The reader may learn passages of the KJV beside the app's own promise.
The free tier holds 3 passages or lists together, a passage of up to 20
verses, a Handbook list whole whatever its size. These are the data
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
  `passages.read.failed` and `passages.write.failed`, with the key and the
  method or reason, never a verse.
- **The stored lists** are the key `heartseed/lists`, a JSON array of
  Handbook list ids (`bhb-<para>`) in the order planted, read in the same
  start as the passages' key, each key read whatever the other gave, each
  tried 3 times in all. No key reads as none; a text that is not an array
  of strings, or three failed reads of either key, makes the whole view
  `Unread`: no add, remove, plant or uproot, and no plan over passages or
  lists. A `Read` view's `lists` are the stored ids this build knows, each
  once, in stored order; an unknown id (a later build's, or `bhb-1760`,
  merged into `bhb-1695`) is not shown or counted, and every write keeps it
  in the stored text, in place.
- **The limit is joint** (`heldCount(view)`): passages and lists held count
  together, and an add or a plant needs fewer than 3. The service, the
  sheet's offers and foot, and the field's `Lists` read that one function.
- **A plant** (`Passages.plant(id)`) answers, in this order: `Unread`,
  `Invalid` (an id this build does not know), `Held` (nothing written),
  `Full`, else `Added` once the lists' key is written with the id at its
  end, or `Failed` (nothing changes). **An uproot** (`Passages.uproot(id)`)
  answers `Unread`, `Absent` (not held, every unknown id among them), else
  `Removed` once every stored entry equal to the id is dropped and the rest
  written in place, or `Failed`. A plant or uproot writes the lists' key
  alone and touches no recall; an add or remove the passages' key alone.
- **An add** answers, in this order: `Unread`, `Invalid` (not choosable),
  `Full` (3 or more passages and lists held), else `Added` once the list with the range at
  its end is written, or `Failed` when the write is refused (the view
  stays). **A remove** takes out the first passage equal to the range in
  all four fields: `Unread`, `Absent`, else `Removed` once written, or
  `Failed`. Each runs in call order, one at a time (a semaphore), so two
  at once never pass the cap or take one passage twice; a duplicate or an
  overlap may be added. `changes` streams each view. A remove never
  touches a recall: a removed passage's plants stay in the garden, its
  verses leave the pieces, and the field shows them as any plant no piece
  names.
- **The pieces** (`piecesOf(own, view, taught)`) are the app's own
  (`appLayer`'s `pieces`, the promise by default), then each passage's
  verses in passage and verse order, each with its corpus text, its words
  counted as the matcher counts them and its passage's reference as its
  group, each verse one piece, whole (Old pieces, below), then each held
  list's verses in Haskell's order, grouped by the list's title (The
  Handbook lists, below), then the taught
  collections' verses (Promises, below). Each
  reference is kept once, at its first place, so a passage over
  Isaiah 41:10 shares the promise's plant. With the passages unread, the
  app's own alone.
- **An add, a remove, a plant or an uproot is a making.** `addPassage(range)`,
  `removePassage(range)`, `addList(id)` and `removeList(id)` in
  `src/app.ts` (the atoms `plantPassage`, `uprootPassage`, `plantList`,
  `uprootList`) answer the service's answer, and
  after `Added` or `Removed` alone run `Session.remake`: a plan made in
  this launch is made again at that instant over the passages now, with
  the hold kept only while a recital is under way. Before the first plan,
  in an unread garden or with the passages unread it makes nothing.

## Choosing a passage

The reader adds passages from the field, plants a list from the Add a
list sheet over home, chooses any passage on the chooser, the root's
third screen, in place like the field, and removes a list from its own
page (Lists, below). The sheet's header and foot, the chooser's header
and its footer are fixed outside the scroll views; `Add a list` lies in
the field's scroll view, among the lists it changes.

- **The field's lists**: under the heading's days sown and harvest, the
  label `Lists`, then, with the passages read,
  `Add a list` (testID `add-list`) while fewer than 3
  passages and lists are held together, else the limit line "3 passages or
  lists, the most for now. Remove one to add another." (testID `limit`),
  which a stored list of 4 or more
  shows too, so the field never offers an add the service would refuse.
  `Add a list` opens the Add a list sheet over home. With the passages
  unread it offers neither, and no list's page offers `Remove`: the app
  never writes over what it could not read.
- **The rows** are the promise's, then each passage held, in the order
  chosen, titled by its reference, then each list held, in the order
  planted, titled by its title, then each taught collection's
  (`Protection & Fear`), then every other plant as a passage of one verse,
  an old piece's folded into its verse (Field, above). A held passage's page
  holds `Remove <its reference>`, which finds its passage by the row's
  range, never by its place; a held list's page holds `Remove <its
  title>`, which finds its list by its id (`removalOf`,
  `src/field/plot.tsx`, by the row's source). The promise, the taught
  collections and a loose verse are not the reader's choice and have
  none. The ask, its answer and its alert are the page's (Lists, below):
  `Remove` runs `removePassage` (`uprootPassage`, `src/app.ts`) for a
  passage, or `removeList` (`uprootList`) for a list; the service takes
  out the first equal passage, so with equal rows either row's `Remove`
  takes one, and every stored entry of the list's id. On `Removed` home
  shows without the row and its plants stay, a planted verse no other row
  names then a row of its own.
- **The Add a list sheet** (`src/shelves/sheet.tsx`, `AddSheet`) is a
  system `Modal` page sheet over home, as the Settings sheet is: the root's
  `add` screen keeps home in place under it. Its fixed header holds the one
  heading `Add a list` and `Done`; its scroll view holds a shelf head per
  `SHELVES` entry (`src/shelves.ts`), each at least 56 pt tall with its
  icon, title and note. `Any passage` opens the chooser. A shelf of lists
  opens in place (`aria-expanded`), closing any other, and lists one offer
  per list: its title (a reference, or a Handbook list's title), its count
  of distinct verses, and `Plant <title>` or
  `In your field` by `offerStateOf` over home's field, so a list whose
  every verse a furrow holds is never planted again. `Plant` acts by the
  list's source: a passage's runs `plantPassage(range)`, a Handbook
  list's `plantList(id)`. On `Added` (or `Held`) home shows, the new row
  last among the passages or the lists; on `Full` the foot shows the limit
  line (shown too while 3 or more are held), on any other answer
  "<title> was not planted. Try again." (`role="alert"`), the shelf
  still open, and the next tap clears it. From a tap of `Plant` until its
  answer no tap in the sheet, Escape or the swipe-down changes anything.
  `Done`, Escape and the swipe-down close it.
- **The chooser** (`src/chooser/screen.tsx`) opens at the books, with no
  range. Its fixed header holds one way back and the step's one heading:
  `‹ Add verses` (named `Add verses`, back to the sheet, every shelf
  closed) over `Add a passage` (the plain labels `Old Testament`
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
- **One change at a time.** From a tap of `Plant` until its answer, a
  tap of `Plant`, a verse or a back changes nothing, and each shows as
  disabled; from a tap of the ask's `Remove` on a list's page until its
  answer, no control of the page changes anything (Lists, below). A ref, set in the tap's own turn,
  holds it, so two taps in one turn make one change: a double tap never
  stores a passage twice or removes two.
- **Today after a change.** A landed add or remove is a making (Passages,
  above), so home's Today card and Today's run show the new plan: its reference, the
  counts line and `Listen` on a new piece. On a day a verse or an old
  piece was first planted (the first minute's day among them) no new piece
  shows; after the next 04:00 local, the first piece no plant names is
  new: a verse, whole, long or short.
- Nothing else is stored: opening and closing the sheet, its shelves,
  `Any passage`, stepping, tapping verses, backing out, `Keep` and unread
  passages write nothing, and there is no route or key of the sheet's or
  the chooser's own.

## Old pieces

A verse is the one thing a reader plants, learns, practises and sees,
whole, under its plain reference (owner, 2026-11-12: "verses are wholes,
right? Or should be whole"). An earlier build cut each verse of more than
12 words into pieces of 4-12 words and planted them one a day before the
verse itself; nothing cuts or plants a piece now, and the records it kept
stay as they are (rule M). `src/phrase.ts` reads them.

- **The reference** of an old piece is the verse's, a space, then the
  word numbers from 1 in brackets (`<verse> [<first>-<last>]`). Its
  recalls are ordinary recall records under that reference. `phraseOf`
  reads it back only from that exact form (a verse part with no bracket,
  two whole numbers from 1 with no sign or leading zero, the first no
  later than the last, nothing after `]`); any other reference, a verse's
  among them, names no piece.
- **Nothing is written for them.** No stored record is changed, moved or
  deleted, and no new record is stored under a piece's reference: the
  session's pieces are whole verses (`verseAsPiece` gives no `phrases`),
  so a plan item, a visit, a hold, `shownOf` and every recital name a
  verse.
- **Never planned.** An old piece's plant is a plant no piece names: it
  is never the new piece, never reviewed and never shown. It still counts
  among the plants first recalled today, so an old piece planted today
  spends the day's one new piece as any plant would.
- **Its verse is a verse to learn.** A verse whose only plants are old
  pieces is `not planted` on the field (owner, 2026-11-12, q87 (b): it
  reads as bare soil until it is said whole), the plan's new piece in its
  list's turn, and a fresh start at a tap, under the full text with
  `Listen`. From its first whole recital its stage and its review dates
  are its own plant's alone; an old piece's stage is never carried to its
  verse.
- **The field** never shows an old piece as a row or a plant. A piece's
  plant whose verse no row holds (a removed passage's) still makes one
  row for that verse among the other plants, `not planted`, first sown by
  the earliest recall of the verse and its pieces. Days sown count every
  recall, old pieces' included; the harvest counts verses' own plants
  only.
- **Known and visits.** An old piece never makes a verse known: a promise
  is known only when each of its verses has its own plant (Visits,
  below).
- **No bracket on a screen.** The root's rule (`src/test/root-rule.ts`)
  holds every frame of every rig to no text and no accessible name with a
  word range (`[<n>-<n>]`).
- **A rollback** to a build before this one reads a verse planted whole
  here as a planted verse, and its old pieces leave that build's plan as
  they did there for a planted verse; a long verse not yet said whole is
  offered in pieces again there. Nothing is lost.
- The tests: `test:phrase` (`phraseOf` and the reference form), the
  migration test `src/session/phrases.property.test.ts` in
  `test:session`, `src/field/phrases.test.ts` in `test:field` (the fold),
  and `test:phrase-walk-a`, `-b`, `-c` and `-c2` (Today over days through
  the root on gardens with old pieces): Tests, below.

## Promises

The app holds Selah's fourteen promise collections (its
`Promises.swift`), as references only, and teaches one of them, the Fear
collection, free, after the reader's own passages.

- **The content** is `src/promises.ts`, one plain module of data:
  `COLLECTIONS`, the fourteen in Selah's order, each its `id`, its `title`
  as Selah writes it (`Christ’s Return` with U+2019) and its promises in
  order, each a `Range` of 1-3 verses of one chapter, 158 in all over 188
  verses. Each book is its canon number, so no product source names a
  verse; no verse text is held, and each verse is read from the corpus
  (`versesOf`, `src/kjv.ts`), so the display rule holds everywhere.
  `src/promises/content.test.ts` resolves every promise through the
  corpus (each verse with text, the promise at most 70 words as the
  matcher counts them), and checks the counts, the ids and that no
  promise appears twice. No committed test reads `apps/selah`; the parity
  with the Swift file is the unit's acceptance check's.
- **Taught** is `TAUGHT`, `['protection']` (`Protection & Fear`, 12
  promises over 14 verses). `appLayer`'s part `promises` (ids; none when
  left out) is the one source: the runtime passes `TAUGHT`, and the
  session and the field's taught rows read
  that part through the layer (the `Taught` service,
  `src/promises/taught.ts`, and the session's layer), never the constant,
  so a rig that leaves it out plans and renders as before the
  collections. An id no collection has teaches nothing.
- **The pieces' order.** The session plans over the app's own piece, then
  each held passage's verses, then each taught collection's verses,
  promise by promise and verse by verse, each grouped by its collection's
  title (`collectionPieces`, `src/passages.ts`, built once as the layer
  builds), each reference kept once at its first place. With the passages
  unread, the app's own alone. The new piece stays the first piece no
  plant names, so a reader with passages to learn learns them first, and
  Fear's verses fill the days after them (from the second day for a
  reader with none); the reviews mix across passages and the collection
  by their groups. Each Fear verse is one piece, whole, long or short, as
  a passage's is (Old pieces, above): Fear's 14 verses are 14 pieces, its
  first new piece `Psalms 91:1` (19 words). A Fear verse inside a held
  passage keeps its first place there.
- **The field's row.** Each taught collection is a row titled by its
  title, its plants its verses in order, after the passages held and
  before the other plants; its page (Lists, below) has no `Remove`. A verse is one plant
  wherever it shows: a Fear verse in a held passage shows in both rows,
  and a removed passage's Fear verse stays in the Fear row. A Fear verse
  whose only plants are old pieces shows `not planted` there, as in any
  row (Old pieces, above).

## Session

The daily session is the plan of what to tend today: the due reviews, then
one new piece, within the minutes the reader chose. Its two choices sit in
home's Settings sheet alone (Settings, above): the radio group `Minutes`
(`2 min`, `5 min`, `10 min`, `20 min`) and the button `Voice` (the voice's
choice, `heartseed/voice/choice`). A tap of `Voice` cycles Off → Her → Him → Off
(`cycleVoice`, `src/app.ts`: `Voice.choose(nextChoice(choice))`, the view
changing at the call, so two quick taps cycle twice); it shows
`Voice: Off`, `Voice: Her` or `Voice: Him`, its label stays `Voice` and its
accessibility value is the word, so VoiceOver reads "Voice, Her, button".
Each pill is 44 pt tall, and the chosen minutes and a
`Voice` not Off take the grade pills' style.
Under `Voice` in the sheet, the natural voice's line
(`testID="natural-status"`) says its download's state while `Voice` is not
Off, with a `Try again` button beside it after a failure (Natural voice,
below).
They show once their reads complete. Today's fixed header holds `Today`
and `Your field` alone: no frame of Today holds a `Minutes` group, a
`<n> min` radio, `Voice` or the natural voice's line (idle, held, while Say it listens, done, or on
an unread garden, which has no home and so no Settings; its stored
choices still rule its Listen). At the top of Today's scroll view, above the
reference, the counts line (`testID="session"`) says what the plan holds.

Today runs the plan one piece (a verse, whole) at a time. In a read
garden with a plan it shows one item: the held one if any, else the
visit's first item not done (Visits, below), else the plan's first
item not done.
It shows the item's reference (`testID="reference"`), its words under its
cue (`cueIn`: the full text for a new piece, its stage's cue for a
review), its stage
line, and the action button. A press of `Say it` recites that item's own
piece and holds the item. Once the item is done (its plant holds a recall
more than at the plan's making, read from the garden, never from the
recital's end, so a refused write never moves on), the result and the
`Grade` group stay, a grade can still change, and the button reads `Next`;
a recital that is unheard, cancelled or refused leaves `Say it` on the
same item. `Next` drops the hold. With every item of a run done and none
held (the run is the visit's items, then the plan's), Today is the end of
the run (`tendedOf`, `src/home/grown.ts`): the one heading reads
`The field is tended`, the header's `‹ Your field` is the only control and
leads home, and the scroll view holds `Tended` (`src/run/tended.tsx`)
alone: a sun, the line `Nothing grew this time.`, `1 grew a stage.` or
`<n> grew a stage.`, and per grown verse, in run order, one image named
`<reference>, <stage>` with its stage's drawing and the reference, both
hidden from the screen reader. There is no counts line, verse, grade,
summary, footer or action. The end is a pure state of the view: nothing
remembers a `Next`, so a making that gives a new plan with an item ends
it, and an item left with no piece never shows it. With an empty run (no
visit and a plan with no items) Today shows the done state: the heading `Today` over the counts
line alone, `Nothing to tend now`, with no reference, verse, stage,
grade, summary or button. A making of the plan
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
  Today's passage alone, then the reader's passages' verses, then the
  held lists', then the taught collections': Passages and Promises, above; each its reference, its word count and its group,
  each a whole verse; `TextPiece` adds its text), the instant, the zone's offset at it
  and the minutes. `isDone` reads an item's done from the garden.
  - A plant is due at FSRS's due. While it holds one recall that carries
    an offset and started from 18:00 to 03:59:59.999 by that offset's local
    clock, it is due no earlier than the 04:00 that ends that recall's day
    (`dayOf`, `src/day.ts`): plant at night, recall in the morning, and
    travel moves no due instant. A record kept before recalls carried an
    offset keeps FSRS's due.
  - The pieces are planned as given, each a whole verse; an old piece's
    plant (Old pieces, above) is a plant no piece names.
  - The new piece is the first piece, in the app's order, with no
    plant. None is offered when any plant (an old piece's among them) was
    first recalled today, or when every piece is planted. A plant no piece
    names is never offered, and a reference in two pieces counts once, as
    the first.
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
  that instant when home or Today first shows in a launch with the garden
  read (home at the launch, Today on an unread garden's or a test's
  opening, home after `Continue` in the first launch), so home never shows
  before the plan that decides its Today card and `Start`, again at each Minutes tap, at
  each return to the foreground (`wake`, a no-op with no plan, an
  unread garden or a recital under way, read in the same step as the
  making), and after each `Added` or `Removed` passage or list (`remake`, a no-op
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
  launch's start, then of each making (its view's `pieces` and `held`),
  and beside it the visit (`visit`, Visits, below, and `start`, a
  verse of the home, Home, below), which lives as the hold lives. It needs `Dictation`: a making reads whether a
  recital is under way in the same synchronous step as the making, and
  keeps the hold and the visit only then.
- `src/foreground.ts` is the return rule, pure (`lifeStep` from `UNSEEN`,
  and `returnsOf` over a stream of states), the `Foreground` service (its
  `states`: the state at subscription first, then each change) and
  `wakeLayer`, which at each return for the runtime's life
  (`Effect.forkScoped`) counts it in `Returns` (a `SubscriptionRef` of the
  return count from 0, which home's greeting reads again at each change)
  and runs `Session.wake`. It is the one subscription to
  `Foreground.states` in a runtime. `src/foreground/source.ts` is its live
  source, the one module that names `AppState`: it reads `currentState`
  and adds the `change` listener in one step, and removes the listener
  when the runtime's scope closes (on react-native-web, where
  `addEventListener` may return nothing, it removes nothing). `appLayer`
  builds it by default; its `foreground` part lets a rig stand in at the
  service.
- `src/session/run.ts` is `shownOf(view, garden)`, what Today shows of the
  run, pure: `Unplanned` (no plan: the first piece), the `Item` with its
  piece, whether it is held and whether it is done, or `Done`: the held
  item, else the visit's first not done, else the plan's. An item's piece
  is the piece of its verse (`pieceAt`, `src/session.ts`), as the hold
  finds it. A held item
  shows with the piece it was held with (the view's `heldPiece`, kept
  beside the hold and dropped with it), never `Done`, even when a making
  took its verse out of the pieces: a remove of its passage while its
  recital is under way keeps the verse, its marks, `Listening` and then
  its result on Today until `Next`. The plan made then holds none of the
  removed verses, so after `Next` Today never offers one. The view's
  `pieces` and `held` keep their meaning.

## Visits

A visit is verses said now, ahead of the plan, each a review. Home starts
one verse as a visit (`Practice anyway` or a tap on a verse's plant,
Home, below). There is no `When I need…`: its screen,
its rule and its root state are gone (owner, 2026-11-11), and no screen
names it.

- **`Session.visit`** (`src/session/service.ts`) takes a promise's verses,
  in order, as the visit, each a review (`fresh: false`) whose baseline is
  its plant's recalls at the call (read behind every keep handed in before
  it), its piece the verse whole: the corpus text
  grouped by the collection's title. No screen calls it now; the session's
  tests hold it. A new visit replaces the one before; nothing is made
  before the first plan or in an unread garden.
- **Today over a visit** shows the held item if any (a visit never drops
  a held result), else the visit's first verse not done (done: its plant
  holds more recalls than its baseline), else the plan's first item not
  done. `Say it` recites the verse under the ladder's cue for its own
  plant's stage (whatever old pieces of it are planted) and keeps the recall under
  the verse with its word count, as any of Today's, so FSRS schedules from
  it. Its result, grades and `Next` are Today's, and
  `Next` shows the visit's next verse. A visit verse that is also a plan
  item is done in the plan too. The counts line is the plan's alone.
- **A visit lives as the hold lives:** a making with no recital under way
  (a Minutes tap, a return to the foreground, a landed add or remove)
  drops it with the hold; a making while a recital is under way keeps
  both. The field, About and back keep it; a relaunch
  has none. Nothing of it is stored: the only writes are the recalls
  said.

## The Handbook lists

Stephen N. Haskell's _Bible Handbook_ (1919) is data the app holds as
lists of references, each named by Haskell's own heading, grouped under
his sections. Each teaching section is a shelf of the Add a list sheet,
after the 17 others, in the book's order, under Haskell's title with the
note `S. N. Haskell, Bible Handbook (1919)`; each of its lists is an
offer, planted whole (Choosing a passage, above), its id stored under
`heartseed/lists` (Passages, above), its furrow on home after the
passages, titled by the list, every verse in Haskell's order, its own
page (Lists, below) holding `Remove <title>`. A verse already in the field keeps its one plant, and
planting writes no recall. The development probe
(`app/probe/handbook.tsx`, `heartseed://probe/handbook`) shows the data's
counts.

- **Titles and lists** (`src/handbook.ts`, `src/lists.ts`).
  `handbookTitle` is the one function of a list's title: a title used more
  than once in the book gets ` (n)` on its n-th use (no title repeats in
  today's data; the rule stays for the data's sake). `handbookListOf(id)`
  finds a list; `plantedListOf(id)` gives it as a `List` of source
  `Handbook` (its id, its title, its ranges' verses in Haskell's order,
  each once, no `range`), all 130 built once per process. Its furrow's kind
  is `held` and its icon `scroll`.

- **The source.** The references come from the repo's EGW paragraph
  database (book `BHB`, book id 978, each reference a structured
  `ScriptureRef` node); the headings come from the book's public contents
  page (`https://text.egwwritings.org/book/b978`), whose titles and
  paragraph ids are committed as `data/handbook-contents.json` (211
  entries), so a regeneration needs no network. The database keys
  paragraphs on their page, so it lost most of the book's headings; the
  contents page is the only full list of them.
- **Copyright.** The book was published in 1919 and Haskell died in 1922:
  public domain. The data takes only facts (which verses Haskell listed,
  the paragraph ids) and his own short headings, never a sentence of his
  notes, an EGW quotation or a verse's text; it carries its source (title,
  author, year, the contents page). Every verse's text comes from the
  bundled KJV (`versesOf`).
- **The rules** (`scripts/handbook/reference.ts`,
  `scripts/handbook/lists.ts`). A row belongs to the contents entry with
  the greatest paragraph id at most its own. A bullet line (`•`, with an
  optional label such as `Sinner.` of at most 40 characters before it)
  gives the references of its lead, the links before Haskell's note; a
  reference in the note is never read. A link reads as ranges of the
  chapter its title names: `C:V, V-W` in that chapter, the verses of a
  one-chapter book (`Jude 21-23`), or a whole chapter. `Romans 5:8, 6`
  reads as Romans 5:6, which may be Haskell's chapter 6: an accepted
  ambiguity of his notation. A range past its chapter's end, or of more
  than 20 verses (the passage cap), is left out and recorded; so is a
  link read no other way and a plain reference with no link. Each
  sub-heading is a list, and a section written without sub-headings is
  one list; ids are `bhb-<para>`. Sub-headings of one title in one
  section are one list, under the first's id, its ranges in the first's
  order then the others' new ones, a range again left out (`homesOf`;
  owner, 2026-11-09: the two `Second Chapter of Daniel` lists of
  `Prophecy` are one, `bhb-1695`, 102 verses). A sub-heading titled as
  its own section is a list of its own (`The Law of God`, `bhb-1358`,
  under section `bhb-1327`). Lists in different sections may share a
  title, as a section and its one list may; ids tell them apart. No word is added to a title.
- **Teaching sections only** (owner, 2026-11-09). `LEFT_OUT_SECTIONS`
  leaves out eight practical sections whole (`Health and Temperance`,
  `Dress`, `Diet and Dress`, `Business Principles`, `School of the
  Prophets`, `Bible Etiquette`, `City Work`, `Organization of Local
  Churches Officers`); the generator refuses to run when one of those
  titles is missing from the contents, so a renamed title fails loudly.
- **The data** is `data/handbook.json`: its source, 25 sections, 130
  lists, 2,528 ranges over 3,542 distinct verses, each list 4 to 183
  verses, one list per line so a diff reads list by list; and its 15
  skipped records (3 past the chapter, such as `Romans 3:20, 77`; 9 over
  20 verses; 3 unread, such as `Genesis 7-11, 12`). Ten more sections
  give no list, written as prose, a table or with no linked reference in
  a line's lead (`Introduction`, `The Two Covenants`, `The Earth`, …).
  `src/handbook.ts` decodes it once and exports `HANDBOOK_SOURCE`,
  `HANDBOOK` (each section its lists, each list a `Collection` of
  `Range`s) and `HANDBOOK_LISTS`; `src/passages.ts` imports it, so every
  launch decodes it (about 4 ms, and 6-11 ms to build the 130 lists).
- **Regenerating.** Copy the database and its `-wal` into a scratch
  folder (never open the owner's file in place), then
  `bun run handbook -- --db <copy>`; it opens the copy read-only, writes
  the same bytes for the same inputs and prints
  `handbook sections=25 lists=130 ranges=2528 verses=3542 skipped=15`.
  `bun run handbook -- --db <copy> --refresh-contents` fetches the
  contents page once and rewrites the snapshot first. It exits non-zero
  on a contents entry whose paragraph id is not a whole number, two
  entries with one id, or a database with no row of book 978.

## Home

The home is the field as the reader's first screen (home A, the owner's
pick). Its rules are pure code and one session command; the field
(Field, above) draws them in A's layout. The root (`app/index.tsx`)
opens on it:

- **The opening.** A launch on a read garden with a plant opens home, and
  so does the first minute's `Continue`; a relaunch decides again, the
  visit, the hold, the list shown and the screen all gone. An unread
  garden opens Today.
- **Home's first frame.** Home shows the pending frame (the reference
  alone) until the garden, the passages, the taught collections, the
  session and the greeting are known and, over read passages, the
  launch's plan is made (`FieldOf` begins the session at home's first
  show), so every frame of home over read passages holds the Today card,
  the plan's from its first frame.
- **The ways to Today** are four, each writing nothing but what its
  session command writes: `Start` (`beginsOf`: while the run shows an
  item, or over unread passages with the first piece to say),
  `Practice anyway` (the weakest planted verse), and a tap on a verse's
  plant (or a list page's verse row). Today goes back
  by `‹ Your field`; no screen has
  a control named `Today`, and whenever Say it listens the screen is Today.

The development probe
`app/probe/home.tsx` shows them as text over the live garden, passages and
session (verify-heartseed, `features/home.md`).

- **Verses and lists** (`src/lists.ts`; owner, 2026-11-09: one Verse type
  and one List type). A verse is its reference as `verseReference` writes
  it, and its plant is the garden's plant at that key; an old piece's
  plant folds into its verse's row (Old pieces, above). No list owns a plant or is stored beside one, so
  a verse in several lists shows one stage and one ready mark in each.
  `placeOf(reference)` gives the verse's book, chapter and verse only for a
  canon verse that round-trips exactly (no word range, no trailing space, no
  abbreviation, no verse 0 or past the chapter's end). A `List` is a
  `FieldPassage` with an `id` and a `source`: `Own` (the app's own row,
  `own:<title>`), `Passage` (a range in one chapter, carrying its `range`,
  `passage:<index>:<book>.<chapter>.<first>-<last>` by its place in the
  stored list), `Handbook` (a Haskell list held, `id` its `bhb-<para>`),
  `Collection` (`collection:<id>`) or `Loose` (a verse no list
  names, `verse:<reference>`). `listsOf(own, view, collections)` gives the
  own rows, then each held range in stored order, then each held list in
  stored order (neither while unread), then
  each taught collection; `fieldPassagesOf` returns it. It is a read model
  over the stored keys: nothing migrates.
- **Furrows** (`src/home.ts`). `furrowsOf(garden, lists, ready)` gives one
  furrow per row of `fieldOf`, in row order, each with its list's id,
  title and source, later rows `Loose`; its kind (`kindOf`: own, held,
  taught, other), its icon (`iconOf`: a bow for the own row and a
  collection, a harp for a psalm, a lamp for a proverb, else a scroll), its
  caption (`captionOf`: `<n> verse(s) · <r> ready today` when r > 0, else
  `<n> verse(s) · <p> planted` when p > 0, else `<n> verse(s) to learn`)
  and each plant's
  stage, ready mark and label (`<reference>, <stage>`, then
  `, ready today`). `HomeIcon` names the icons the home draws.
- **Icons** (`src/home/icons.ts`, `assets/home/`). Each `HomeIcon` (add,
  blade, bow, corn, ear, harp, lamp, moon, scroll, seed, sun, gear) is a
  hand-drawn 48 × 48 master, `assets/home/<name>.svg` (the ten of the
  Sideshow's set, a moon in their manner, and the gear drawn for
  Heartseed: a hub ring and eight rounded teeth), drawn for each scheme as
  `<name>-light.png` and `<name>-dark.png` (App icon and launch screen).
  `ICON_IMAGES[name][scheme]` is the PNG's import, an asset id under One,
  typed `number` by the `.d.png.ts` beside it; a name added without its
  two PNGs fails the typecheck. They are 144 px, so a screen draws them at
  48 pt or less, except Planted's 112 pt seed. The probe shows all 24 and how many loaded
  (`home-icons`); the field draws the furrows', the plants', the legend's,
  the greeting's and `Add a list`'s icons; the gear is drawn only by the
  probe. Today's stage line
  and the first minute's Planted use `PlantImage` (`src/home/plant.tsx`)
  from the same set (Garden, above).
- **Ready** (`readyOf(plan, garden)`, `src/home.ts`): the verses of the
  plan's items not done; none before a plan, and
  a visit marks nothing.
- **The greeting** (`greetingAt(at)`, `src/home.ts`): by the local minute
  (`minuteOf`, the zone's offset at the instant), `Good morning` from
  04:00 and `Good afternoon` from 12:00 with the sun, `Good evening` from
  18:00 to 03:59 with the moon.
- **A start on a verse** (`startOf`, `src/home/start.ts`; `Session.start`,
  `startHere` in `src/app.ts`), which `Practice anyway`, a plant's tap
  and a list page's verse row run. A verse starts, in order: nothing
  before a plan; the plan's earliest open item whose reference is the
  verse, exactly as planned (the new piece stays fresh); a review of a
  planted canon verse from its own plant's recalls now, its piece the
  session's or the corpus text; a canon verse with no plant of its own as
  a fresh item (`recalls: 0`, `10 + words / 2` seconds) on the verse's own
  piece (the session's, else the corpus text), whatever old pieces of it
  are planted; else nothing (a reference outside the canon). The item's
  reference and its piece's are always the verse's.
- **The Today card** (`todayOf`, `weakestOf`, `beginsOf`,
  `src/home/today.ts`; Field and Home, above): pure over the session's
  view, the read garden and whether the passages are unread. `beginsOf`
  is the one rule for `Start`, which the root reads too. The
  session makes it the visit, replacing any visit and keeping the hold,
  the plan and the minutes; it lives as a visit lives. Nothing is stored.
- **Shelves** (`SHELVES`, `offerStateOf`, `src/shelves.ts`): what the Add
  a list sheet offers (Choosing a passage): any passage (the chooser), the
  Psalms, the Proverbs and John's picks, then each collection the session
  does not teach, each pick and promise a `Passage` list, then one shelf
  per Handbook section (id `handbook:<section>`, icon `scroll`, the note
  `S. N. Haskell, Bible Handbook (1919)`), each list a `Handbook` list.
  `ShelfSource` keeps its two tags; an offer acts by its list's source.
  `offerStateOf` judges any list by its verses: `unread`, `in field`
  (every verse already on the field), `full` (3 passages and lists held,
  `heldCount`) or `plant`, and the sheet draws each offer by it.
- **What grew** (`grownOf`, `src/home/grown.ts`): the verses of a run's
  done items whose stage now ranks above their stage at the plan's making,
  each once, in plan order. `tendedOf` gives the same over a finished run
  (the visit's items, then the plan's) and is none while anything is
  left, held or unread; Today's end draws it (Session, above).
- **Motion** (`motionOf`, `endMotionOf`, `src/home/motion.ts`; drawn by
  `src/field/moves.tsx`). Only drawings move: on home each furrow's icon
  enters in turn (furrow `i` at `90·i` ms, over 300 ms), each planted
  plant springs up after the one before it (place `j` of furrow `i` at
  `90·i + 70·(j + 1)` ms, held at 1,200, over 420 ms), and a plant at full
  corn sways ±3°, 1.8 s from side to side, starting and resting upright;
  soil never moves. At the end of a run the grown plants spring one after
  another (verse `k` at `300 + 160·k` ms, held at 1,200) and full corn
  among them sways. The caps bound the work on any field: the first 14
  furrows, the first 60 planted plants and the first 12 at full corn on
  home, counted in reading order (spring and sway apart), and the first
  12 grown at the end; the rest are drawn at rest, so every entrance has
  ended by 1,620 ms. A moving node is an `aria-hidden` wrapper holding one
  image and no text or control, so titles, counts, plant
  buttons, the Today card, the end rows and the end's line and `Your field` stand
  still and answer a tap from home's first frame. The entrance plays at
  each mount of home (a sheet's close does not replay it). Every
  animation passes Reanimated's `ReduceMotion.System`: with the system's
  Reduce Motion on, nothing enters, nothing is held unseen and full corn
  stands upright. The probe's `motion` line gives the plan over the live
  furrows.

## Lists

Each furrow on home opens its own page: a tap of its title, `Open
<title>`, shows the list's page (`src/list/screen.tsx`, `ListScreen`) in
the root's place, the root's screen `list` beside the furrow's id, the
launch's state alone (never stored, never a route). When that id names no
furrow any more, the root shows home. The page reads the same atoms as
home and begins the session when shown, as home does.

- **What starts** (`src/list.ts`, pure over the session's view and the
  read garden; nothing stored). `listStartOf(view, garden, verses)` is
  `None` before a plan; else `Open`, the plan's open items whose verse
  is one of the list's, in plan order,
  each exactly as planned; else `Weakest`, the weakest of the list's
  planted verses that `startOf` starts, by the Today card's own order
  (`weakestAmong`, `src/home/today.ts`: the lowest stage, then the
  earlier last recall, then the reference); else `Learn`, the list's
  first verse with no plant that `startOf` starts, as `startOf` starts
  it; else `None`. `listLineOf` writes `<n> ready today · about <k> min`,
  `Starts with <verse>, nothing is due` or `Starts with <verse>, new
  today`; `listCaptionOf` writes `<n> verse(s) · none planted yet`, else
  `<n> verse(s) · <p> planted`, then ` · <k> at full corn` when k > 0.
- **Practice this list** runs `practiceList(verses)` (`src/app.ts`;
  `Session.startList`): after the garden settles, with a plan made, what
  `listStartOf` starts becomes the visit, replacing any before and
  keeping the hold, the plan and the minutes; then Today shows. It lives
  as `start`'s visit lives (Visits, above).
- **The page.** Fixed above the scroll view (testID `list-screen` on the
  root): `‹ Your field` (named `Your field`), the list's icon and its
  title as the one heading, the caption (`list-caption`), and, unless
  `listStartOf` is `None`, `Practice this list` (filled, full width) over
  its line (`list-line`). In the scroll view one row per plant in the
  furrow's order (`list-row`): its drawing, the reference
  (`list-reference`), the stage in words (`A seed`, `A blade`, `An ear`,
  `Full corn`, `Not planted yet`, then ` · ready today` and the gold dot)
  (`list-stage`) and a chevron; a row is one button named as home's plant
  (`<reference>, <stage>`, then `, ready today`) only while `startOf`
  starts its verse, and its tap runs `startHere`, then Today. With the
  passages unread, no remove; with no plan, no `Practice this list` and
  no row button. Every text is at WCAG AA on what lies behind it in both
  schemes.
- **Remove** lies at the list's end, for a held passage or Handbook list
  (`removalOf`) with the passages read: `Remove this list` (named `Remove
  <reference>` or `Remove <title>`) in the scheme's `miss`, with `Its
  plants stay in your field.` under it. Its tap puts the ask in its place:
  "Remove <name>? Its plants stay in your field." (testID `ask`) with
  `Remove` and `Keep`; `Keep` puts it back. From a tap of the ask's
  `Remove` until its answer, every control of the page shows as disabled
  and no tap changes anything, two in one turn included (a ref set in the
  tap's turn). On `Removed` home shows without the list's row; on any
  other answer the page stays, the ask goes, and "<name> was not removed.
  Try again." (`role="alert"`, testID `remove-alert`) shows where it was
  until the next tap. The ask, the alert and the pending state are the
  page's own, dropped when it is left.
- **Leaving.** `Your field` shows home; Today's way back shows home, not
  the page. Whenever Say it listens the screen is Today, from a page as
  from home.

## Natural voice

The natural voice reads a piece with Kokoro-82M instead of the system
voice, and lights each word as it is read. It holds its pronunciation
list, the rule from a piece's text to what the model is given, the native
module that downloads, renders and plays, a `VoiceSource` over it, and the
router that sends each reading to it or to the system voice. The reader's
choice of Off, Her or Him is the `Voice` cycle (`cycleVoice`, Voice and
Session above); Her reads in `af_heart` and Him in `bm_george`
(`naturalOf`, `src/voice.ts`).

- **The router.** `src/natural/route.ts`, `naturalVoices`, builds the
  `Voice` service the app runs (`appLayer`, `src/app.ts`) over a routed
  `VoiceSource`: a speak goes to the natural voice while it reads (the
  download `Ready` and the fuse clear), else to the system voice; a natural
  speak that fails before its first audio logs `natural.fallback` and the
  system voice reads the same utterance. Only the active voice's events
  reach the reading; a stop goes to both voices and returns after both, so
  Say it's recognizer starts after the natural engine halts; a pause or a
  resume goes to the active voice alone. A tap of `Voice` runs `tapVoice`:
  the natural voice takes the choice, then the voice does. Every speak
  names both voices (`Speaking`: the system voice's id and the choice's
  natural pack).
- **The download's states.** `src/natural/state.ts` is the rule, a pure
  reducer; `src/natural/service.ts`, the `Natural` service, runs it over
  the module and the store, the one owner of the module's install and load
  in the app. The download starts by itself at most once a launch: at the
  launch when the stored choice is not Off, or at the first tap of `Voice`
  that lands on Her or Him. With all 39 files present it loads the
  choice's pack, else it installs; a load that finds a file missing or
  failing its check installs again once, then fails `check`. After that
  only `Try again` starts it: a failed load loads again, any other failure
  installs again. Off cancels and removes nothing, and the app never
  removes the files ("No removal in the app").
- **The line.** While `Voice` is not Off, the line under the `Voice`
  pill of the Settings sheet (`src/settings/choices.tsx`) says the first
  that holds:
  `The natural voice stopped unexpectedly, so the system voice reads for now.`;
  `Natural voice could not download.`,
  `Natural voice could not be checked.`,
  `Not enough space for the natural voice (83 MB).` or `Natural voice could not start.`, each with a
  `Try again` button (a sibling of the line, 44 pt tall);
  `Natural voice: waiting for a connection`;
  `Natural voice: downloading, <p>%` (p rounded down, 0 to 100);
  `Natural voice: getting ready`. A ready voice, a
  download not begun and a platform with no natural voice show no line.
- **The crash fuse.** The first launch after a crash mid-reading (the
  module's marker) stores `heartseed/natural/fuse` = `blown` and shows the
  crash line in that launch alone; while the fuse is blown, in every
  launch, the system voice reads. Any tap of `Voice` clears the line and
  stores `clear`, and the natural voice reads from the next reading. The
  service writes no other key.
- **The base.** A release build installs from `MIRROR`
  (`https://models.heartseed.app/kokoro/2568276a60ff/`) and never reads
  `heartseed/natural/base`; until the mirror is deployed its download waits
  or fails `network`, and the system voice reads. A development build
  installs from the base the probe stored under `heartseed/natural/base`,
  through `baseFor`, else `MIRROR`. Each install logs `natural.install`
  with its `base`.

- `data/kjv-phonemes.json` maps every distinct word key of the KJV (13,756)
  to its phonemes in Kokoro's symbols: Misaki 0.9.4's English G2P for the
  key alone (with its espeak-ng fallback), or the key's entry in
  `data/kjv-phonemes.overrides.json`, which replaces Misaki's guess (empty
  today; the owner's listening fills it, at most 200 entries, each a KJV
  key that differs from Misaki's). It holds words and phonemes only, no
  verse text. Heteronyms (read, lead, wind) take Misaki's default sense,
  and names its guess. It is Her's list, American.
- `data/kjv-phonemes-gb.json` is Him's list: the same 13,756 keys in the
  same order, from Misaki 0.9.4's British G2P (`british=True`, with espeak-ng's
  `en-gb` fallback), or the key's entry in
  `data/kjv-phonemes-gb.overrides.json` (empty today, at most 200 entries).
  10,242 of its keys read otherwise than the American list's: no British
  entry holds Misaki's American-only `æ`, `O`, `T` or `ᵻ`, and no American
  one its British-only `ɒ`, `ː`, `a` or `Q`.
- `data/kokoro-vocab.json` is Kokoro's symbol vocabulary, byte for byte the
  `vocab.json` of Hugging Face `FluidInference/kokoro-82m-coreml` at
  revision `2568276a60ff6e7f312afce3dc9e3f07521cb48d`.
- `data/lexicon.py` writes both lists in one run, each from the same keys
  with its own dialect and overrides file. Regenerate them from the repository
  root with `uv run --no-project --python 3.12 apps/heartseed/data/lexicon.py`
  after editing an overrides file; its inline metadata pins Misaki, spaCy,
  `en_core_web_sm` and espeak-ng's loader, and only then are uv and the
  network needed. It writes the keys sorted, one entry a line, so two runs
  write the same bytes; `src/natural/data.test.ts` holds each list's hash,
  which a regeneration updates. The tests never run Python. espeak-ng runs
  only on the dev machine and nothing of it ships.
- `src/natural/plan.ts` is the rule, pure. `planOf(words, vocab, text)`
  plans a piece's displayed text, as `src/voice/reading.ts` speaks it. A
  word is a whitespace run that holds a letter or a number; its key is the
  run without its leading and trailing characters that are neither, looked
  up as written. A word speaks the `,.:;?!()` of its edges around its
  phonemes, `;` and `:` sent as `.` (the owner's "Clauses end in a full
  stop"; the screen, the matcher and the system voice keep the KJV's
  marks), other edge characters silent, and words join with one space,
  counted in code points. A phrase ends at a word whose trail holds one of
  `,.:;?!`, or before a line break (mark-only runs between words count as
  the gap). Each phrase is its own chunk, so Kokoro reads one phrase a
  call; only a phrase over `CHUNK_CAP` (200) symbols breaks, greedily
  between its words, and no chunk joins two phrases. Each chunk's ids are
  BOS 0, the spoken symbols' ids, EOS 0, and each word's mark is the index
  of its first phoneme, after its spoken lead, with the whole run's
  location and length in UTF-16 units, as the system voice's word marks
  give them. Each chunk carries its `rest`, the silence after it in
  samples at 24 kHz (`RESTS`, the owner's Gentle spacing): a line break
  1,100 ms (`verse`), else by the last of `,.:;?!` in its last word's
  trail, a comma 300 ms, `;` or `:` 550 ms, `.` `?` `!` 800 ms; a chunk
  inside a phrase and the text's last chunk rest 0. An unknown key, a
  symbol outside the vocab, a word over 200 symbols alone or a text with
  no word plans none.
  `startsOf(chunk, durations)` gives each word's start in the chunk's audio
  from the model's frames per id: `SAMPLES_PER_FRAME` (600) times the
  frames of the ids before its mark; durations that are not one whole,
  positive count per id give none. `cutOf(samples, first, last)` is the
  part of a chunk's audio that plays: `EDGE_KEEP` (480 samples, 20 ms)
  before its first audible sample to 480 after its last, within the audio,
  or all of it when nothing is audible; `startsWithin(starts, cut)` moves
  each start into the cut, a start trimmed off the front at 0 and one past
  the end at the cut's length.
- `src/natural/lexicon.ts` carries both lists and the vocab into the bundle:
  `lexicon(voice)` gives `{ words, vocab }` over that voice's list
  (`LISTS`), each list's map built once on its first call, from
  `virtual:heartseed-lexicon` (`{ lists: { us, gb }, vocab }`), which
  `vite/plugin.ts` serves as `vite/lexicon.ts` prints it (`readLexicon()`;
  `lexiconOf(us, gb, vocab)` refuses a wrong shape in either list). Nothing in
  `src/app.ts`'s graph reaches it yet.
- `native/natural` is the Swift package (module `Natural`, the local pod
  `OneSwiftPackages/natural`), for iOS 18 and later like the app. Its
  `kokoro` folder vendors FluidAudio's seven-stage Core ML chain for
  Kokoro (six files at commit `ee78635d23d52379117554ba72358b65a0612447`,
  with FluidAudio's LICENSE byte for byte); each file's header names its
  upstream path and what changed for Heartseed (the `#if TTS` wrapper,
  the constants trimmed to the English chain, and `synthesize` split at
  Prosody's pitch curve into `prosody`, stages 1-4, and `vocode`, stages
  5-7 on a curve the caller gives of the same point count, `synthesize`
  kept as the two in turn), and `kokoro/README.md` lists them. It is vendored, not a dependency, since One's prebuild takes
  no SwiftPM dependency. `ModelStore.swift` loads the seven compiled stages
  from one folder; `Natural.swift` is the module, whose declaration
  (`Natural.d.swift.ts`) is committed as One writes it.
- **The download.** `src/natural/manifest.ts` pins the 39 files of the
  download (`FILES`, in path order): 38 of Hugging Face
  `FluidInference/kokoro-82m-coreml`, folder `ANE/`, at revision
  `2568276a60ff6e7f312afce3dc9e3f07521cb48d`, and `bm_george.bin`
  (`BM_GEORGE`, converted from the same revision's rows, The mirror,
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
  `bm_george.bin`. `baseFor(dev, asked)` gives the base: a release build
  always the mirror, a development build a plain
  `http(s)://host[:port]/folder/` it is asked for.
- **The voices.** `VOICES` (`manifest.ts`) is `af_heart` and `bm_george`;
  a voice's pack is the file `<voice>.bin` of `FILES`, and its speed is
  `SPEEDS` (`af_heart` 0.85, `bm_george` 0.9, the owner's choice), and its
  pronunciation list is `LISTS` (`af_heart` `us`, `bm_george` `gb`: Him
  reads British, the owner's "british is fine"). No other
  file of `src/natural` names a pack path, and the Swift module outside
  `kokoro/` names no voice and no speed: the voice is data.
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
- **Prosody.** `prosody(utterance, chunk, ids, speed)` runs a chunk's ids
  at the voice's speed through the chain's first four stages and returns
  each id's frames and Prosody's pitch curve (`f0`, Hz, two points a
  25 ms frame, 12.5 ms a point) with its ms; it keeps what the last three
  stages read for that chunk in the module, and logs
  `[natural] prosody utterance= chunk= ids= frames=<Σ> points=<2Σ> ms= speed=`.
  A non-finite curve throws `nonfinite` and ends the reading. The frames
  are fixed here, a stage before the curve, so no curve sent can change
  the audio's length.
- **The Gentle fall.** `src/natural/fall.ts`, `fallOf(f0)`, is the rule,
  pure: the owner's Gentle fall, each phrase's last ~450 ms gliding to
  2 semitones under its middle, any final rise held level first. A point
  is voiced above `VOICED_HZ` (10 Hz, the vocoder's own threshold); the
  middle is the median of the voiced points; a point is pitched when it is
  voiced and at most `PITCH_FLOOR` (6) semitones under the middle, which
  leaves out Kokoro's consonant dips, ramps and Him's creak. The window is
  the pitched points within `FALL_WINDOW` (36 points, 450 ms) of the last
  pitched one, and each of its points becomes the lower of the running
  minimum of the curve over the window and a glide even in semitones from
  the window's first point to the target, `FALL_DROP` (2) semitones under
  the middle. Every other point stays, no point rises, the length is kept,
  and a curve with no voiced point is given back as it came. There is no
  smoothing, and the rule is not idempotent (the middle moves).
  `fallMeasure` and `hasFallen` measure how a curve sent ends against the
  prosody's own (the probe's `fall` line). `data/kokoro-curves.json` holds
  32 of Prosody's real curves (Her and Him, Isaiah 41:10 and Psalm 23:1-3,
  numbers only, 0.1 Hz), which the rule's test falls to 2 semitones or
  more under their middles; on them the planner's Mac runs ended between
  −2.0 and −5.9 semitones, and the vocoder followed the curve sent to a
  median of about 0.2 semitones.
- **Rendering and playing.** `render(utterance, chunk, f0)` runs the
  chain's last three stages on the curve it is sent, in place of
  Prosody's own, one render at a time off the main actor, on the one chain
  prosodies run on, and returns each id's frames, the sample count and the
  first and last audible sample (`abs(x) > 0.01`; `samples` and `-1` when
  none). A chunk's prosody is used once: a chunk with none held (never run,
  another reading's, or dropped by a halt, a stop or a voice change) throws
  `stale`, and a curve not exactly as long as Prosody's or with a point
  not finite throws `curve` and ends the reading. It logs
  `[natural] render … speed=<s> points=<n> lowered=<l> raised=<r>`, the
  points sent more than 0.01 Hz below and above Prosody's own. JS checks
  `samples = 600 × Σframes` and `0 ≤ first ≤ samples`, `-1 ≤ last < samples`
  (whole numbers), else the render's frames do not fit, and gives `play`
  each word's start moved into the cut (`startsWithin`), the cut's `from`
  and `to` and the chunk's `rest`. `play` schedules `pcm[from..<to]` at
  the timeline sample `at`, right after the chunk before it and that
  chunk's rest (a late render plays at the clock plus 100 ms), each word's
  mark at `at` plus its start, and throws `cut` for `from < 0`,
  `to > samples`, `from ≥ to` or `rest < 0`; the last chunk's end is its
  last sample, so `finish` waits out no rest. It logs
  `[natural] play … from= to= rest= at=`. On a device it plays on one
  `AVAudioEngine` player at 24 kHz and sends `start`, a `range` at each
  word's mark and `finish`; on the simulator it plays nothing, logs
  `[natural] play … skipped=simulator`, and sends the same events by a wall
  clock. Events go only to the held reading, matched by generation, so a JS
  reload's reused ids cannot collide; an interruption or an engine
  configuration change (a route change) ends it as `interrupt`. The module
  never sets the audio session. A prosody of chunk 0 writes the marker
  `natural/reading`, removed when the reading ends; a marker found at
  start says `crashed` once.
- `src/natural/module.ts` is the module's seam (`NaturalModule`, a
  `Context.Service`); `src/natural/source.ios.ts` is it over the Swift
  module, the only importer of `Natural.swift`, and `src/natural/source.ts`
  is every other platform's, which holds nothing and refuses each call.
- `src/natural/voice.ts`, `naturalVoiceSource(lexiconFor)`, is a `VoiceSource`
  over the module, so `src/voice.ts` reads with it unchanged: a speak stops
  the module, fails `VoiceUnavailable` for a voice not in `VOICES`, else
  plans the text over `lexiconFor(voice)`, the speak's own voice's list
  (`route.ts` and the probe pass `lexicon`), loads the speak's voice (`<voice>.bin`), then runs each
  chunk's prosody, renders it and plays it, chunk by chunk
  (the next chunk renders while one plays). `curveFor(chunk, last, prosody)`
  gives the curve a chunk renders on: none when the prosody does not fit
  (its frames fail `startsOf`, or its curve is not exactly two finite points
  a frame), `fallOf` of it when the chunk ends a phrase or the reading
  (`chunk.rest > 0` or the last chunk), else Prosody's own, unchanged, for a
  chunk inside a phrase over `CHUNK_CAP`. A failed prosody, a curve that
  does not fit or a failed render ends the chunk: chunk 0's fails the
  speak; a later chunk's stops the module and sends `interrupt`. A speak
  let go (stopped, replaced or ended) returns at once.
- **The probe.** `app/probe/natural.tsx` (`heartseed://probe/natural?base=…&voice=…&soak=…`)
  is a development probe that renders, starts and writes nothing in a
  release build. When its link names `base`, it first writes that base
  under `heartseed/natural/base` in the app's store, once per open, never
  removed, for Today's download. It reads in the link's `voice`, one of `VOICES` (else
  `af_heart`), and shows it as `voice <name>`. `Install`, `Cancel`, `Load`, `Read` (Today's passage through the
  voice over the natural source), `Stop`, `Remove` and `Soak` (each verse
  rendered in canon order through `curveFor`, as the source renders, no
  play) show counts only, never a word
  (`src/natural/probe.ts`). Its `recording` module sees each chunk's
  prosody and the curve sent; the read's `fall <f>/<k> raised <r>` line
  counts the chunks with a voiced point (`k`), those sent a curve ending
  2 semitones or more under their prosody's middle (`f`), and the points
  sent above Prosody's own (`r`), and its `rtf` adds the prosody's ms to
  the render's. `.claude/skills/verify-heartseed/features/natural.md`
  drives it.
- **The model server.** `bun run natural:serve -- --port <p> --cache <dir>
  [--host 127.0.0.1|0.0.0.0] [--corrupt <path>]` (`scripts/natural-serve.ts`)
  fills the cache from Hugging Face at the pinned revision, checking each
  file and converting `bm_george.bin` from its rows (`fillPinned`), and
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
- `bm_george.bin` is the second voice, `bm_george`. FluidInference ships
  only `ANE/af_heart.bin`, so the copy converts `voices/bm_george.json` of
  the same repository and revision (`infra/models/voice-pack.ts`,
  `voicePackOf`): its keys `"1"` to `"510"` in numeric order, each a row of
  256 numbers, each written as a little-endian fp32, every other key
  ignored; 522,240 bytes, pinned by SHA-256 in `BM_GEORGE`. Any JSON that
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
bucket. `modelsCopy` takes its two jobs and its R2 writes as parts, so
`infra/models/copy.test.ts` runs the command's own handler over fakes. The cache is the one `natural:serve` uses, `tmp/natural-models/` at
the repository root, so files fetched by one are kept by the other.

- **The fill** (`fillWith` in `scripts/natural-serve.ts`, over
  `fetchPinned` in `infra/models/source.ts`, which the model server's
  `fillPinned` uses too): in list order, a cached file
  at its size and SHA-256 is kept and never fetched; any other is fetched
  from `resolve/2568276a60ff6e7f312afce3dc9e3f07521cb48d/ANE/<path>` (for
  `bm_george.bin`, `voices/bm_george.json`, converted), checked, written
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
5. `curl -sI https://models.heartseed.app/kokoro/2568276a60ff/bm_george.bin`
   answers 200 with `content-length: 522240` and both headers above.

### Cost

The 39 files are 83.3 MB, about 0.08 GB-month. R2's free tier is 10
GB-month, 1 million Class A and 10 million Class B operations a month,
account-wide, with free egress. If the account's hymn recordings already
pass 10 GB, the mirror adds at most one billed GB-month, $0.015 a month. A
copy is 39 PUTs and 2 listings (Class A), once; an install is at most 39
GETs (Class B) when the edge does not serve them.

## App icon and launch screen

Heartseed's mark is brand C, "Two leaves" (the owner's pick, 2026-11-08):
a seedling whose two first leaves open into a heart. Its one master is
`assets/icon/heartseed.svg`, a single path in a tight `viewBox`; every icon
and both launch screens' artwork are drawn from it by `bun run icon`
(`scripts/icon.ts`), and nothing is drawn by hand.

- **Colours.** Each comes from `src/theme.ts`, which the script and the
  native manifest (`vite/app.ts`) both read. The iOS icon is the ink
  `#2c4542` on a pale sage `#dfe8cf` in light, the pale sage on the night
  garden `#142420` in dark, and a white mark on black for the tinted style
  (`ios-light.png`, `ios-dark.png`, `ios-tinted.png`, opaque, the mark's
  box at 0.72 of the side). Android's adaptive icon is the ink's mark
  (`android-foreground.png`) on the pale sage, with a white monochrome
  layer (`android-monochrome.png`), both inside the launcher's safe circle.
  The launch screen is the mark in the app's ink on the app's ground,
  224 pt wide: `splash.png` in `#2c4542` on `#f1f0e6`, `splash-dark.png`
  in `#e6eedb` on `#142420`. The icon's ground is not the app's ground, on
  purpose, and the dark icon's pale sage is not the dark ink.
- **Appearance.** The manifest sets no `userInterfaceStyle`, so the app,
  its icon and its launch screen follow the system's appearance.
- **Changing it.** Edit the master or a colour in `src/theme.ts`, run
  `bun run icon`, commit the PNGs, then `bun run prebuild:native` (or
  `sim install --prebuild`) so a build copies them in. `test:icon` holds
  every committed PNG byte for byte to what `bun run icon` draws now, so a
  master or colour edited without a redraw is red; the PNGs are drawn by
  the declared `sharp`, whose version a redraw must keep.
- **Checking a build.** `.claude/skills/verify-heartseed/features/app-icon.md`
  reads the build's asset catalog and Info.plist; the icon on a home screen
  is the owner's look on his phone.
- **The home's icons** are drawn the same way, by `bun run home-icons`
  (`scripts/home-icons.ts`), with no react-native-svg. Each master in
  `assets/home/` is written in Palette A's hexes; `masters` in
  `src/theme.ts` maps each to the role it is drawn as, `kept` names the
  gold family's two shades drawn as written, and any other colour token
  fails the draw (`UnmappedColour`). Each scheme's recoloured master
  becomes a 144 × 144 PNG on a transparent ground (`density: 216`), with
  its `.d.png.ts` beside it. Redraw after editing a master, `masters`,
  `kept` or a role the masters use, and commit the PNGs: `test:home-icons`
  holds every one byte for byte to what the script draws now. A new name
  needs its master, a `HomeIcon` and a line of `ICON_IMAGES`. The dev
  server serves the PNGs through One's asset registry, so no native
  rebuild is needed for them; whether a release build bundles them is
  hsship's to prove.

## Look

Every screen is drawn in brand C's roles (`src/theme.ts`), in light or
dark as the reader's appearance and the system's say, and every text in SF
Rounded (`face`, `ui-rounded`), the verse's among them.

- **The reader's appearance.** `System`, `Light` or `Dark`, System by
  default (`src/appearance.ts`): stored under `heartseed/appearance`, its
  text exactly `system`, `light` or `dark`. The `Appearance` service reads
  it once, at the launch of the app's layer, through the layer's own
  store, and writes nothing then; a missing key, a failed read (logged
  `appearance.store.failed`, method `get`) and every other text (`Dark`,
  ` dark`, `"dark"`, `sepia`, empty) read as System (`appearanceOf`). The
  reader chooses it in home's Settings sheet (Settings, above;
  `AppearanceChoice`, `src/appearance/choice.tsx`, the radio group
  `Appearance`). A tap there shows its scheme at once, the sheet's own
  included, and writes the word under the appearance's key alone; writes go
  one at a time, so the store ends at the last tap's word whatever order
  they settle in; a refused write is logged (method `set`), the choice
  shown stays the one tapped for this launch, and the next launch reads
  what the store holds. It is never asked and never in the first minute:
  a reader who never chooses follows the phone.
- **The scheme.** `useScheme()` (`src/look.tsx`) is the one place it is
  decided: `schemeOf(choice, system)` (`src/appearance.ts`), Light and
  Dark their own, System dark when React Native's `Appearance` says
  `dark` and light for `light`, none or anything else. The root holds the
  launch's pending frame until the appearance is read as well as the
  garden, then shows it to every screen (`useAppearanceShown`,
  `src/appearance/shown.ts`) in the commit that first draws it, so no
  headed frame is drawn under another; until then, and after the root
  leaves, the choice counts as System. One listener to the system's
  appearance, held from the module's load, tells every mounted screen of
  a change, so under System the shown screen repaints in its next frame
  with no tap; under Light or Dark a flip of the system changes nothing.
- **The interface style.** On iOS the app's windows follow the choice
  (`src/appearance/host.ios.ts`: `Appearance.setColorScheme('light' |
  'dark')`, `'unspecified'` for System), so the status bar, alerts and the
  system's own controls match; in the tests and on the web it is a no-op
  (`host.ts`; react-native-web has no `setColorScheme`). Under a set
  style React Native reports that style and hears no change of the
  system, so the scheme comes from the choice, never from the hook alone.
  `userInterfaceStyle` in the native manifest stays the system's: no
  phone build carries the choice.
- **The launch screen** is drawn by iOS before any JavaScript, in the
  system's appearance: a reader who chose Light on a dark phone sees the
  dark launch screen, then the light app. Accepted.
- **The styles.** Each screen builds its styles once per scheme at module
  load (`themed((roles, face) => StyleSheet.create(…))`, giving
  `{ light, dark }`) and picks one by the scheme now (`useThemed`); no
  style is built per render. No product file outside `src/theme.ts` names
  a colour literal or a font family (`test:look`'s guard); the dev probes
  under `app/probe/` are left out of it.
- **The roles.** Every fill is a role of the scheme (`ground`, `card`,
  `soft`, the opaque `hearing`, the field's `gold`, `leaf`, `greenEar`,
  `soil`, `furrow`, and `sun`) and the one translucent fill is `pulse`;
  every text is `ink`, `quiet`, `miss`, `sun` (the day's gold ink, on the
  ground or a card) or `onInk` (on an ink fill: the big button, a chosen
  pill or grade, `Plant`), at WCAG AA on what lies behind it. `furrow` is
  the soil's second line (the field's dashed row, the icons' bodies), 45 %
  of the way from the ground to `soil`. `sun` is the home's greeting and
  its ready dot: `gold` measures 1.97:1 on the light ground, under the
  3:1 a meaningful mark needs, and the prototype's gold 3.75:1, under
  text's 4.5:1, so the light `sun` is a darker gold (4.88:1) and the dark
  one is `gold` itself. `src/theme.test.ts` gives every role a use (a
  text on its grounds, a ground, or decoration and why), so a role added
  with none is red.
- **Text under an opacity.** A pressed control (`useLook().pressed` from
  `src/sayit/draw.tsx`: the missed word's mark, the pills and radios, the
  bars' backs, the field's and Today's links, the chooser's picks and
  verses, `Plant`, home's end rows) draws at opacity 0.8, which
  keeps light `ink` at AA on what lies behind it (0.7 fell to about 4.0:1). A
  disabled control (`look.disabled`, 0.6: the big button while it cannot
  be pressed, a pill or `Plant` while a remove or a plant is pending) is
  left out of AA, as WCAG leaves it. The big button's press scales it
  (`look.pressedButton`) and changes no colour. `src/test/look.ts`'s
  `seenContrast` composes these opacities and `pressedFaults` holds each
  control pressed in turn (`test:dark-screens`, `test:dark-screens-b`,
  `test:dark-screens-dark`, `test:dark-screens-dark-b`).
- **What the tests cannot see.** happy-dom lays out nothing and draws no
  glyph: SF Rounded's metrics (a verse of 90 words, a long reference,
  the Today card's lines under large text, the chooser's rows wrapping, not
  clipping), the status bar's legibility in each scheme and the colours
  themselves are the owner's look on his phone. `app/probe/theme.tsx`
  (`heartseed://probe/theme`, development builds only) prints the
  system's own appearance, the stored appearance's text, the interface
  style React Native reports, the scheme, its ground and the face for the
  live check (`.claude/skills/verify-heartseed/features/appearance.md`).

## Tests

- The unit tests (`*.test.ts(x)`, not `*.slow.test.*`) run as parts, each a
  package script and a task of `turbo.json` that the commandless `test` task
  depends on, so the gate runs each as its own task and
  `bun run test:budget @manna/heartseed` times each alone (under 1 s). The
  `src` parts run with `src/test/setup.ts` as the preload (react-native-web
  for `react-native`, the bundled passage for `virtual:heartseed-passage`,
  the corpus for `virtual:heartseed-kjv`, the licence for
  `virtual:heartseed-licence`, a happy-dom document which prefers reduced motion,
  so the parts read the rest state without paying for animation frames;
  the motion tests turn motion on themselves, `src/test/motion.ts`);
  `test:infra`, `test:handbook-build`, `test:icon`, `test:home-icons`, `test:home-pixels`, `test:clock-reads` and `test:mirror` run with none.
  No test asks the host what time it is. A test's instant is a `Time`
  (`src/test/clock.ts`), a number the test owns from `START`
  (2026-11-10T15:00Z) and moves only by its own commands; `clockOf(time)`
  answers it, and every rig merges it into the app's layer
  (`Layer.provideMerge`), so the runtime's own reads take it too. A rig
  given no `time` runs at `START`. How long an `until` loop waits is
  measured apart, by `deadline(ms)` (`src/test/elapsed.ts`) on the host's
  monotonic clock, so a stalled wait still ends.
  The rigs of Today's run (`src/test/today-rig.tsx`, `stage-rig.tsx`,
  `session-rig.tsx`, `first-rig.tsx`, `phrase-rig.tsx`, `run-rig.tsx` and
  `wake-rig.tsx`) render `<Root />` as every other rig does, so a read
  launch with a plant lands on home, as a reader's does. There the rig's
  model alone picks the step: `Start` exactly when the model shows an
  item, after the rig has held home to its heading, `Start`, the model's
  counts line and `rootFaults`; in the done state, home's
  `Nothing to tend now` with no `Start`, then the walk's own way on (a
  generated walk ends the launch; `wake-walk` keeps home as a screen with
  an away, a wait and the launch's end; `first-rig` offers `Later` (the
  clock moved to the passage's due, then a relaunch), a relaunch and the
  late voice events; a fixed
  case names its way and asserts it). Every frame of these rigs is held to
  `rootFaults` (`src/test/root-rule.ts`), and an unread garden still opens
  Today with no `Your field` in any frame. `test:home-rigs`
  (`src/home/rigs.test.tsx`) holds each rig's entry to that: one read
  launch with the passage due per rig (screens `Your field` then `Today`,
  `Start` shown before the step, no root fault, Today's passage with
  `Say it`), a done-state launch (no `Start`, no Today frame) and an
  unread launch (Today alone).
  `session-rig` mounts `<Root />` for every launch, and no rig shows
  Today's choices. `today-rig.tsx`, `stage-rig.tsx`, `field-rig.tsx`,
  `first-rig.tsx` and `root-rig.tsx` mount `<Root />` and make their plan
  as a reader does (`renewBySettings`, `src/test/settings-rig.ts`):
  Today's `Your field`, home's `Settings`, a `Minutes` radio (the one
  checked when no minutes are named), `Done`, then `Start` when home
  offers it, every sheet shown held to `sheetFaults` and its look checked
  at least once. `run-rig.tsx`'s `launch` mounts `<Root />` for every
  launch, so every user of it does too:
  `footer.test.tsx`, `home/rigs.test.tsx`, `wake-rig.tsx` and the walks,
  which make their plan by the same trip through the sheet: the run walk
  (`src/test/run-walk.ts`), the reader walk (`src/test/reader-walk.ts`),
  the dark Today walk (`src/look/today.test.tsx`) and the wake walk
  (`src/test/wake-walk.ts`, its Minutes and its Voice both chosen in the
  sheet). `phrase-rig.tsx` mounts `<Root />` too, and makes its one
  Minutes making, while a long verse's recital listens, at the session seam
  (`Session.choose` on the mounted layer's session), since no reader
  reaches the sheet then.
  - `test:matcher`: `src/matcher.property.test.ts`, the matcher's generated
    recalls.
  - `test:hear`: `src/matcher` (the sounds-alike table's bounds, and each
    hearing in its word's place and nowhere else, against the model).
  - `test:voice`: `src/voice.property.test.ts` (the voice against its model,
    the choice over both keys) and `src/voice` (the read rule of the choice
    over every text of both keys and failed reads, `choose` in command
    order and in bursts, the native module's guards, and the seek against
    the model: a sought tail's ranges lighting the verse's words).
  - `test:reading`: `src/reading/words.property.test.ts` (the reading
    view's words: what each word shows over generated texts, and the word
    under a finger over generated layouts and points, each against its rule)
    and `src/reading/view.test.tsx` (the reading view mounted alone: each
    word's text, ink and selection over generated readings, and its hold
    through the gesture stand-in: the word held under the finger, one pause,
    one seek or one resume at the end, nothing for a swipe or a late end).
  - `test:reading-today`: `src/reading/today.test.tsx` (Today's reading
    view and hold through the root against the voice's model: the source's
    calls, one tick per hold, the reading view only while the piece is read,
    and the scroll view still exactly while held).
  - `test:dictation`: `src/dictation.property.test.ts` (the dictation
    service against its model) and `src/dictation` (the scripted source,
    the hints, the native module's guards, and a held consumer of
    `changes` through a 10,000-input burst keeping at most the window and
    ending at the current view).
  - `test:sayit`: `src/sayit.property.test.ts` (Say it against its model)
    and `src/sayit` but its cue tests and Today's (the source Say it
    hears, and its guards).
  - `test:sayit-today`: `src/sayit/today.test.tsx`, Today's Say it in
    happy-dom through `src/test/today-rig.tsx`.
  - `test:cue`: `src/sayit/cue.test.tsx`, and `test:cue-say`:
    `src/sayit/cue-say.test.tsx` and
    `src/sayit/cue-say-letters.test.tsx`, Today's cue in happy-dom through
    the same rig, reached from home by `Start`: the passage at rest under
    each stage's cue, a recital under letters and under the full text, a
    recital not heard, an unread garden, each cue word's exact first letter
    and its AA contrast, and no run of the verse outside its words.
  - `test:cue-held`: `src/sayit/cue-held.test.tsx`, every pending frame of
    a held launch at each stage, then home and `Start` after the release
    (Today directly on an unread disk).
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
    recall on the disk so the launch opens home, whose `Start` leads to
    Today, each stage's exact hand-drawn asset, full corn after a held
    launch, and no claim in any frame of a held launch), through
    `src/test/stage-rig.tsx`. Its drawing rule (`src/test/plant-image-rule.ts`)
    checks source, scheme, size, hidden state and still ancestors. The
    forbidden-frame scan reads every image's source even without ids or
    stage labels; only home and the actual end own their own images.
  - `test:today-reads`: `src/garden/today-reads.test.tsx`, the same stage
    over a failed read (every listing: no claim in any frame of the
    session, and the recital kept) and over another verse's plant at full
    corn, which never shows as the passage's.
  - `test:today-reads-b`: `src/garden/today-reads-b.test.tsx`, the same
    stage over an open failing every attempt (no claim in any frame, the
    recital not kept). Each reads part observes the passage's exact seed,
    blade and ear assets when read from disk, no forbidden image in any
    forbidden frame, nonzero forbidden frames and over ten observed looks;
    `test:today` observes all four stage assets.
  - `test:first`: `src/first/flow.test.ts`, `src/first/screen.test.tsx`
    and `src/first/screen-b.test.tsx`, the flow's reducer against its
    model (`src/test/first-model.ts`) and the first minute in happy-dom
    over the real store on the device, launched by `first-rig.tsx`'s
    `screenLaunch` (the journey to one seed, `Continue` to home in its done
    state and, at the next due, `Start` to Today at a seed; the voice off,
    a Next during a reading and a relaunch mid-flow, an unread launch, a
    held launch, and each letter in the cue's ink at AA contrast on its
    ground at rest and while its recital listens, while the hear phase's
    unread words, the phase line and the reference keep the mute; and every
    element of every phase at rest, of the hear phase reading and of the
    letters listening keeps its golden rows, with the letters' ink,
    Planted's drawing subtree and the hear phase's `reading` view named
    explicitly). Every frame is held to `rootFaults` and the first rig's
    image invariant: only Planted owes the large seed, not a named wrapper
    alone; pending, hear, letters, alone and failed writes owe none.
  - `test:root`: `src/first/root.test.tsx` and `root-b.test.tsx`, the root
    route on fixed devices
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
    `test:walk-planted`, `test:walk-reading`, `test:walk-taps`,
    `test:walk-today` and `test:walk-light`: each
    `src/first/walk-<group>.property.test.tsx`,
    the same rig over a few generated devices from one seed. The generator
    draws every input the rule names (any disk, the voice's choice and its
    old switch, and launch read, held or not; a speak that
    lands or is refused and every kind of voice event; a finger's hold on
    the hear phase's reading view, moved across words and lifted, canceled,
    or still down while the reading finishes or Next is tapped; recitals that hear
    any subset of the words, end every way Dictation ends, or are held open;
    writes that land, are refused or meet a down device that recovers;
    queued taps; a relaunch anywhere; on home `Start` when the model shows
    an item, else `Later` or a relaunch), steered toward the part's own
    group of coverage floors, which its generated devices alone must meet
    (`walk-today` holds Today's run after `Start`: Next, the done state,
    Renew through the Settings sheet (offered with no recital listening
    and no reading under way) and a write landing on Today; `walk-light` each end of a hold,
    and a sought reading's ranges in its own text). Every hear frame
    shows the reading view exactly while the voice reads, each word its
    direct child, and while a finger holds a word, that word as the read
    point and the one selected and the screen still; every settle holds
    the speaks (each the passage from its start), pauses and resumes to
    the model, and each hold to one tick.
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
    `src/field/phrases.test.ts`,
    the field with old pieces folded into their verses against
    `fieldFoldRule` (`src/test/phrase-model.ts`) over 600 generated gardens
    (held, removed and taught rows, old pieces sown none, some, beside a
    verse said whole or stale, near-miss references, every zone): `not
    planted` for a verse whose only plants are old pieces, a removed
    passage's old pieces as their verse's row by first recall, days sown
    over every recall and the harvest over verses alone.
  - `test:field-reach`: `src/field/reach.test.tsx`, Today's `Your field`
    outside its scroll view before and after a recital that grows the
    passage; a recital started in the turn of a tap on `Your field`, which
    keeps Today on screen through its result.
  - `test:field-reach-held`: `src/field/reach-held.test.tsx`, one view of
    Say it deciding both the control and home: with the root's news of Say
    it held back, a tap in the first frame that offers the control after a
    growing recital opens home.
  - `test:field-unread`: `src/field/unread.test.tsx`, no field and no
    `Your field` in any frame of a held launch until its read lands, then
    home, of an unread session (whose recital the next launch's home
    counts) or of the first minute.
  - `test:field-unread-keep`: `src/field/unread-keep.test.tsx`, an unread
    session whose listing and then its keep's read of its key fail, or
    whose every record read fails, while writes work: its finished recital
    is written with its zone's offset and the next healthy launch counts
    its day.
  - `test:field-screen`: `src/field/screen.test.tsx`, a launch on home,
    `Start` to Today, then home by Today's `Your field` and back by
    `Start`, in happy-dom over the real store on the device through
    `src/test/field-rig.tsx` (the rig lands on home, and holds every frame
    to the root's rule, `rootFaults` in `src/test/root-rule.ts`: one
    heading or the pending frame, `Your field` only on a read, quiet Today
    and About and never inside a scroll view, exactly one
    `‹ Add verses` back on the chooser's `Add a passage`, outside its scroll
    view, and none elsewhere, `Listening` only under Today, no control named `Today`, no
    `When I need…` on any screen, exactly one `Settings` on home inside its
    scroll view and none elsewhere, home's rule (`homeRuleFaults`: none of
    `id=counts`, `add-verses` or `add-row`, at most one `Add a list`, at most
    one of `Start`, `Practice anyway`, `Practice <reference>` and
    `Learn <reference>`, outside the scroll view, and no number in a
    plant), no text and no accessible name with a word range
    (`[<n>-<n>]`), and no `Minutes` group, `<n> min` or `Voice` on any
    screen, and home's and Today's nodes only under their headings; and
    while the host shows `Listening`, nothing that makes the plan in reach
    anywhere in the document, the sheet's portal included: no control named
    `Settings`, `Your field`, `Plant` (or starting `Plant `), `Add a list`,
    `Any passage` or `Remove` (or starting `Remove `), no `<n> min` radio, no `Minutes` group, no `Voice` and no
    `[aria-modal]` node, each `<name> in reach while listening`;
    and to the field's rules: the way back taken only after a read
    completed, and each field frame the
    rule's rows with their icons and captions, plants as buttons with
    their drawings (each image's source of the scheme now), days sown and
    harvest as seen and exposed, every text at AA contrast, and home's
    frame rules, `homeFaults`, among them `Add a list` drawn with its
    `add` icon of the scheme now, the Today card (`cardFaults`) fixed above
    the scroll view with its one full-width button, and the end rows inside
    it; each
    open and way back leaving the
    whole disk and taking no write, remove or clear; `Start` back only when
    Today showed `Say it` or `Next`, which it shows again): the way there
    and back through recitals, Again and a relaunch.
  - `test:field-garden`: `src/field/garden.test.tsx`, a generated garden past 140 other verses
    of any reference, canonical twins each its own plant, each label the
    exact reference, and no number in any plant.
  - `test:field-read`: `src/field/read.property.test.ts`, the field reader
    and all five readout minima against the independent plain reader in
    `src/test/field-read-model.ts`. Generated DOM-model commands cover style,
    class, topology, text, accessibility, stylesheet, scheme and mount changes,
    with successive read-only observations and explicit cache-distinction
    witnesses. This is a happy-dom oracle contract, not native rendering proof;
    media and pseudo states are checked only as happy-dom implements them.
    `src/test/seen.ts` scopes snapshots to one synchronous field or readout
    read. Cross-element reuse is reserved for multi-row fields; single-row
    fields keep node-identity reads without stylesheet-validation overhead.
    Only literal display/visibility/opacity/colour values under proven
    type/class/universal selector chains share values across elements, keyed
    by namespace, tag, class, complete inline style and every ancestor.
    Ordinary and adopted sheets are checked anew each time; contextual rules,
    variables, unknown rules, shadow contexts and other unproved inputs use
    node-identity-only reads. Terminal pseudo-elements do not paint an element's
    own computed style; an RNW legacy placeholder arm is ignored only after a
    full document query finds no match. Happy-dom does not apply keyframe values.
    No cache crosses calls, frames or mounts. `src/test/contrast.ts` accepts the
    same scoped style reader for the field; every other caller keeps the plain
    computed-style walk and the identical contrast formula.
    The rig loads its style reader only on an actual read; parts importing only
    its labels or layout rules do not load that machinery.
  - `test:field-walk`, `test:field-relaunch`, `test:field-grades` and
    `test:field-again`: `src/field/walk.test.tsx`,
    `walk-relaunch.test.tsx`, `walk-grades.test.tsx` and
    `walk-again.test.tsx`, one generated device each (seeds 3, 60, 12 and
    31), generated sequences of opens, ways back, recitals, Again, peeks
    and relaunches through `src/test/field-walk.ts` (each launch on home,
    then `Start`; in the done state, with no `Start`, a relaunch at the
    passage's due), each command's writes
    modelled apart from the app; each file's device reaches its own floors
    (relaunches, or Again).
  - `test:field-bar`, `test:field-bar-lists`, `test:field-bar-adds`,
    `test:field-bar-kinds` and `test:field-bar-held`:
    `src/field/bar-remove.test.tsx` and `bar-twice.test.tsx`, then
    `bar-lists.test.tsx` (seeds 120 and 122), then `bar-adds.test.tsx`
    (seeds 110 and 125), then `bar-kinds.test.tsx` (unread kinds), then
    `bar-held.test.tsx` (read lists of 1, 2 and 4 held), generated readers
    through `src/test/bar-walk.ts` over `src/test/bar-rig.tsx` (the root
    over the device's store, whose passages' key alone may fail its reads,
    under the app's layer teaching the collections a test gives, none by
    default, launched on home; every frame held to `rootFaults`, one heading,
    no remove, ask or alert on home, `Add a list` (`addFaults`)
    and the limit line under `Lists` inside it, no add beside the
    limit line, nothing offered over unread passages, a list's page's
    `Remove <name>`, ask and alert in its scroll view, every control of
    the page disabled while a remove is pending, and every seen text of
    the field, the page and the chooser at
    AA): stored lists of 0-5 or more passages with equal ones, garbled
    values and 1-3 failed reads; a round trip to Today by `Start` (over
    unread passages `Start` must show), then
    `Your field`; a row's `Open <title>`, then its `Remove`, then `Keep`,
    `Your field`, or the ask's `Remove` landing or refused, once, twice in
    one turn or with `Keep` in the same turn;
    `Add a list` to the Add a list sheet and its `Any passage`, then left by
    `‹ Add verses` and the sheet's `Done`, or planted; after every tap the
    sheet against `sheetWant` (every shelf closed) or closed, the field, its
    lists and the disk against `src/test/choose-model.ts` and the passages'
    model; each file's floors met by its own devices.
  - `test:field-bar-planted-a` and `test:field-bar-planted-b`:
    `src/field/bar-planted-a.test.tsx` (seeds 1, 14 and 16) and
    `bar-planted-b.test.tsx` (seeds 11 and 20), generated readers through
    `src/test/lists-walk.ts` (`walkListBars`) over the same rig: the
    promise planted, 0-2 stored passages (one now and then over a verse of
    a held list), 1-3 stored Handbook lists of at most 12 verses, now and
    then with an unknown id or an id stored twice, and a recall on a list's
    verse; a list furrow's `Open <title>` and its page's `Remove`, then
    `Keep` or the ask's `Remove` (landing or refused, once or twice in one
    turn, a refusal retried), a passage's the same, `Add a list` and a
    small list's `Plant`, or a relaunch; after every tap home's rows, add
    and limit line, or the page's ask and alert, against `fieldWant` over
    the lists held, both
    stored texts against `src/test/handbook-model.ts` (unknown ids kept in
    place), no recall written, and every frame held to the rig's rules;
    each file's floors met by its own devices.
  - `test:about`: `src/about/screen.test.tsx`, About through the bar rig:
    from home by `Settings` then the sheet's `About` (a button 44 pt tall,
    the sheet's frames held to `sheetFaults`), About's one heading, the
    credits word for word, the licence equal to the file, every text at
    AA, the way back, nothing written and a relaunch on home; About with
    no `Appearance` group and no foot, and home's fixed top with no
    `About`; a
    recital started while About shows brings Today; and the plugin serving
    `virtual:heartseed-licence` as `vite/licence.ts` prints it.
  - `test:settings`: `src/settings/sheet.test.tsx` and `rule.test.ts`.
    The sheet through the bar rig (`src/test/settings-rig.ts`:
    `watchSheet` holds every frame of the document to `sheetFaults`, the
    sheet's root down, beside the rig's `rootFaults` and `barFaults`), six
    launches zipping each key's stored classes (the minutes, the voice and
    its old switch, the appearance with its near misses, failed reads) over
    both systems: the `Settings` row's place (inside the scroll view) and
    size; the sheet's heading,
    `Done` outside the scroll view, its groups in order, the checked values
    by the read rules, every control 44 pt tall, every text at AA, its look
    again after a flip of the system; `Done`; nothing written; About and
    home's fixed top as `test:about` holds them. Then the choices rule's table:
    every screen heading and the pending frame, each of the six kinds
    (`Minutes`, `2 min` … `20 min`, `Voice`) alone and together, each a
    fault under the host on every screen, and the same kinds outside the
    host no fault. Then the listening table: every screen × `Listening`
    under the host or not × the place (under the host, or outside it where
    the sheet lies) × each kind alone and together (`Settings`,
    `Your field`, `Plant`, `Remove`, a `Remove <reference>`, the four
    `<n> min` radios, `Voice`, the `Minutes` group, an `[aria-modal]`
    node), 468 cells: while listening each kind is the fault
    `<name> in reach while listening` wherever it lies, while not none, and
    the frame's own faults stay.
  - `test:settings-ways` and `test:settings-ways-b`:
    `src/settings/ways.test.tsx` and `ways-b.test.tsx`, fixed cases: the
    no `Settings` on a list's own page, whose way back is disabled while a
    remove is pending and changes nothing in the remove's turn, and a
    failed remove's alert left behind with the page; About from the sheet
    and back with the sheet closed; `Done` and Escape closing with home's
    card and field kept and nothing written; a recital started under the
    sheet bringing Today; a relaunch closing it; no `Settings` on Today,
    the chooser, About, the first minute or an unread
    garden's Today, which shows no choices either; and a `10 min` and a
    `Voice` tap in the sheet ruling Today, which shows no choice.
  - `test:settings-walk-a`, `test:settings-walk-b` and
    `test:settings-walk-c`: `src/settings/walk-a.test.tsx`, `walk-b` and
    `walk-c`, generated readers against `src/test/settings-model.ts`
    through `session-rig`'s `launch`, which mounts `<Root />`:
    devices storing a passage of Psalm 119 with every verse planted and
    stored texts drawn from each key's classes, commands opening and
    closing the sheet (`Done`, Escape), Minutes, Voice and appearance taps
    (each refused 1 in 5), a flip of the system, About and back, a plant's
    tap (Today on its verse, bare of the sheet's choices) and back, `Start`
    and back, and a relaunch the next morning; after each, the sheet's
    checked values, home's Today card and `Start` by the plan made at the
    tap, home's one card, the disk and its writes against the model,
    and no root, rig or sheet fault; each part's floors met by its seeds.
  - `test:session`: `src/session.property.test.ts`, the daily plan
    (`planOf`) and Today's counts line (`countsOf`) against the rules
    written plainly in `src/test/session-model.ts` (ts-fsrs's due dates,
    days by their own arithmetic, zones by `Intl`), over generated gardens,
    pieces, zones, instants, absences and lengths, each case's coverage
    held to floors; and `src/session/service.test.ts`, the session service
    over a store in memory and a garden set by hand, under a test clock:
    generated launches hold the stored minutes (the four texts, bad texts,
    failed reads, refused writes, nothing written at launch) and the
    plan's moment (Today's first `begin`, each tap) to the same model; and
    `src/session/phrases.property.test.ts`, the migration of old pieces
    (Old pieces, above) at the session seam, model-based: 28 generated
    stores written as an earlier build wrote them (recalls under verses
    and under old pieces, at any stage and date, a piece planted today, a
    piece whose verse no list holds), then 18 generated launches, Minutes
    taps, taps on a verse, recitals and days each; after every step every
    stored record of the start is still stored byte for byte, every new
    record's reference is a verse's, no plan item, visit, hold or shown
    item names a piece, each verse's field stage is its own plant's, else
    `not planted`, and days sown never fall.
  - `test:header`, `test:header-c`, `test:header-b` and `test:header-d`:
    `src/session/header.test.tsx` and `header-c.test.tsx` (devices 1-2 and
    3-4, the four valid stored minutes), `header-b.test.tsx` (devices 0
    and 5, the key absent and a bad text) and `header-d.test.tsx` (devices
    6 and 7, a bad text and the first minute), each its own seed, of
    `src/test/header-walk.ts`: the reader's choices across launches, read
    in the Settings sheet, through `src/test/session-rig.tsx` (every frame
    held to `rootFaults`, so no choice under the host) and the sheet's rig.
    Generated devices and launches (stored minutes, the voice's choice and
    its old switch, failed reads, unread and held listings, the first
    minute): a read launch lands on home, held to the model's counts and
    `Start`, opens the sheet, which shows the values read on its first
    frame (`seen`, noted from the document's modal on every mutation),
    closes it by `Done`, then `Start`, or in the done state the launch's
    end. Every Minutes and Voice choice is a trip from Today (`Your field`,
    the `Settings` row, the radio or `Voice`, the plan made at a Minutes tap and
    home's Today card under the sheet the new plan's, `Done`, then `Start` or
    home's done state), with refused writes; an unread launch offers no
    choice; while Say it listens nothing that makes the plan is in reach in
    the document (`listening:bare`); a renewal at the due is a Minutes trip
    that ends on Today with `Say it`; and the disk is held (the old switch
    never written). `header.test.tsx` also holds that a pending frame with
    the session's and the voice's views at hand shows no choice and no
    counts.
  - `test:pill`: `src/session/pill.test.tsx`, the `Voice` button in
    home's Settings sheet through the same rig and the sheet's
    (`src/test/settings-rig.ts`): from each start (the choice `her`, `him`
    or `off`, only the old switch `false` or `true`, junk over `false`,
    nothing), at the sheet's open and after each of four taps, one button
    labelled `Voice` in the sheet, its word and value, its fill and its
    height, each tap's stored choice and the old key unchanged, and a
    relaunch's sheet showing the last; two taps in one turn cycle twice; a
    refused write then a relaunch. Each launch closes the sheet by `Done`
    and takes `Start` to Today, which shows no `Voice`, with no fault in
    the launch or the sheet.
  - `test:counts`, `test:counts-d`, `test:counts-b`, `test:counts-e`,
    `test:counts-c` and `test:counts-f`: `src/session/counts.test.tsx`
    (devices 0-1), `counts-d.test.tsx` (2-3), `counts-b.test.tsx` (2-3),
    `counts-e.test.tsx` (4-5), `counts-c.test.tsx` (2-3) and
    `counts-f.test.tsx` (4-5), each its own seed of
    `src/test/counts-walk.ts` and its share of its pair's floors (a pair
    is cut by devices to keep each part under its budget; `bun run seeds`
    finds a part's seeds), Today's counts line through the same rig,
    home's line held to the same counts at each launch: generated devices
    (fresh installs planted
    through the first minute in the evening or the day, disks of the
    passage's history beside verses no piece names), launches in zones
    that change, at an evening planting's morning, the next 04:00 and the
    passage's due, unread and held, and commands (recitals heard, missed,
    unheard, refused or unwritten, a recital then a Minutes choice, Again,
    Minutes choices now and after time passes, Voice choices, time, the
    field and back); after every step the line is
    `src/test/session-model.ts`'s counts of the plan it made at home's
    first show and at each Minutes tap, over the disk's recalls, and an
    unread launch shows no line in any frame. Every Minutes and `Voice`
    choice is the reader's trip through home's Settings sheet (the sheet's
    rig holding its frames): `Your field` to home held to the model, the
    sheet's Minutes radio checked at the launch's minutes, the tap (the
    plan made at it, the radio checked and home's Today card under the sheet
    the new plan's; or the pill the cycle's next), `Done`, then `Start`
    when the model shows an item, else home's done state ends the launch.
    An unread launch offers no Minutes, `Voice`, Settings or `Your field`.
    A Minutes choice while Say it listens is no reader's, and
    `test:session-cells` floors it.
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
  - `test:session-cells`: `src/session/cells.property.test.ts`, a Minutes
    making while the held item's recital listens or finishes, which no
    reader reaches from the screen (the Settings sheet is on home alone):
    generated devices over `appLayer` (four to six short pieces in two
    groups, or a crowded garden, planted weeks back, 10 or 20 minutes
    stored, in a zone of `ZONES`), each round Say it through `pressToday`
    over the real Dictation and SayIt and a scripted recognizer, a
    `Session.choose` while it listens or finishes, the recital ended heard,
    unheard, refused by the store or cancelled, then `Next`; after every
    step the plan (`planModel` at the making), the hold (kept under way,
    `src/test/run-model.ts`) and `shownOf` the held item with its own
    piece, else the model's first open item, else `Done`, and a recall
    kept exactly when heard. Its floors are the 14 cells of moment, ending
    and placing (`moved` or `kept` by the new plan with no hold), and the
    making's place for the held item (first, left out, not first).
  - `test:run`: Today's run through `src/test/run-rig.tsx` (pieces given
    to `appLayer`, a recognizer that hears the text a test names, at once
    or held back while the recital finishes, Dictation's cancel, refused
    recall writes and unread listings; every frame held to `rootFaults`,
    and every Today frame to the footer rule: no control in the scroll
    view but a missed word's mark, at most one action button):
    `src/run/footer.test.tsx`, home's `Start` on a due device, then the
    action button and the grades under the scroll view through a recital,
    a grade and the field and back. `src/run/tended.test.tsx`, `Tended`
    alone in both schemes over generated lists (its line, one image per
    verse named `<reference>, <stage>`, its children hidden, the look,
    and, with motion on, each image's entry and sway equal to
    `endMotionOf` and the rule written out, over generated lists of 0-14
    verses, with `motionFaults` empty);
    `src/run/rule.test.ts`, the root rule's clauses for the end over
    hosts built by hand, one cell per clause.
  - `test:run-walk`, `test:run-cues`, `test:run-cues-b`, `test:run-hold`,
    `test:run-hold-b`, `test:run-relaunch`, `test:run-relaunch-b`,
    `test:run-edges`, `test:run-done`, `test:run-end`, `test:run-end-b`,
    `test:run-end-c`, `test:run-cells`, `test:run-cells-b`,
    `test:run-cells-c`: `src/run/run.test.tsx`, `cues.test.tsx`,
    `cues-b.test.tsx`, `hold.test.tsx`, `hold-b.test.tsx`,
    `relaunch.test.tsx`, `relaunch-b.test.tsx`, `edges.test.tsx`,
    `done.test.tsx`, `end.test.tsx`, `end-b.test.tsx`, `end-c.test.tsx`,
    `cells.test.tsx`, `cells-b.test.tsx` and `cells-c.test.tsx` (each
    `-b` or `-c` file one or more whole devices cut from its parent's case,
    the parent's floors split so that each is met in one of them), Today's
    run against `src/test/run-model.ts` (over
    `src/test/session-model.ts`'s plan) on generated devices through
    `src/test/run-walk.ts` (each read launch on home, held to the model's
    counts and `Start`, then `Start` when the model shows an item, else
    the launch's end), each shown word held to its piece's cue,
    leaning toward whole plans (many pieces and groups, Next, every
    recital's ending, Again). A Minutes command is the reader's trip:
    `Your field`, home held to the model, the Settings sheet, the
    `<n> min` radio (the model's plan made at that tap, the minutes key
    written), the radio checked and home's Today card under the sheet equal to
    the model's, `Done`, home held again, then `Start` when the model
    shows an item, else the launch ends on home's done state; every sheet
    held to `sheetFaults`, its look checked at least once. An unread
    launch shows no `Settings` and no Minutes. The cases lean toward the
    hold's moments (a recital, then the trip with its item still held,
    whose plan holds the item first or leaves it out, a trip after an
    unheard recital, home and back, a relaunch), the edges (the first
    minute, the done state, unread launches, zones), the recital's endings
    (cancelled, finishing, and a trip after each ending that kept nothing)
    and a trip after each ending (every ending and whether the new plan
    moves the held item or keeps it first, `CELLS`); each case's floors
    met by its own devices. A trip to the field with an item held is
    tallied by what the model shows once it lets the item go
    (`field:held:last` nothing, `field:held:again` the held reference,
    `field:held:more` another item), and as `field:held:next:<kind>` when
    Today showed `Next`: `run.test.tsx` floors `field:held:next:last`,
    `relaunch.test.tsx` `field:held:again`, and `end-b.test.tsx` and
    `cues-b.test.tsx` `field:held:next:more`. A Minutes making while the recital listens or
    finishes, which no reader reaches, is `test:session-cells`'.
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
  - `test:wake-walk`, `test:wake-returns`, `test:wake-quiet`,
    `test:wake-quiet-b`, `test:wake-clocks`, `test:wake-clocks-b`:
    `src/wake/wake.test.tsx` with `wake-b.test.tsx`, `returns.test.tsx`
    with `returns-b.test.tsx`, `quiet.test.tsx`, `quiet-b.test.tsx`,
    `clocks.test.tsx` and `clocks-b.test.tsx` (each steer's devices cut
    into parts of whole devices, each part under 0.9 s alone), Today's run walked through
    `src/test/wake-walk.ts` over `src/test/wake-rig.tsx` (the run rig with the
    host's state in the test's hands, each state sent taken by the session
    before the next step) against `src/test/wake-model.ts`, each read
    launch on home (`Start` when the model shows an item; in the done state
    home stays the screen, with an away, a wait or the launch's end, and
    `Start` once a return makes an item), leaning toward
    returns at every run state (the done state, a review, the new piece,
    Next pending, after an unheard recital or a refused write, on the
    field, every minutes choice), toward the returns that change nothing (a
    recital listening or finishing, the first minute's phases, unread
    launches, `inactive` alone and a second `active`) and toward the clocks
    (aways of minutes to a month, many returns, zones, evening plantings).
    The walk chooses as a reader does: its Minutes and its Voice are trips
    from Today's `Your field` to home's Settings sheet and back through
    `Done` and `Start` (or home in the done state), the plan made at the
    sheet's `<n> min` tap and the sheet's radio and home's Today card
    under it checked before `Done`; one trip in five sends host states
    with the sheet open (a return that makes the plan again under the
    sheet, or a sequence that is none), the sheet still shown and home's
    counts line under it the model's; `returns.test.tsx` floors a return
    under the open sheet whose new plan moves home's Today card
    (`wake:sheet-return-differs`). A recital listening or finishing is
    followed by the trip once it ends: a Minutes making under a recital,
    which no reader reaches, is `test:session-cells`'. An unread launch
    offers no `Settings`, `Voice` or Minutes, and every tap of an absent
    control fails; each case's floors met by its own devices.
  - `test:wake-edges`: `src/wake/edges.test.tsx`, the first minute's phases
    and Continue's own plan on home, the pending frame and a subscription read in
    the background, an unread garden's result, a return while a recital
    finishes, and 03:50 and 04:10 after a planting at 21:00 in Los Angeles,
    Kathmandu and Lord Howe; and `src/wake/listen-edges.test.tsx`, Listen at a
    90-word new piece after a review (two taps in one turn read once), a
    refused speak, and Say it stopping the voice before the recognizer
    listens.
  - `test:wake-listen`, `test:wake-listen-b`, `test:wake-reading`,
    `test:wake-reading-b`: `src/wake/listen.test.tsx`, `listen-b.test.tsx`,
    `reading.test.tsx` and `reading-b.test.tsx`, the same walk leaning
    toward Listen with `wake-rig.tsx`'s reading voice: where Listen shows
    at every settle (`listenModel`) and in every frame, the text each speak
    reads, Voice taps in the Settings sheet (the sheet's `Voice` value, the
    stored choice and the reading checked after each tap), and each way a
    reading ends or goes on (its finish or interruption, Say it, a tap
    onto Off, a relaunch; a Minutes trip, a return, the field, a tap from
    Her to Him, the reading going on through home and the sheet); each
    case's floors met by its own devices.
  - `test:wake-end`: `src/wake/end.test.tsx`, the same walk leaning toward
    Listen on devices the other wake parts do not walk: a return taken
    while the end (`The field is tended`) shows, its making dropping the
    run, and the new plan's item ending the end.
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
    of the app's own pieces and of passages, against the model's, every
    piece a whole verse of its range with no `phrases` key, long verses
    among them.
  - `test:passages-lists`: `src/passages/lists.test.ts`, 700 generated
    devices of both stored texts (the passages' and the lists'), read faults
    per key, adds, removes, plants and uproots, alone and at once, with
    refused writes and relaunches, judged against `test/handbook-model.ts`
    at every step: the answer, the view, both stored texts, the writes each
    key took and no read after the launch.
  - `test:passages-session`: `src/passages/session.test.ts`, generated
    devices walking adds, removes, adds and removes at once, Minutes,
    holds, recitals and returns
    through `addPassage` and `removePassage` over a store that yields at
    every call, the plan, the hold, the pieces and the disk judged against
    the models at every step; and a reader's first three days in five zones.
  - `test:passages-session-lists`: `src/passages/session-lists.test.ts`,
    `addList` and `removeList` over the session: a landed plant makes the
    plan again over the passages, the list, then the taught collections, a
    landed uproot makes it again without the list, its recalls kept, no
    plan made when none was, and no making on any other answer.
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
    passages and every other key against the models, and the stand-in's
    count of leaves by the first back (`onBack`) and by an add (`onAdded`)
    each against the walk's own; each file's floors met by its own devices.
  - `test:reader-today`, `test:reader-unread`, `test:reader-add`,
    `test:reader-add-b`, `test:reader-add-back` and `test:reader-remove`:
    `src/chooser/reader-today.test.tsx`, `reader-unread.test.tsx`,
    `reader-add.test.tsx` with `reader-add-b.test.tsx` (one device each,
    which together meet the floors one device met before the sheet came),
    `reader-add-back.test.tsx`, and
    `reader-remove.test.tsx` with `reader-remove-b.test.tsx`, generated
    readers through
    `src/test/reader-walk.ts` over the run's rig (the root over a disk, a
    recognizer that hears the verse said, a frozen clock, a zone, launched
    on home), in UTC, Los Angeles, Kathmandu, Lord Howe and Chatham,
    through home (`Start` when it offers it, else a relaunch the next
    morning, a remove asked, kept, refused or tapped twice), Today
    (`Say it` then `Next`, Minutes by the trip through home's Settings
    sheet: `Your field`, `Settings`, `<n> min`, `Done`, home held to the
    new plan, then Today again; `Your field`, a relaunch after the next
    04:00) and the chooser (reached by `Add a list` and the sheet's
    `Any passage`, left from the books by `‹ Add verses` and the sheet's
    `Done`; backs, taps by pattern, `Plant` refused,
    retried or tapped twice); the sheet against `sheetWant` with every
    shelf closed while it shows and closed otherwise; a tap of a control the screen does not show
    is a fault; every sheet held to `sheetFaults`, its look checked at
    least once; after every command Today's shown verse,
    counts line and `Listen` against the plan made at each making over the
    reader's pieces, home's Today card and `Start` against the same plan, the
    field and the chooser against `src/test/choose-model.ts`, and the
    disk; every frame of every screen held to `barFaults` and `rootFaults`; each
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
    passage and no `Remove` on its page, and no taught row with the part left
    out.
  - `test:handbook`: `src/handbook`. `content.test.ts`, the Handbook lists
    (`src/handbook.ts`) over the committed data through the app's corpus:
    `HANDBOOK` equal to `data/handbook.json`, the totals pinned (25
    sections, 130 lists, 2,528 ranges, 3,542 verses, 15 skipped by reason),
    none of the eight left-out sections, no empty section or list, every
    range 1-20 verses of its chapter with text, ids unique as
    `bhb-<para>` and none a promise collection's, the source and no title
    holding "doctrine", each list's pieces and field row, . `lists.property.test.ts`, a Handbook
    list as a list of the field and the session against
    `test/handbook-model.ts`: all 130 lists (id, title with ` (n)` past a
    title's first use, distinct verses in Haskell's order), `listsOf` and
    `piecesOf` over generated views of passages and lists sharing verses
    (own, passages, lists, taught), and one plant per verse over generated
    gardens, the field made without the lists giving the same stages,
    days sown and harvest.
  - `test:home`: the home's pure rules against the plain model
    `src/test/home-model.ts`. `src/lists.property.test.ts`: `placeOf` over
    the first and last verse of every chapter and near misses, `listsOf`
    against `listsModel`, `fieldPassagesOf`'s rows as before, and one plant
    per verse across overlapping lists. `src/home.property.test.ts`: the
    furrows over generated gardens against `furrowsModel` (on
    `fieldFoldRule`), `iconOf` over all 66 books, `readyOf` over plans and
    arbitrary items, and the greeting at every minute in the 15 zones of
    `src/test/zone.ts` read through `Intl`, the daylight-saving days and the
    edges. `src/home/grown.property.test.ts`: `grownOf` against
    `grownModel` over generated histories, Again included, and `tendedOf`
    against `tendedModel` (`src/test/run-model.ts`) over plans, visits,
    holds, unread gardens and items with no piece.
    `src/home/rule.test.ts`: home's rule (`homeRuleFaults`, the guard of
    `docs/lessons.md`'s `heartseed-home-one-start`) fed one offending frame
    per clause, each fault named, a clean home and other screens none;
    and the root rule's word-range clause (the guard of `docs/lessons.md`'s
    `heartseed-verses-whole`): a frame with a word range in a text and in an
    accessible name, each fault named, on any screen and the pending frame
    too, and none for a reference alone.
  - `test:home-today`: `src/home/today.property.test.ts`, the Today card
    (`todayOf`) over `src/test/home-model.ts`'s generated devices (old
    pieces stored beside verses, passages read and unread, every stage, equal last recalls):
    `Start` exactly when `beginsOf`, `Practice anyway` on the weakest
    planted verse, a planted canon verse never leaving no button, `parts`
    never counting more verses than the headline, and the singulars.
  - `test:home-shelves`: `src/shelves.property.test.ts`, the shelves
    against `shelvesModel` (the collections derived as those not taught,
    every pick and promise choosable, ids unique, no paid words) and
    `offerStateOf` against `offerModel` over generated fields and passages.
  - `test:shelves`: `src/shelves/sheet.test.tsx`, the Add a list sheet
    (`src/shelves/sheet.tsx`) beside a stand-in home
    (`src/test/shelves-rig.tsx`, every frame of the document held to
    `addSheetFaults`) against `sheetWant` (`src/test/shelves-model.ts`):
    each offer's state over generated passages and fields; and
    `src/shelves/rule.test.ts`, the root's rule at the sheet's seams with no
    app: `Your field` on `Add a passage`, the `‹ Add verses` back zero, one
    or two times on every screen, in a scroll view or not, home's own
    `Add a list` taken for no back, and `Plant <title>`, `Add a list` and
    `Any passage` in reach while listening, each cell exactly its faults.
  - `test:shelves-b`: `src/shelves/sheet-b.test.tsx`, the sheet's single
    cases over the same rig: `Full` by stale props as the limit line, a
    pending plant blocking every control and the close, and no paid word or
    verse text on any of the first 17 shelves.
  - `test:shelves-lists` and `test:shelves-lists-b`:
    `src/shelves/sheet-lists.test.tsx`, each Handbook offer's state and the
    limit line over generated passages, lists and fields on four Handbook
    shelves; and `sheet-lists-b.test.tsx`, a list's `Full` and `Held` by
    stale props, a pending list plant blocking every control and the close,
    and no paid word or verse text on three Handbook shelves.
  - `test:shelves-walk-a`, `test:shelves-walk-a-b`, `test:shelves-walk-b`,
    `test:shelves-walk-b-b`, `test:shelves-walk-c` and
    `test:shelves-walk-c-b`: `src/shelves/walk-a.test.tsx`,
    `walk-a-b.test.tsx`, `walk-b.test.tsx`, `walk-b-b.test.tsx`,
    `walk-c.test.tsx` and `walk-c-b.test.tsx`, two devices each,
    generated readers through `src/test/shelves-walk.ts` over the same rig:
    no passages, 1-3 held, 4 held or a garbled value, the promise planted
    or not and a loose verse recalled; shelves opened, switched and closed,
    `Plant` landing or refused, tapped once, twice in one turn, then `Done`
    in one turn or with its write held, then a retry, a shelf or leaving;
    `Done`, Escape, `Any passage` and the stand-in's `Add verses`; after
    every command the sheet, the counts, the stored passages and every
    other key against the models; each file's floors met by its own devices
    (a: the adds that land; b: refusals and the ways out; c: the stored
    values, shelves and offers in the field; each `-b` file the other half
    of its letter's devices); they walk the first 17 shelves.
  - `test:shelves-walk-lists-a` and `test:shelves-walk-lists-b`:
    `src/shelves/walk-lists-a.test.tsx` (seeds 2, 3, 6 and 11) and
    `walk-lists-b.test.tsx` (seeds 1, 4, 13 and 15), generated readers
    through `src/test/lists-walk.ts` (`walkListShelves`) over the same rig:
    0-3 picks held, the lists' key absent, `[]`, held (with an unknown id or
    an id twice) or garbled, a loose verse of a small list recalled;
    Handbook shelves and shelves of picks opened, switched and closed,
    `Plant` on a small list or a pick landing or refused, once, twice, then
    `Done` or held, a refusal retried; after every command the sheet, the
    counts and both stored texts against the models (a: the list plants; b:
    the devices, a pick beside a list, the limit and an unread lists' key).
  - `test:shelves-root`, `test:shelves-root-b` and `test:shelves-root-c`:
    `src/shelves/root.test.tsx` (seeds 1576 and 13), `root-b.test.tsx`
    (seeds 1421 and 430) and `root-c.test.tsx` (seeds 834, 5, 59 and 6),
    the Add a list sheet under the real `<Root />` through
    `src/test/root-sheet-walk.ts` over `src/test/bar-rig.tsx`, one world a
    case: the collections the app's layer teaches (none, protection alone,
    several with protection in either order, several without it, an
    unknown id before or after a known one), 0-3 stored passages (a pick
    whole or in part, Proverbs 18:10, a range of the protection collection,
    a promise of a shelf) or unread ones, the app's own verse planted or
    not and a loose planted verse; the sheet opened by `Add a list`, up to
    four shelves, one `Plant`, the sheet opened
    again on that shelf, `Done`. After every command the sheet against
    `sheetWant` over rows of verse membership (the app's own row, the held
    ranges and the taught collections by `listsModel`, each planted verse),
    each offer reading `In your field` exactly when home under the sheet
    draws a plant for every verse of it, home's rows against `fieldRule`
    and `fieldPassagesModel`, the stored passages and every other key; no
    `Add a list` over unread passages or at 3 held; each case's floors met
    by its own world.
  - `test:home-start`: `src/home/start.property.test.ts`, a start at the
    session seam, walked as `test:session-visit` walks a visit: after every
    step the plan, the hold, the visit against `startModel`
    (`src/test/promise-model.ts`), its piece, `shownOf`, the counts and the
    disk, byte for byte the same across every `start`; each verse class's
    floor met, and a start before `begin` and over an unread garden; a
    bare canon verse starting fresh, whole, under its own reference, old
    pieces of it planted or not, the plan's own fresh item returned
    unchanged, and no second fresh item for that verse once its recall
    lands.
  - `test:home-screen`: `src/home/screen.test.tsx`, the field in home's
    layout through `src/test/bar-rig.tsx` (launched on home, every frame
    also held to `homeFaults`), in light and in dark, its expected values written out:
    the fixed top and the scroll view and what each holds, the Today card
    and the end rows at AA, the
    furrows' icons of the scheme, one tap on a plant opening Today on its
    verse (a seed in its second furrow, a verse not planted, another seed),
    no plant left selected back on home, `Start` then on to Today, nothing
    written; and no add, remove or limit line over unread passages.
  - `test:home-clock`: `src/home/clock.test.tsx`, the field by the
    runtime's clock in light and in dark: a seed at its due after a
    Minutes tap marked with a dot filled `sun` at 3:1 against its plant,
    `gold` nowhere, the Today card and `Start` leading to
    Today writing nothing; and the greeting at each show of home at 11:59,
    12:00 and 18:00, and in Asia/Kolkata at 10:00Z (afternoon there).
  - `test:home-root` and `test:home-root-say`: the root's opening and its
    screens. `src/home/opening.property.test.ts`, `openingOf` over
    generated garden views (none, `Unread`, `Read` with 0-5 plants)
    against the opening's table written in the test, each row of the
    table met, and `shownOpening` over every pair. `src/home/root.test.tsx`, fixed
    launches through `src/test/field-rig.tsx` rendering `<Root />` with no
    prop, every frame held to `rootFaults` (and screened by
    `watchedLaunch`, `src/test/root-rule.ts`): a read launch with the
    passage due on pending frames, then home with `1 verse · about 1
    min` and `Start` in every home frame, no Today frame; an unread garden
    on Today with no field in any frame; garbled passages on home with
    `Start` alone and no card lines, `Start` opening Today
    on the app's passage; a held read on pending frames, then home; a
    relaunch after a plant's tap and `Your field`, on home with no plant
    selected and `Start` as the fresh plan gives it; and `Practice anyway` on
    home with nothing due, opening Today on the passage, then home again as
    it was. `src/home/root-say.test.tsx`, a fresh install's
    first minute through `Continue` to home in the done state (no `Start`,
    no Today frame after `Continue`), and Today
    with no `Your field` while Say it listens, then `Your field` to home.
  - `test:home-rigs`: `src/home/rigs.test.tsx`, the rig contract: each
    rig of Today's run (`today-rig`'s and `stage-rig`'s `mount`,
    `session-rig`'s and `run-rig`'s `launch`, `wake-rig`'s `wakeLaunch`,
    `phrase-rig`'s `mount`, `first-rig`'s `play`) launched on a read
    garden with the passage due under `watchedLaunch`: the screens
    `Your field` then `Today`, `Start` shown before the step, no root
    fault, and Today's passage with `Say it`; a passage planted now (home's
    `All tended for today`, no `Start`, no Today frame); and an unread
    launch (Today alone, no `Your field` in any frame).
  - `test:home-wake`: `src/home/wake.test.tsx`, the greeting through
    `src/test/wake-rig.tsx` launched on home, every frame held to
    `rootFaults`: read at home's mount, kept as the clock passes 12:00
    with nothing sent, kept over `inactive` then `active` and over a
    `background` alone, and read again at each return across 12:00, 18:00
    and 04:00 (the sun, then the moon); in America/New_York and
    Asia/Kolkata at a return across their own 12:00; and at home's next
    mount after a return while Today shows. The rig's foreground holds
    one queue, so a second subscription to `Foreground.states` fails it.
  - `test:home-walk-a` to `test:home-walk-h`:
    `src/home/walk-{a,b,c,d,e,f,g,h}.test.tsx`, home walked through the
    root (`src/test/home-walk.ts`, a `root-walk` `Walk` over the root's
    screens: on home a tap on a plant of each class, straight into Today
    on its verse when `startModel` starts it (a review or a verse learned
    fresh) and else nothing, `Start` when the model offers it, else
    `Practice anyway`, a Minutes tap, a landed remove, a landed add (`Add
    a list`, `Any passage`, a verse, `Plant`), a return to the foreground
    (the root rig's host sends `background` then `active`) and a
    relaunch; on Today `root-walk`'s commands, `Your field` and a return
    to the foreground; each add or return makes the plan again and drops
    the visit and the hold, and parts reach both over an open visit and
    over a result held), one device each
    of seeds 10, 110, 94, 68, 250, 1, 38 and 15, part f's in the unread class
    (every listing fails: Today alone, with no `Your field`), held after
    every command, on the screen the model names, to `furrowsModel` and
    `readyModel` (full labels with `, ready today`), the Today card's
    lines (`cardLineModel`) and button (`weakestModel`), `startModel` and
    `greetingModel`, Today to `root-walk`'s oracle and the disk to its rule; every
    frame to `rootFaults` and every home frame to `homeFaults`; each part's
    floors met (part f's Today checked to offer no minutes choice, no
    `Settings` and no `<n> min`, a minutes choice made being
    another part's floor on a read garden; a tap on a verse not planted
    learning it, its recall planting it). Part h alone
    (`walkHome`'s `waits`) puts a wait of one to thirty hours on home
    before each `Start` (`waitBegin`), so parts a-g draw as before; its
    floor `home:wait-begin` is a wait, no visit or hold kept, after which a
    plan made at the later instant would show Today otherwise, and Today
    must still show the plan made at home's first show.
  - `test:plantset`: `src/home/plantset.test.tsx`, the real `PlantImage`
    across all 16 stage × scheme × size cells, with literal filenames and
    dimensions independent of the product mapping; its first commit owes
    an image too. A presentation model runs 16 deterministic sequences of
    12 commands (stage, scheme, size, mount/unmount), checking after every
    command and holding 14 transition floors, including reversed schemes
    at both sizes, repeated values and remounts in the other scheme.
    Seeded drawing fixtures check the oracle's defect sensitivity and
    anonymous forbidden images, with home/end authorized separately.
    Root Today and Planted cases check stored Light/Dark over the other
    system scheme with motion on, keeping the stage text still too.
    The existing dark walks check image identity at their re-theme seams.
    Mounted tests establish hidden source, declared geometry and semantics,
    not native pixels. Live rows `first-plantset` and `today-plantset`
    (`.claude/skills/verify-heartseed/features/first.md` and `today.md`)
    pair same-head test receipts with AX-only native reach/semantic parity;
    they cannot prove sharpness, transparent edges, physical fit, colours,
    large-text layout, pronunciation or motion feel. An owner Release
    look from main, if requested, judges pixels.
  - `test:home-motion`: home's motion without a mount.
    `src/home/motion.property.test.ts`, `motionOf` and `endMotionOf`
    against a loop with two counters written in the test, over generated
    fields of 0-20 furrows of 0-200 plants, fields of 0-120 one-plant
    furrows and grown lists of 0-30 verses (the shape, each delay by its
    formula and under 1,200, the caps of 14 furrows, 60 springs and 12
    sways, soil still, purity), each floor met at least 10 times;
    `src/home/motion-rule.test.ts`, the frame rule `motionFaults`
    (`src/test/motion-rule.ts`, run by `homeFaults` on every home frame
    and by the root rule on every end frame: a node with an inline
    animation, `visibility: hidden` or transform must be hidden from
    assistive tech, hold no text, be and hold no control, and hold one
    image) over hosts built by hand, one cell per fault, and the preload's
    preference for reduced motion; `src/home/motion-guard.test.ts`, M7's
    source guard read with oxc-parser over `src/home`, `src/field`,
    `src/settings`, `src/shelves`, `src/run` and `app/index.tsx`: every
    entering value and Reanimated call passes `ReduceMotion.System`, no
    CSS animation or React Native `Animated`, `entering` only on an
    `aria-hidden` element, both sheets slide, one `useEffect` (the sway's,
    in `src/field/moves.tsx`), and seeded bad sources each named by file,
    line and rule.
  - `test:home-motion-root`: `src/home/motion-root.test.tsx`, motion
    through the root with motion on (`under` of `src/test/motion.ts`, which
    sets happy-dom's preference and mounts a `ReducedMotionConfig` of
    `ReduceMotion.System` before the app, and puts both back in a
    `finally`): the icons and plants at their delays and the hold, only
    hidden drawings moving, every control seen and enabled in the first
    frame with a plant's tap choosing it, nothing entering under Reduce
    Motion with full corn upright, and the end's grown plant at 300 ms
    with `Your field` in reach; every frame held to the rig's faults.
  - `test:home-motion-drawn`: `src/home/motion-drawn.test.tsx`, `Furrows`
    mounted alone over generated fields (past 14 furrows, past 60 planted,
    past 12 at full corn, soil alone): with motion on each icon's and
    plant's entry and sway read from the document equal `motionOf`, the
    caps held by their literal values (nothing moving past the 14th
    furrow, at most 60 springs and 12 sways), no motion fault and every
    plant button named; under Reduce Motion
    nothing enters or is unseen and every sway rests at `rotate(0deg)`.
  - `test:phrase`: the old pieces' reference form (`src/phrase.ts`).
    `src/phrase.property.test.ts`, `phraseReference` with `phraseOf`
    against `src/test/phrase-model.ts`'s reader over round trips, near
    misses and generated strings.
  - `test:phrase-walk-a`, `test:phrase-walk-b`, `test:phrase-walk-b2`,
    `test:phrase-walk-c`, `test:phrase-walk-c2`: `src/phrase/walk-a.test.tsx`,
    `walk-b.test.tsx`, `walk-b2.test.tsx`, `walk-c.test.tsx` and
    `walk-c2.test.tsx`,
    Today over four days with long verses learned whole over gardens that
    hold the old pieces an earlier build kept (Old pieces, above), walked
    through the root (`src/test/phrase-rig.tsx`, each launch on home, held
    to the model's counts and `Start`, then `Start`), one generated device
    per file (devices 1, 2, 8, 4 and 5; every third device teaching Fear),
    each starting with its verses' old pieces sown none, some, ripe or
    beside the verse said whole: Listen reads the verse's own text and
    lights each of its words by its UTF-16 span, Say it's summary and
    record carry the verse's word count under its own reference, a held
    verse survives a Minutes making while its recital listens (made at the
    session seam, `Session.choose`, the effect the Settings sheet's radio
    runs, since no reader reaches the sheet while a recital listens; the
    screen still checked after it), each tap of an absent control fails
    the walk, an item named as an old piece fails it, and Next goes on,
    held after every step to `shownModel`, `countsModel` and
    `wholeCueRule` over `planModel` of the whole verses, and to the disk's
    rule, each part's floors met.
  - `test:natural`: `src/natural`, the natural voice's plan, seam and probe:
    `src/natural/plan.property.test.ts`, `planOf`, `startsOf`, `cutOf` and
    `startsWithin` against a model written in the test over a small
    hand-built lexicon and vocab (seeded texts of every trail and line
    break, with floors on every rest kind and on inner breaks; `;` and `:`
    sent as `.`, the cap at 200 and 201 for a phrase and a word, code points
    against UTF-16 units, marks after a spoken lead, durations that do not
    fit, and seeded cuts silent, at the front, the back, inside and
    clamped); `src/natural/fall.property.test.ts`, `fallOf` against a model
    written in the test over 1,500 generated curves (lengths 0-700,
    unvoiced runs near 0, points of exactly 10 Hz, flats, ramps, dips,
    creak, final rises, falls and tops, a floor on every kind) and its
    invariants (the length kept, no point raised, nothing outside the window
    changed, the window non-increasing and ending at or under the target),
    hand edges (a final rise of 6 semitones, a gentle and a steep fall, the
    empty curve, no voiced point, a one-point window), `fallMeasure` and
    `hasFallen`, and the 32 real curves of `data/kokoro-curves.json` each
    ending 2 semitones or more under its middle with no climb; and
    `src/natural/data.test.ts`, the
    committed data: the vocab's pinned hash, each list's bytes as the
    generator last wrote them, its keys sorted and unique, and every
    phoneme and override spoken in the vocab, the British list's keys the
    American list's in order, the dialect symbols of each and the 10,242
    keys that differ; `src/natural/british.property.test.ts`, each voice's
    list over the whole KJV: every distinct word run (28,881, 21,182 of
    them read otherwise by Him) planned alone in each voice against a model
    written in the test, and over a seeded sample of 700 verses with
    Isaiah 41:10 and John 3:16 among them, Him's plan lighting Her's runs
    and ending Her's phrases with her rests; `src/natural/voice-lists.test.ts`,
    the natural source over 80 seeded sessions of two to five speaks on one
    source, as the app builds it once, on a stand-in module and two hand
    lists (Her, Him and a voice outside the download, in any order): each
    speak plans, prosodies and plays by its own voice's list, never an
    earlier speak's, and asks for no list before its voice is known; `src/natural/manifest.test.ts`,
    the 39 pinned files, the voices, `LISTS` and `baseFor` over seeded asks;
    `src/natural/guard.test.ts`, the native module's guards (its committed
    declaration equals One's, the simulator branch never starts the engine
    and logs its skip, no file sets the audio session, only
    `source.ios.ts` names the Swift file, the chain split at its pitch curve
    (`prosody` then `vocode`, never `synthesize`), the prosody passing the
    speed it is sent and naming none, the audible floor 0.01 and the play line's
    cut, rest and `at`, the vendored headers and LICENSE); `src/natural/lexicon.test.ts`, the bundled lists and vocab, each voice's
    list built once;
    and `src/natural/probe.test.ts`, the probe's lines, a read's tally over
    seeded views (order ok only for each word lit once, in order, to a
    finish), the `fall` line and the `recording` module that feeds it, the
    soak's count and tally, and soaked verses over a stand-in module (the
    curve sent fallen at a phrase's end and as given inside one, and each
    prosody that does not fit failing `curve` with no render); and `src/natural/state.test.ts`, the download's
    reducer: the line over its whole domain (every state, generated byte
    counts and totals, the fuse, the crash line and the choice) and every
    input from every state; and `src/natural/changes.test.ts`, the
    `Natural` service's yield points: a download event landing at any
    yield of the launch's begin leaves the replayed view the current one
    (`src/test/yielding.ts`). It leaves out `src/natural/voice.test.ts`,
    `src/natural/voice-b.test.ts`,
    `src/natural/route.test.ts` and `src/natural/status.test.tsx`, each its
    own part.
  - `test:route`: `src/natural/route.test.ts`, the router, the download and
    the fuse against a reference written in the test, over 200 seeded
    histories of 30 steps (launches with and without a crash, install
    events, load answers, taps of `Voice`, readings, stops, pauses,
    `Try again`, stray events and broken first renders), with floors on
    each kind; the fallback's `natural.fallback` log; a stop that
    returns only after both voices stopped; and a natural reading's words
    lit from the module's ranges, a seek reading on in the natural voice
    with the words before it lit, and Today's passage read by Her over the
    American list's plan and by Him over the British list's, on launches of
    their own and on one launch, Her then Him and Him then Her, the Voice
    pill switching between.
  - `test:status`: `src/natural/status.test.tsx`, the natural voice's
    line in home's Settings sheet, rendered under `appLayer` with a
    stand-in module: the download's walk, each failure's words and
    `Try again`, Off, the crash line said once and the fuse stored, the
    platform with no natural voice; the line after `Voice` and before
    `Appearance`, inside the sheet, at AA contrast, `Try again` never
    inside it, and the sheet's own rule (`sheetFaults`) holding.
  - `test:natural-voice`: `src/natural/voice.test.ts`, the natural voice's
    `VoiceSource` against the model in `src/test/natural-voice.ts`, over the
    first 150 of 300 seeded histories of 72 steps. It also holds the two
    ranges to a partition against a generated per-index count, their seeds
    and the sum of their coverage floors. A stand-in module answers each
    load, prosody and render when the history says (speaks of one to three phrases, of a
    phrase over `CHUNK_CAP` that breaks mid-phrase and of a text no plan
    takes, prosodies whose frames or curve do not fit, renders with and
    without audible samples, malformed frames and spans, a refused play,
    events of the held utterance and of others, a reload). The model holds its module calls
    (each prosody at the voice's speed, each render on `fallOf` of its
    prosody's curve at a phrase's or the reading's end and on the curve as
    given inside a phrase, no render after a prosody that does not fit, each
    play with its starts moved into the cut, the cut and the chunk's rest),
    the events it forwards and each speak's state after every step.
  - `test:natural-voice-b`: `src/natural/voice-b.test.ts`, the last 150 of
    the same 300 seeded histories over `src/test/natural-voice.ts`, with
    the same per-step model check, its own seeds and coverage floors.
  - `test:theme`: `src/theme.test.ts`, the brand's colours (`src/theme.ts`):
    every role of brand C in light and dark, the icon's colours, the home
    icons' `masters` and `kept` and the face pinned; every role given a use
    (text on its grounds, a ground, or decoration and why), the table's
    roles exactly each scheme's and its text roles exactly `TEXT_ROLES`;
    each text role on each of its grounds (`ink`, `quiet` and `miss` on the
    ground, a card and the heard word, `sun` on the ground and a card,
    `onInk` on the ink) at least 4.5:1 unrounded in both schemes, as are the
    icon's mark on its ground and the launch screen's ink on its ground;
    `furrow` the ground moved 45 % toward `soil`; `masters`' keys lower-case
    hexes of roles and none in `kept`; and the heard word the ground moved
    22 % (light) or 25 % (dark) toward the glow.
  - `test:look`: `src/look.test.tsx`, the scheme and the themed styles
    (`src/look.tsx`): every value React Native can name read as dark or
    light, a probe following each flip of the system with no tap, each
    scheme's styles built once; and the guard: no product file in `src`,
    `app`, `vite`, `scripts`, `infra` or the root (less tests,
    declarations, rigs, probes, prototypes and `src/theme.ts`) holds a
    string React Native 0.88 reads as a colour (`src/test/colours.ts`,
    `transparent` excepted) or names a font family, the reader held to
    400 generated sources and every named colour.
  - `test:appearance`: `src/appearance.property.test.ts`, the read rule
    over the three words, 30 near misses and 400 generated texts, the
    scheme over every appearance and system name, and the `Appearance`
    service against its model over the store on the device across seeded
    histories (launches over any stored text, a missing key and a failed
    read; chooses, a refused write, bursts in one turn and with every write
    held and let go in any order; relaunches): the view, its latest change,
    the disk and the log after each command, nothing written at launch.
  - `test:appearance-walk`, `test:appearance-walk-b` and
    `test:appearance-walk-c`: `src/appearance/walk.test.tsx` (seeds 1-4),
    `walk-b.test.tsx` (seeds 5-8) and `walk-c.test.tsx` (seeds 9-12), four
    commands a seed, each part's seeds reaching every floor, walks of
    `src/test/appearance-walk.tsx`: the root
    through the bar rig as generated readers (launches over each stored
    text class and either system; a choice in home's Settings sheet,
    landed or refused, a flip of the system, a relaunch, the field), every
    frame held to the frame oracle for the model's scheme and the sheet's
    frames to `sheetFaults` in it, every commit that holds a new
    appearance (the launch's and each choice's) drawing the screens in the
    model's scheme in its layout phase, before it is seen, the sheet's
    radios and the disk to the model.
  - `test:dark-today`: `src/look/today.test.tsx`, Today in dark and across
    flips of the system through the run rig, reached from home by `Start`,
    as generated walks (Say it
    heard, with a word missed or unheard, a flip while it listens, a peek,
    a grade, Next to the done state, Minutes by the trip through home's
    Settings sheet, the field and back, a flip between any two steps),
    every frame held to the frame oracle (`src/test/look.ts`) for the
    system's last value, and each trip's sheet to `sheetFaults` for that
    value, its look checked at least once. A trip ends by the plan made
    at its tap, by the session's and the run's models over the device's
    disk: on Today when that plan offers the verse (counted
    `minutes:due`, floored at one, reached by the fourth walk's unheard
    recital then a trip), else on home with no `Start`.
  - `test:dark-first`: `src/look/first.test.tsx`, the first minute's
    phases (hear while the voice reads, letters while their recital
    listens, alone, Planted, then home in its done state) in dark, each
    flipped to light and back, every frame held to the oracle and to
    `rootFaults`.
  - `test:dark-screens`, `test:dark-screens-b`, `test:dark-screens-dark`
    and `test:dark-screens-dark-b`:
    `src/look/screens.test.tsx` and `screens-b.test.tsx` (light),
    `screens-dark.test.tsx` and `screens-dark-b.test.tsx`
    (dark), each a walk of `src/test/screens-walk.ts`: the field (every
    plant stage, a list's page with a remove asked and pending), About (by `Settings`, the
    sheet's frames held to `sheetFaults`) in the
    first of each scheme; the Add a list sheet with `Psalms` open (held to
    `addSheetFaults` in the scheme shown), then the chooser by
    `Any passage` (books, a chapter, a verse chosen, `Plant`) in the `-b`
    part
    through the bar and root rigs, each flipped and back, each
    control held pressed in turn with its opacity composed. The bar, root,
    field and chooser rigs hold every frame to the oracle beside their own
    rules.
  - `test:rest`: the other test files at the root of `src`, named file by
    file, with `src/zone.test.ts` (the tests' zone helpers over generated
    nested `inZone` levels and `travel` and `restore` pairs: each level
    reads its own zone, and each run ends in UTC). Every `src` part's
    preload, `src/test/setup.ts`, fails a case that ends outside UTC,
    naming the zone it ended in, and puts back UTC for the next case. It
    also fails a case in which Effect's default clock was asked the
    calendar time (a `Clock.currentTimeMillis`, a `DateTime.now` or a log
    line's stamp run by a runtime given no clock), naming the host's clock
    and the count, and counts from zero again for the next case.
  - `test:clock`: `src/clock.test.ts`, under the preload. The tests' clock
    as a model: 200 runs of 30 generated commands (set to an instant or an
    edge, advance, travel among the zones, relaunch, a real wait, a sleep
    on the clock, a move of another `Time`) against the instant and zone
    the test keeps, each of the clock's four reads equal to it; the
    preload's count of default-clock asks over generated reads, a clock
    made before the count began and a layer given the clock but not merged
    with it, and none under the test's clock, a `TestClock` or a logger on
    the test's clock; and `deadline`, which expires on elapsed time while
    the instant stands still and never because it jumps.
  - `test:list`: `src/list.property.test.ts`, `listStartOf`,
    `listLineOf` and `listCaptionOf` over the home model's generated
    devices and over the real lists the field shows (`Open` exactly when
    `readyOf` holds a verse of the list, its visit a sub-sequence of the
    plan, `Weakest` and `Learn` as `startOf` gives them), and
    `src/list/rule.test.ts`, the root rule's home and list-page clauses,
    one offending frame per clause, each fault named.
  - `test:list-screen`: `src/list/screen.test.tsx`, each list's own page
    through the bar rig in light and dark (the promise, a held passage
    part grown, the Fear collection, a held Handbook list, a loose verse):
    its heading, caption, `Practice this list` and its line, its rows in
    order with their names and stage words, row buttons only where a start
    exists, `Remove <name>` only on the held passage and the Handbook list,
    every text at AA; and over unread passages no remove, no
    `Practice this list` and no row button.
  - `test:list-walk` and `test:list-walk-b`: `src/list/walk-a.test.tsx`
    (seeds 58, 23, 57) and `walk-b.test.tsx` (seeds 53, 17, 44, 56),
    generated readers through `src/test/list-walk.tsx` over the root rig:
    open a list, `Your field`, `Practice this list`, a row's tap (floors
    on a list's first row and, in part b, on a row after it), Say it starting
    to listen, a return to the foreground, `Remove <name>` then `Keep` or
    the ask's `Remove` landing or refused (once, twice in one turn, or
    with `Your field` in its turn), and Today's `Your field`; after every
    step the screen against the model, the visit against `listStartOf`'s
    or `startOf`'s at the tap, a removed list gone from home and every
    other kept, and every frame held to the root rule, the bar's and the
    page's pending rule (every control disabled or none).
  - `test:infra`: `scripts` and `vite`, with `scripts/sim.test.ts`
    (Heartseed's `sim` over a stand-in Drive: its values, the web and a
    port outside 8280-8289 refused before any step, and `install` waiting
    for Today's reference), `scripts/natural-serve.test.ts` (the model
    server over a fake cache on a port the system picks, with no network:
    the fill, `GET`, `HEAD`, 404 and `--corrupt`), `vite/kjv.test.ts`
    (the corpus's derivation and its build faults, and the plugin's two
    modules), `vite/lexicon.test.ts` (both pronunciation lists as the
    plugin serves them, and each list's wrong shapes refused), `scripts/root-props.test.ts` (each prop a doc
    comment gives the root, in a sentence naming it or an `It` sentence
    right after one, a lead such as `No` or `without` in either case of its
    first letter, held to `Root`'s declaration, over the `src` and `app`
    sources of git's listing of the package and never a file it ignores,
    such as One's `app/routes.d.ts`; generated worlds and a scratch
    repository hold the read set), `scripts/probe-lines.test.ts` (each
    line of a probe that verify-heartseed's `SKILL.md` and `features/*.md`
    quote, and each `sim open probe/…` target (its command on one line or
    continued over lines with a backslash), held to the literal
    skeleton of a text the probe's sources write, `…` ending an elided line
    and a tag opening a log line; generated probes and feature files hold
    the reader, so `test:infra`'s inputs take `.claude/skills/verify-heartseed`) and
    `scripts/seed-search.test.ts` (the seed search's pure parts: the seed
    parameter found by name, the pin, the part's files, the search over a
    fake runner and the decision of which call to pin). It leaves `scripts/icon.test.ts` to `test:icon`,
    `scripts/home-icons.test.ts` to `test:home-icons`,
    `scripts/home-pixels.test.ts` to `test:home-pixels`,
    `scripts/clock-reads.test.ts` to `test:clock-reads`,
    `vite/devbundle.test.ts` to `test:devbundle` and `scripts/handbook`
    to `test:handbook-build`.
  - `test:handbook-build`: `scripts/handbook`, with no preload: the
    Handbook generator's rules. `reference.property.test.ts`, how a link
    reads and places as ranges against a model written in the test, over
    generated links in all 66 books (Haskell's names and the canon's),
    one-chapter books, other chapters, reversed and past-chapter ranges,
    20 and 21 verses, `;` and junk words, each class held to a floor;
    `lists.property.test.ts`, rows' membership, lines and leads, labels
    at and past 40 characters, notes, unlinked references, lists and
    sections over generated books against a plain model, and the eight
    left-out titles in the real snapshot; `output.test.ts`, the writer's
    exact text and bytes twice over an in-memory book, its refusals
    (a repeated or broken paragraph id, no row of book 978, a left-out
    title missing), and `data/handbook.json` as the writer writes it:
    its lists, read back as rows under their own headings of the
    committed contents snapshot, are written to the same sections,
    ids, titles and ranges (the EGW database itself is not here).
  - `test:icon`: `scripts/icon.test.ts`, with no preload: the native
    manifest (`vite/app.ts`) named Heartseed, valid to One for iOS and
    Android, with no `userInterfaceStyle`, naming the icons on the icon's
    grounds and the launch screens (224 wide) on the app's grounds from
    `src/theme.ts`; the icon script draws exactly the files the test holds; each opaque icon (light, dark,
    tinted) 1024 px with three channels, every pixel its ground, its mark
    or a blend in `src/theme.ts`'s icon colours, the mark's box at 0.72 of
    the side; each layer (Android's foreground and monochrome, both launch
    screens' artwork) 1024 px with alpha, every seen pixel its mark's
    colour, Android's inside the 33/108 safe circle and the launch ones'
    box at 0.72; and every committed PNG byte for byte what `bun run icon`
    draws from `assets/icon/heartseed.svg` now.
  - `test:devbundle`: `vite/devbundle.test.ts`, with no preload: vxrn's
    native dev runtime, built by the rolldown vxrn resolves from `one`
    (never the app's own), compiles to Hermes bytecode under
    react-native's hermesc with vxrn's flags. The hoisted install gives
    vxrn the hymnal's devDependency `rolldown` (`apps/hymnal/package.json`),
    so that pin stays at a version whose dev runtime Hermes parses; this
    part says whether a bump is safe. Its slow leg,
    `vite/devbundle.slow.test.ts` in `test:slow`, starts `one dev` on a
    free port of 8280-8289 and asks it for a Debug build's iOS bundle,
    which must answer 200 with Hermes bytecode.
  - `test:home-icons`: `scripts/home-icons.test.ts`, with no preload:
    `assets/home` holds exactly each `ICON_IMAGES` name's master, two PNGs
    and two declarations; each master 48 × 48 on no fill with every colour
    mapped or kept; `recolour` against a rule written in the test over 600
    seeded texts (a token is `#` and any count of hex digits in any case:
    each master hex and each kept one in any case, random tokens of 1 to 9
    digits and of 10 or more with no bound, a master's or a kept hex with
    digits added or one dropped, a bare `#`, filler; both schemes, floors on
    clean and unmapped texts, on each unmapped kind as the first unmapped
    token, and on each digit count from 1 to 10 and one of 16 or more); the table
    naming each PNG; each declaration the script's `DECLARATION`; each PNG
    144 × 144 with four channels; and every committed PNG byte for byte
    what `bun run home-icons` draws now.
  - `test:home-pixels`: `scripts/home-pixels.test.ts`, with no preload, an
    oracle apart from the script: each PNG's colours are its master's
    tokens through `src/theme.ts`'s `masters`, `kept` and its scheme's
    roles. Each is at least 40 % transparent, shows each expected colour
    exactly in at least 40 opaque pixels, has at most 12 seen pixels more
    than 3 from every blend of two expected colours, and fails the exact
    floor against the other scheme's colours.
  - `test:clock-reads`: `scripts/clock-reads.test.ts`, with no preload,
    the source rule over `scripts/clock-reads.ts`. Every `.ts` and `.tsx`
    file git lists in the package (tracked or untracked, never ignored)
    that is a test, a helper under `src/test` or a tool (`scripts`,
    `vite`, `infra`), less `*.d.ts`, is parsed, and none may read the
    host's clock (`Date.now`, `new Date()`, `Date()`,
    `DateTime.nowUnsafe`, through `globalThis` too), hold `Date` in any
    way it cannot place, read monotonic time (`performance`,
    `process.hrtime`, `Bun.nanoseconds`), read a held clock or run a
    clock read with no clock given; a file that does not parse is
    refused. Three declarations may hold their own kinds: `deadline`
    (`src/test/elapsed.ts`), `hostClock` (`src/test/clock.ts`) and
    `hostAsked` (`src/test/setup.ts`). The reader is held to 600
    generated sources from fragments whose verdicts the test writes, each
    fragment alone, the boundaries and their edges, and the domain over
    generated paths; each fault is named `file:line kind`.
  - `test:mirror`: `infra`, the mirror's stack, with no preload:
    `infra/models/plan.test.ts` (the list, the keys, the headers and the
    plan's keep, upload and conflict), `infra/models/voice-pack.test.ts`
    (seeded packs, -0, the extremes, the ignored keys and every refusal),
    `infra/models/r2.test.ts` (the R2 adapter over a recording client:
    literal slashes, the listing's cursor, retries and denials on the test
    clock, the put timeout), `infra/models/job.test.ts` (the copy and
    the dry run over a fake Hugging Face, a fake bucket and a temp cache)
    and `infra/models/copy.test.ts` (which job and which layers
    `--dry-run` selects, the cache passed through, and the refused flags).

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

  A walk part holds its seed in its test file, found once by hand. When a
  change to a walk's draws leaves a part short of a floor, `bun run seeds
  <part> [--from 1] [--to 200] [--jobs 3]` (`scripts/seed-search.ts`) finds
  the seeds at which it passes again. It runs the part's files once as
  committed, then once for each seed, with the seed of the walk the files
  import pinned by `scripts/seed-pin.ts`, a preload no part loads: a
  parameter named `seed` is pinned to the seed, and one named `seeds` to
  the window of its length from it. The part's own expectations judge each
  seed; no floor is copied. It prints `seed <n> meets|misses <ms> ms` per
  seed, then `seeds <part>: <seeds|none> of <from>-<to> (<k> meet),
  committed <seed>`. It refuses with exit 2 a part that names a folder or a
  file outside `src`, a committed run that fails, and one whose files call
  no walk with such a parameter, or several (`--call <k>` picks one).
