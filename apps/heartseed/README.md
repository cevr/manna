# Heartseed

Scripture memorization on One (React Native on iOS, react-native-web on the
web). A fresh install opens the first minute (`src/first`, below): hear
the passage, say it with first letters, say it alone, and its first seed is
planted. Every later launch opens on home, the field (`src/field.ts`,
Field and Home, below): a row per passage, a plant per verse, the days
sown and the harvest, and in its foot a counts line that says what the
day's plan holds (`src/session.ts`, below) with `Begin`. Once a plan is
made, `When I need…` in home's bar lists the promises the reader knows by
situation, and a tap on one says it now (`src/need.ts`, below). `Begin`,
`Start here` or a promise opens Today (`app/index.tsx`), which shows the
passage the reader is learning, its stage in the garden, and one big
button, Say it, which hears the reader recite it; the word matcher
(`src/matcher.ts`) grades a recall against the verse, and the garden
(`src/garden.ts`) keeps it and grows the verse's plant. Beside Today's
heading, `‹ Your field` goes back to home; under them, the session's
`Minutes` and `Voice` choices sit.

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
4. `Planted`: `Stage: seed`, the seed drawn large and `Continue`. Planting
   never sounds.

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
beside it drawn as the prototype draws it, and, while a finished recital is
on the screen, how that recital grew it (`Grew to an ear.`). Cues fade
across days by stage, the ladder (`cueAt`, `cueIn`): a passage not yet
planted shows and is said under the full text (under first letters when a
phrase of it is planted: its join, Phrases, below), a seed under its first
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
a plant, at the stage the garden derives. It is home, the screen a read
launch opens on (Home, below). Today goes back to it by the button
`Your field` (shown `‹ Your field`), shown once the garden's read
completes and never while Say it listens (leaving Today then would leave
the microphone open off-screen). It sits in Today's header beside the
heading, outside the scroll view, so however much a recital adds (the
recap, the grades, the growth line, an alert) it is on screen without a
scroll and clear of the home indicator. Home has no control named `Today`:
it opens Today by `Begin`, `Start here` or a promise of When I need…, and
Today then shows as it was (a held result kept). Home, Today, the chooser
(Choosing a passage, below), About (below) and When I need… (below) are in
place in the root route (`app/index.tsx`): no route, no link, no tab.
Which of these five screens shows is the root's state for the launch,
never stored, so every launch opens on the pending frame, then the first
minute, home or (unread) Today, and whenever Say it listens the screen is
Today. Until a read completes, and for a session whose read failed, there
is no field and no control: an unread garden cannot know the days sown,
and an unread session's recitals are written all the same, so the next
launch counts them.

- `src/field.ts` is the rule, pure: `fieldOf(garden, passages)` over a
  `Read` view and the passages taught: the promise's, a passage of one
  verse, then each the reader holds, in the order chosen, carrying its
  range, then each taught collection, titled by its title, its verses in
  order, with no range (`fieldPassagesOf`, `src/promises/taught.ts`, over
  the app's layer's taught part, mapped in `app/index.tsx`; with the
  reader's passages unread, the promise's and the taught ones). Each row's
  passage is a `List` (`listsOf`, `src/lists.ts`; Home, below). The field
  shows once the garden's and the passages' views and the taught part are
  known. The passages come first,
  each verse a plant at `stageOf` its plant, `seed` while it has no plant
  of its own but a plant of a phrase of it, or `not planted` before its
  first recall (drawn as bare soil); a verse is one plant wherever it
  shows; then each other verse the garden
  holds, alone, in the order first sown: by its earliest recall's
  `startedAt`, then by its reference in code units. A phrase is never a
  row or a plant: its plant folds into its verse's (Phrases, above), and
  counts toward that verse's first recall. References match
  exactly (`Isaiah 41:1`, `Isaiah 41:100` and `Isaiah 41:10 ` are three
  other verses).
- Days sown (`1 day sown`, `<n> days sown`) is the number of distinct days
  (`dayOf`, `src/day.ts`) among every recall the read holds, of any verse
  or phrase.
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
  21 days or more; a phrase never counts), derived, never stored: Again on
  a verse at full corn takes it out.
- Nothing is stored for the field itself: no key, no value, no setting;
  it reads only the garden's and the passages' views, and writes only
  through a landed remove (Choosing a passage, below). Every number
  derives from the garden's view each time the field shows.
- `src/field/screen.tsx` draws a `Field` in home A's layout (Home,
  below), its furrows and legend in `src/field/plot.tsx` and its foot in
  `src/field/foot.tsx`. The bar, fixed above the scroll view, holds
  `When I need…` (at least 44 pt, exactly when a plan is made in this
  launch: When I need…, below), then `Add verses` (testID `add-verses`),
  the limit line or the ask. It holds no way back: home is the root. In the scroll view: the greeting (testID `greeting`, the sun or the
  moon, then its words in `sun`, plain text), the heading `Your field`,
  the days sown and the harvest, the hint `A gold dot marks a plant ready
  today. Tap one to start there.`, one furrow per row (`furrowsOf`; testID
  `row`), the dashed `Add verses` row (testID `add-row`, at least 56 pt
  tall) whenever the bar offers `Add verses`, and a legend of the four
  stages, hidden from the screen reader, over the caption `Mark 4:28`. A
  furrow's head holds its icon (`furrow-icon`), its title (plain text,
  never a heading, so a reference spelled `Your field` or `Today` adds
  none), its ripe count (`<k> of <n> ripe`, testID `ripe`) and, for a held
  passage, `Remove <reference>`; then its plants, then a soil line. Each
  plant (testID `field-plant`) is one button at least 44 × 44 pt named
  `<reference>, <stage>`, then `, ready today` for a verse of the plan's
  open items, with `aria-selected` while its verse is chosen; inside it,
  hidden, the gold dot (testID `dot`, filled `sun`, at least 3:1 on the
  ground and on a chosen plant's card) when ready, the stage's image
  (`seed`, `blade`, `ear` or `corn` from `ICON_IMAGES`, of the scheme
  now) or bare soil (`plant-soil`) for a verse not planted, and its verse
  number. Every icon is hidden from the screen reader; nothing moves.
  Every text is in a text role at WCAG AA on what lies behind it. The foot
  (testID `foot`), fixed under the scroll view and clear of the home
  indicator, holds one card, then `About`: with no verse chosen, once a
  plan is made, the Begin card (`begin-card`: the counts line, testID
  `counts`, and `Begin` while the run shows an item), which opens Today
  and writes nothing; over unread passages, with no plan and the first
  piece to say, the Begin card holds `Begin` alone, with no counts line; with a verse chosen, the chosen card (`chosen`:
  `<reference> · a seed`, `a blade`, `an ear`, `full corn` or `not
  planted yet`, and `Start here`, named `Start here with <reference>`,
  while `startOf` starts something), which runs `startHere` and opens
  Today once it settles. Like every field control, the plants, `Begin`
  and `Start here` are disabled while a remove is pending.
- **The choice** is a verse, never a cell: a tap on a plant chooses its
  verse (every cell of it shows selected), a tap on a plant of the chosen
  verse lets it go, and a tap on another moves it. It is the screen's own
  state, never stored, dropped when the field closes or when no furrow
  holds the verse any more.
- **The greeting** reads the runtime's `Clock` when home shows
  (`greetingNow`, `src/app.ts`, over `greetingAt`), in the reader's zone,
  and again at each return to the foreground while home shows (Session,
  below: `Returns`); never in between, so home left open across 12:00
  keeps its greeting until it shows again or the app returns.

## About

`About` on the field opens the About screen (`src/about/screen.tsx`,
`AboutScreen({ onField })`): a bar fixed above a scroll view holding the
way back, `Your field` (shown `‹ Your field`), which returns to the field;
in the scroll view the one heading `About`, the natural voice's credits
(`CREDITS`, one paragraph, `about-credits`) and the Apache License 2.0
whole (`about-licence`), which the bundle owes for the natural voice's
vendored code. Every text is the scheme's ink, at WCAG AA on the ground.
A foot fixed under the scroll view holds the reader's appearance
(`src/appearance/choice.tsx`, `AppearanceChoice`, Look): the radio group
`Appearance`, `System`, `Light` and `Dark`, on screen with no scroll and
clear of the home indicator. About writes the store only at a tap of one
of them. The control sits here until the home's redesign moves it, with
Voice and Minutes, into its Settings sheet: it carries its own state and
rules, so the move is one line and its test's route.

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
- **The pieces** (`piecesOf(own, view, taught)`) are the app's own
  (`appLayer`'s `pieces`, the promise by default), then each passage's
  verses in passage and verse order, each with its corpus text, its words
  counted as the matcher counts them and its passage's reference as its
  group, and a long verse its phrases (Phrases, below), then the taught
  collections' verses (Promises, below). Each
  reference is kept once, at its first place, so a passage over
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

- **The field's bar** holds `When I need…` once a plan is made, then,
  with the passages read, `Add verses` (testID `add-verses`) while fewer than 3
  are held, else the limit line "3 passages, the most for now. Remove one
  to add another." (testID `limit`), which a stored list of 4 or more
  shows too, so the bar never offers an add the service would refuse. The
  dashed row `Add verses` at the field's end (testID `add-row`) shows
  exactly when the bar's does and does the same; both open the chooser. With the passages unread
  it offers neither and no row offers `Remove`: the app never writes over
  what it could not read.
- **The rows** are the promise's, then each passage held, in the order
  chosen, titled by its reference, then each taught collection's
  (`Protection & Fear`), then every other plant as a passage of one verse,
  a phrase's folded into its verse (Field, above). Each passage row, and no other, holds
  `Remove <its reference>`, which finds its passage by the row's range,
  never by its place. The promise and the taught collections are not the
  reader's choice and have none.
- **Remove asks once**, in the bar in place of `Add verses` or the limit
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
  `Keep`, `Add verses`, a row's `Remove`, a plant, `Begin`, `Start here`,
  `When I need…`, a verse or a back changes nothing, and each shows as disabled (no
  `Add verses` shows while the ask holds the bar). A ref, set in the tap's own turn,
  holds it, so two taps in one turn make one change: a double tap never
  stores a passage twice or removes two.
- **Today after a change.** A landed add or remove is a making (Passages,
  above), so home's counts line and Today's run show the new plan: its reference, the
  counts line and `Listen` on a new piece. On a day a verse or a phrase
  was first planted (the first minute's day among them) no new piece
  shows; after the next 04:00 local, the first piece no plant names is
  new: a long verse's first phrase (Phrases, below), a short verse whole.
- Nothing else is stored: opening, stepping, tapping verses, backing out,
  `Keep` and unread passages write nothing, and there is no route or key
  of the chooser's own.

## Phrases

A long verse is learned as phrases first, then joined. `src/phrase.ts` is
the cut and the reference form, pure; the session, the cue and the field
apply them.

- **The cut** (`cutOf`). A verse of 12 words or fewer (the matcher's
  words: whitespace runs that hold a letter or a number) is learned whole.
  A longer one is cut into consecutive phrases of 4-12 words that cover
  every word. The gap after a word is the text from its last letter or
  number to the next word's first, mark-only runs (`—`, `¶`, `...`)
  included: strong when it holds one of `.;:?!`, comma when it holds `,`
  and none of those, else plain. The cut takes, in order, the fewest cuts
  at a plain gap, the fewest phrases, the fewest cuts at a comma gap, the
  least sum of squared sizes, then the earliest cuts. A phrase's text runs
  from its first word's run (the verse's start, for the first) to the next
  phrase's first run (the verse's end, for the last), trimmed, so the
  punctuation before a cut stays with the phrase said before it. Over the
  whole KJV: 28,417 of 31,102 verses are cut, into 85,244 phrases, with
  8,041 cuts at a plain gap and 31,282 at a comma; John 3:16 is
  `[1-6]`, `[7-13]`, `[14-25]`.
- **The reference** (`phraseReference`) is the verse's, a space, then the
  word numbers from 1 in brackets: `John 3:16 [1-6]`. A phrase's recall is
  an ordinary recall record under that reference, so there is no new
  field, key prefix or migration. `phraseOf` reads it back only from that
  exact form (a verse part with no bracket, two whole numbers from 1 with
  no sign or leading zero, the first no later than the last, nothing
  after `]`); any other reference, a verse's among them, names no phrase.
- **Which pieces carry phrases.** Each long verse of a held passage and of
  a taught collection carries its phrases (`Piece.phrases`, each a
  `TextPiece` with its reference, text, word count and the verse's group:
  a passage's reference, or a collection's title), built with the pieces
  (`piecesOf`, `collectionPieces`), each verse text cut once per process.
  The app's own pieces never do: Isaiah 41:10, the first minute's verse,
  is learned whole, even inside a passage over it, since a reference keeps
  its first place. A phrase carries no phrases. A verse of 12 words or
  fewer has no `phrases` key at all.
- **Phrases, then the join** (`planOf`). The plan is made over the pieces
  expanded in the app's order: a planted piece, or one with no phrases, is
  itself; an unplanted long verse is its phrases in order, then the verse
  itself (the join) once every phrase is at an ear or full corn. The join
  leaves the plan again if a phrase falls below an ear before it is
  planted. The rest of the plan is unchanged: the new piece is the first
  expanded piece no plant names, none on a day any plant (a phrase's
  among them) was first recalled, so a verse's phrases come one a day;
  while they ripen the next verse's first phrase may come, and the join
  takes its place in order once ready. Phrase reviews mix by group as any
  review does.
- **The join's cue** (`cueIn`). A planted reference keeps its ladder. An
  unplanted verse is shown and recited under first letters when the
  garden holds a plant of any of its phrases, else under the full text, so
  a join is planted under letters: its words are already known.
- **Phrases leave** once their verse has a plant: they are no longer
  pieces, so they are never offered or reviewed again. Their records stay,
  and the field folds them.
- **The field** never shows a phrase as a row or a plant. A verse with no
  plant of its own and a plant of any of its phrases shows `seed`; once it
  is planted, its own stage. A phrase plant whose verse no row holds (a
  removed passage's) makes one row for that verse among the other plants,
  first sown by the earliest recall of the verse and its phrases. Days
  sown count every recall, phrases' included; the harvest counts verses'
  own plants only.
- **Today on a phrase** shows the phrase's reference and its own text
  under its cue. `Listen` (a new piece only) reads that text, and the word
  marks light its words by their UTF-16 spans within it; nothing is
  precomputed per verse. `Say it` recites the phrase: the summary reads
  `<k> of <n> words` over the phrase's n, and the recall is kept under the
  phrase's reference with its word count. Today, the hold and the recital
  find a phrase item's piece among the pieces' phrases (`pieceAt`), after
  the hold and the visit.
- **Known and visits.** A phrase plant never makes a verse known: a
  promise is known only when each of its verses has its own plant
  (When I need…, below). A visit says a known verse whole, under its own
  ladder, whatever phrase plants it has.
- **A rollback** to a build before phrases reads each phrase record as a
  plant no piece names: a row of its own on the field, never offered or
  reviewed. Nothing is lost.
- The tests: `test:phrase` (the cut against `src/test/phrase-model.ts`,
  the reference form, the census, the natural voice's plan over phrases),
  `src/session/phrases.property.test.ts` in `test:session` (the expansion
  and the join's cue), `src/field/phrases.test.ts` in `test:field` (the
  fold), and `test:phrase-walk-a`, `-b` and `-c` (Today over days through
  the root): Tests, below.

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
  session, the field's taught rows and When I need…'s taught card read
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
  by their groups. A long Fear verse is learned as phrases first, then
  joined, as a passage's is (Phrases, above), its phrases grouped by the
  collection's title too: Fear's 14 verses come as 34 phrases, 13 joins
  and Psalms 56:3 whole (10 words), its first new piece
  `Psalms 91:1 [1-9]`. A Fear verse inside a held passage keeps its first
  place there, its phrases under the passage's reference.
- **The field's row.** Each taught collection is a row titled by its
  title, its plants its verses in order, after the passages held and
  before the other plants, with no `Remove`. A verse is one plant
  wherever it shows: a Fear verse in a held passage shows in both rows,
  and a removed passage's Fear verse stays in the Fear row. A Fear verse
  in phrases shows `seed` there, as in any row (Phrases, above).

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

Today runs the plan one piece (a verse or a phrase) at a time. In a read
garden with a plan it shows one item: the held one if any, else the
visit's first item not done (When I need…, below), else the plan's first
item not done.
It shows the item's reference (`testID="reference"`), its words under its
cue (`cueIn`: the full text for a new piece, first letters for a join,
its stage's cue for a review), its stage
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
  Today's passage alone, then the reader's passages' verses, then the
  taught collections': Passages and Promises, above; each its reference, its word count and its group,
  and a long verse its phrases; `TextPiece` adds its text), the instant, the zone's offset at it
  and the minutes. `isDone` reads an item's done from the garden.
  - A plant is due at FSRS's due. While it holds one recall that carries
    an offset and started from 18:00 to 03:59:59.999 by that offset's local
    clock, it is due no earlier than the 04:00 that ends that recall's day
    (`dayOf`, `src/day.ts`): plant at night, recall in the morning, and
    travel moves no due instant. A record kept before recalls carried an
    offset keeps FSRS's due.
  - The pieces are expanded first (Phrases, above): an unplanted long
    verse is its phrases, then its join once every phrase is at an ear or
    full corn; a planted verse is itself, its phrases gone.
  - The new piece is the first expanded piece, in the app's order, with no
    plant. None is offered when any plant (a phrase's among them) was
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
  before the plan that decides its counts line and `Begin`, again at each Minutes tap, at
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
  launch's start, then of each making (its view's `pieces` and `held`),
  and beside it the visit (`visit`, When I need…, below, and `start`, a
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
  item, else the visit's first not done, else the plan's. A phrase item's
  piece is its phrase, found among the pieces' phrases (`pieceAt`,
  `src/session.ts`), as the hold finds it. A held item
  shows with the piece it was held with (the view's `heldPiece`, kept
  beside the hold and dropped with it), never `Done`, even when a making
  took its verse out of the pieces: a remove of its passage while its
  recital is under way keeps the verse, its marks, `Listening` and then
  its result on Today until `Next`. The plan made then holds none of the
  removed verses, so after `Next` Today never offers one. The view's
  `pieces` and `held` keep their meaning.

## When I need…

The promises the reader already knows, by situation; a tap on one says
it now, and the saying counts as a review.

- **The entry.** Home's bar, fixed above its scroll view, offers the
  button `When I need…` first, at least 44 pt, exactly when the session
  has a plan made in this launch (the garden and the passages read):
  never in the pending frame, the first minute, an unread garden or over
  unread passages. It is disabled while a remove is pending, and a tap on
  it clears the remove's alert. Today offers none.
- **The screen** (`src/need/screen.tsx`, `NeedScreen({ cards, onField,
  onVisit })`) is the root's fifth screen, in place: a bar fixed above
  its scroll view holds `‹ Your field` (named `Your field`), which returns
  to home; in the scroll view the one heading `When I need…`, then the
  cards. It has no control named `Today`. Every text is Palette A's ink,
  at WCAG AA on the ground and on a card; nothing but a promise is a control inside the scroll view. It
  reads and writes nothing in the store.
- **The cards** are `needOf(garden, taught)` (`src/need.ts`), pure, in
  the situations' order: `protection`, `victory`, `peace`, `healing`,
  `forgiveness`, `guidance`, `provision`, `comfort` (the brief's fear,
  temptation, worry, sickness, guilt, guidance, need and grief), then
  `strength`, `spirit`, `salvation`, `return`, `prayer`, `rest` (Selah's
  order). A promise is known when every verse of it has a plant in the
  read garden, at any stage; references match exactly, so a verse learned
  only in phrases so far is not known, and counts in `<n> still to learn`
  until its join is planted. A taught card
  always shows; any other only once one of its promises is known (the
  first minute's Isaiah 41:10 shows under `Strength`). A card (testID
  `need-card`) shows its title (`need-title`, plain text, never a
  heading), then each known promise in the collection's order as a
  button (testID `promise`) named by its reference (`Psalms 91:1-2`); a
  taught card with promises not known adds `<n> still to learn` (testID
  `to-learn`). No other number, no lock and no word of a paid tier.
- **A visit.** A tap on a known promise runs `visitPromise`
  (`src/app.ts`, `Session.visit`): the promise's verses, in order, become
  the visit, each a review (`fresh: false`) whose baseline is its plant's
  recalls at the tap (read behind every keep handed in before it), its
  piece the verse whole, never its phrases: the corpus text grouped by the
  collection's title; then the
  screen is Today. A new visit replaces the one before; nothing is made
  before the first plan or in an unread garden.
- **Today over a visit** shows the held item if any (a visit never drops
  a held result), else the visit's first verse not done (done: its plant
  holds more recalls than its baseline), else the plan's first item not
  done. `Say it` recites the verse under the ladder's cue for its own
  plant's stage (whatever phrase plants it has) and keeps the recall under
  the verse with its word count, as any of Today's, so FSRS schedules from
  it; it
  offers no `Listen`. Its result, grades and `Next` are Today's, and
  `Next` shows the visit's next verse. A visit verse that is also a plan
  item is done in the plan too. The counts line is the plan's alone.
- **A visit lives as the hold lives:** a making with no recital under way
  (a Minutes tap, a return to the foreground, a landed add or remove)
  drops it with the hold; a making while a recital is under way keeps
  both. The field, About and When I need… and back keep it; a relaunch
  has none. Nothing of it is stored: the only writes are the recalls
  said.

## The Handbook lists

Stephen N. Haskell's _Bible Handbook_ (1919) is data the app holds as
lists of references, each named by Haskell's own heading, grouped under
his sections. No screen shows them yet: the shelves in Add verses and
planting a list are a later unit, and only the development probe
(`app/probe/handbook.tsx`, `heartseed://probe/handbook`) reads them,
counts only.

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
  one list; ids are `bhb-<para>`. Two lists may share a title (a section
  and its one list, or `Second Chapter of Daniel` twice); ids tell them
  apart. No word is added to a title.
- **Teaching sections only** (owner, 2026-11-09). `LEFT_OUT_SECTIONS`
  leaves out eight practical sections whole (`Health and Temperance`,
  `Dress`, `Diet and Dress`, `Business Principles`, `School of the
  Prophets`, `Bible Etiquette`, `City Work`, `Organization of Local
  Churches Officers`); the generator refuses to run when one of those
  titles is missing from the contents, so a renamed title fails loudly.
- **The data** is `data/handbook.json`: its source, 25 sections, 131
  lists, 2,529 ranges over 3,542 distinct verses, each list 4 to 183
  verses, one list per line so a diff reads list by list; and its 15
  skipped records (3 past the chapter, such as `Romans 3:20, 77`; 9 over
  20 verses; 3 unread, such as `Genesis 7-11, 12`). Ten more sections
  give no list, written as prose, a table or with no linked reference in
  a line's lead (`Introduction`, `The Two Covenants`, `The Earth`, …).
  `src/handbook.ts` decodes it once and exports `HANDBOOK_SOURCE`,
  `HANDBOOK` (each section its lists, each list a `Collection` of
  `Range`s) and `HANDBOOK_LISTS`; nothing in `src/app.ts`'s graph imports
  it.
- **Regenerating.** Copy the database and its `-wal` into a scratch
  folder (never open the owner's file in place), then
  `bun run handbook -- --db <copy>`; it opens the copy read-only, writes
  the same bytes for the same inputs and prints
  `handbook sections=25 lists=131 ranges=2529 verses=3542 skipped=15`.
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
  visit, the hold, the choice, the ask and the screen all gone. An unread
  garden opens Today.
- **Home's first frame.** Home shows the pending frame (the reference
  alone) until the garden, the passages, the taught collections, the
  session and the greeting are known and, over read passages, the
  launch's plan is made (`FieldOf` begins the session at home's first
  show), so every frame of home over read passages holds the counts line,
  the plan's from its first frame.
- **The ways to Today** are three, each writing nothing but what its
  session command writes: `Begin` (while the run shows an item, or over
  unread passages with the first piece to say), `Start here with
  <reference>` and a known promise tapped in When I need…. Today goes back
  by `‹ Your field`, When I need… by its own `‹ Your field`; no screen has
  a control named `Today`, and whenever Say it listens the screen is Today.

The development probe
`app/probe/home.tsx` shows them as text over the live garden, passages and
session (verify-heartseed, `features/home.md`).

- **Verses and lists** (`src/lists.ts`; owner, 2026-11-09: one Verse type
  and one List type). A verse is its reference as `verseReference` writes
  it, and its plant is the garden's plant at that key; a phrase's plant
  folds into its verse's. No list owns a plant or is stored beside one, so
  a verse in several lists shows one stage and one ready mark in each.
  `placeOf(reference)` gives the verse's book, chapter and verse only for a
  canon verse that round-trips exactly (no phrase, no trailing space, no
  abbreviation, no verse 0 or past the chapter's end). A `List` is a
  `FieldPassage` with an `id` and a `source`: `Own` (the app's own row,
  `own:<title>`), `Passage` (a range in one chapter, carrying its `range`,
  `passage:<index>:<book>.<chapter>.<first>-<last>` by its place in the
  stored list), `Collection` (`collection:<id>`) or `Loose` (a verse no list
  names, `verse:<reference>`). `listsOf(own, view, collections)` gives the
  own rows, then each held range in stored order (none while unread), then
  each taught collection; `fieldPassagesOf` returns it, so the field's rows
  are as before. It is a read model over today's keys: nothing migrates,
  and no key is added.
- **Furrows** (`src/home.ts`). `furrowsOf(garden, lists, ready)` gives one
  furrow per row of `fieldOf`, in row order, each with its list's id,
  title and source, later rows `Loose`; its kind (`kindOf`: own, held,
  taught, other), its icon (`iconOf`: a bow for the own row and a
  collection, a harp for a psalm, a lamp for a proverb, else a scroll), its
  ripe count (`<k> of <n> ripe`, its plants at full corn) and each plant's
  stage, ready mark and label (`<reference>, <stage>`, then
  `, ready today`). `HomeIcon` names the icons the home draws.
- **Icons** (`src/home/icons.ts`, `assets/home/`). Each `HomeIcon` (add,
  blade, bow, corn, ear, harp, lamp, moon, scroll, seed, sun) is a
  hand-drawn 48 × 48 master, `assets/home/<name>.svg` (the ten of the
  Sideshow's set and a moon in their manner), drawn for each scheme as
  `<name>-light.png` and `<name>-dark.png` (App icon and launch screen).
  `ICON_IMAGES[name][scheme]` is the PNG's import, an asset id under One,
  typed `number` by the `.d.png.ts` beside it; a name added without its
  two PNGs fails the typecheck. They are 144 px, so a screen draws them at
  48 pt or less. The probe shows all 22 and how many loaded
  (`home-icons`); the field draws the furrows', the plants', the legend's,
  the greeting's and `Add verses`' icons; Today's stage line and the first
  minute keep `PlantMark` (`src/sayit/draw.tsx`).
- **Ready** (`readyOf(plan, garden)`, `src/home.ts`): the verses (a
  phrase's folded in) of the plan's items not done; none before a plan, and
  a visit marks nothing.
- **The greeting** (`greetingAt(at)`, `src/home.ts`): by the local minute
  (`minuteOf`, the zone's offset at the instant), `Good morning` from
  04:00 and `Good afternoon` from 12:00 with the sun, `Good evening` from
  18:00 to 03:59 with the moon.
- **Start here** (`startOf`, `src/home/start.ts`; `Session.start`,
  `startHere` in `src/app.ts`). A tap on a verse starts, in order: nothing
  before a plan; the plan's earliest open item on the verse, exactly as
  planned (a phrase starts its phrase, the new piece stays fresh); a
  review of a planted canon verse from its recalls now, its piece the
  session's or the corpus text; else nothing (a verse not planted yet). The
  session makes it the visit, replacing any visit and keeping the hold,
  the plan and the minutes; it lives as a visit lives. Nothing is stored.
- **Shelves** (`SHELVES`, `offerStateOf`, `src/shelves.ts`): what Add
  verses will offer (hsshelves): any passage (the chooser), the Psalms, the
  Proverbs and John's picks, then each collection the session does not
  teach, each pick and promise a `Passage` list. `offerStateOf` says
  `unread`, `in field` (every verse already on the field), `full` (3
  passages held) or `plant`.
- **What grew** (`grownOf`, `src/home/grown.ts`): the verses of a run's
  done items whose stage now ranks above their stage at the plan's making,
  each once, in plan order (hshomejoy draws it).

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
bucket. `modelsCopy` takes its two jobs and its R2 writes as parts, so
`infra/models/copy.test.ts` runs the command's own handler over fakes. The cache is the one `natural:serve` uses, `tmp/natural-models/` at
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
  ` dark`, `"dark"`, `sepia`, empty) read as System (`appearanceOf`). A
  tap on About shows its scheme at once and writes the word; writes go
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
  verses, `Plant`, When I need…'s promises) draws at opacity 0.8, which
  keeps light `ink` at AA on what lies behind it (0.7 fell to about 4.0:1). A
  disabled control (`look.disabled`, 0.6: the big button while it cannot
  be pressed, a pill or `Plant` while a remove or a plant is pending) is
  left out of AA, as WCAG leaves it. The big button's press scales it
  (`look.pressedButton`) and changes no colour. `src/test/look.ts`'s
  `seenContrast` composes these opacities and `pressedFaults` holds each
  control pressed in turn (`test:dark-screens`, `test:dark-screens-dark`).
- **What the tests cannot see.** happy-dom lays out nothing and draws no
  glyph: SF Rounded's metrics (a verse of 90 words, a long reference,
  `When I need…` beside `Your field`, the chooser's rows wrapping, not
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
  `virtual:heartseed-licence`, a happy-dom document); `test:infra`, `test:handbook-build`, `test:icon`, `test:home-icons`, `test:home-pixels` and `test:mirror` run with none.
  The rigs of Today's run (`src/test/today-rig.tsx`, `stage-rig.tsx`,
  `session-rig.tsx`, `first-rig.tsx`, `phrase-rig.tsx`, `run-rig.tsx` and
  `wake-rig.tsx`) render `<Root />` as every other rig does, so a read
  launch with a plant lands on home, as a reader's does. There the rig's
  model alone picks the step: `Begin` exactly when the model shows an
  item, after the rig has held home to its heading, `Begin`, the model's
  counts line and `rootFaults`; in the done state, home's
  `Nothing to tend now` with no `Begin`, then the walk's own way on (a
  generated walk ends the launch; `wake-walk` keeps home as a screen with
  an away, a wait and the launch's end; `first-rig` offers `Later` (the
  clock moved to the passage's due, then a relaunch), a relaunch and the
  late voice events; a fixed
  case names its way and asserts it). Every frame of these rigs is held to
  `rootFaults` (`src/test/root-rule.ts`), and an unread garden still opens
  Today with no `Your field` in any frame. `test:home-rigs`
  (`src/home/rigs.test.tsx`) holds each rig's entry to that: one read
  launch with the passage due per rig (screens `Your field` then `Today`,
  `Begin` shown before the step, no root fault, Today's passage with
  `Say it`), a done-state launch (no `Begin`, no Today frame) and an
  unread launch (Today alone).
  - `test:matcher`: `src/matcher.property.test.ts`, the matcher's generated
    recalls.
  - `test:hear`: `src/matcher` (the sounds-alike table's bounds, and each
    hearing in its word's place and nowhere else, against the model).
  - `test:voice`: `src/voice.property.test.ts` (the voice against its model,
    the choice over both keys) and `src/voice` (the read rule of the choice
    over every text of both keys and failed reads, `choose` in command
    order and in bursts, and the native module's guards).
  - `test:dictation`: `src/dictation.property.test.ts` (the dictation
    service against its model) and `src/dictation` (the scripted source,
    the hints, the native module's guards, and a held consumer of
    `changes` through a 10,000-input burst keeping at most the window and
    ending at the current view).
  - `test:sayit`: `src/sayit.property.test.ts` (Say it against its model)
    and `src/sayit` but its cue tests (Today's Say it in happy-dom through
    `src/test/today-rig.tsx`, the source Say it hears, and its guards).
  - `test:cue`: `src/sayit/cue.test.tsx`, `src/sayit/cue-say.test.tsx` and
    `src/sayit/cue-say-letters.test.tsx`, Today's cue in happy-dom through
    the same rig, reached from home by `Begin`: the passage at rest under
    each stage's cue, a recital under letters and under the full text, a
    recital not heard, an unread garden, each cue word's exact first letter
    and its AA contrast, and no run of the verse outside its words.
  - `test:cue-held`: `src/sayit/cue-held.test.tsx`, every pending frame of
    a held launch at each stage, then home and `Begin` after the release
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
    recall on the disk so the launch opens home, whose `Begin` leads to
    Today, each stage's look in the
    prototype's colours, full corn after a held launch, and no claim in
    any frame of a held launch), through `src/test/stage-rig.tsx`.
  - `test:today-reads`: `src/garden/today-reads.test.tsx`, the same stage
    over failed reads (every listing, every open: no claim in any frame
    of the session, and the recital kept or not) and over another verse's
    plant at full corn, which never shows as the passage's.
  - `test:first`: `src/first/flow.test.ts`, `src/first/screen.test.tsx`
    and `src/first/screen-b.test.tsx`, the flow's reducer against its
    model (`src/test/first-model.ts`) and the first minute in happy-dom
    over the real store on the device, launched by `first-rig.tsx`'s
    `screenLaunch` (the journey to one seed, `Continue` to home in its done
    state and, at the next due, `Begin` to Today at a seed; the voice off,
    a Next during a reading and a relaunch mid-flow, an unread launch, a
    held launch, and each letter in the cue's ink at AA contrast on its
    ground at rest and while its recital listens, while the hear phase's
    unread words, the phase line and the reference keep the mute; and every
    element of every phase at rest, of the hear phase reading and of the
    letters listening keeps base's look, the letters' ink alone left out),
    every frame held to `rootFaults`.
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
    `test:walk-planted`, `test:walk-reading`, `test:walk-taps` and
    `test:walk-today`: each `src/first/walk-<group>.property.test.tsx`,
    the same rig over a few generated devices from one seed. The generator
    draws every input the rule names (any disk, the voice's choice and its
    old switch, and launch read, held or not; a speak that
    lands or is refused and every kind of voice event; recitals that hear
    any subset of the words, end every way Dictation ends, or are held open;
    writes that land, are refused or meet a down device that recovers;
    queued taps; a relaunch anywhere; on home `Begin` when the model shows
    an item, else `Later` or a relaunch), steered toward the part's own
    group of coverage floors, which its generated devices alone must meet
    (`walk-today` holds Today's run after `Begin`: Next, the done state,
    Renew and a write landing on Today).
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
    the field with phrases folded into their verses against `fieldFoldRule`
    (`src/test/phrase-model.ts`) over 600 generated gardens (held, removed
    and taught rows, phrases sown none, some, joined or stale, near-miss
    references, every zone): `seed` for a verse in phrases, a removed
    passage's phrases as their verse's row by first recall, days sown over
    every recall and the harvest over verses alone.
  - `test:field-reach`: `src/field/reach.test.tsx`, Today's `Your field`
    outside its scroll view before and after a recital that grows the
    passage; a recital started in the turn of a tap on `Your field`, which
    keeps Today on screen through its result; and one view of Say it
    deciding both the control and home: with the root's news of Say it
    held back, a tap in the first frame that offers the control after a
    growing recital opens home.
  - `test:field-unread`: `src/field/unread.test.tsx`, no field and no
    `Your field` in any frame of a held launch until its read lands, then
    home, of an unread session (whose recital the next launch's home
    counts) or of the first minute; and
    `src/field/unread-keep.test.tsx`, an unread session whose listing and then its keep's read of its key fail, or
    whose every record read fails, while writes work: its finished recital
    is written with its zone's offset and the next healthy launch counts
    its day.
  - `test:field-screen`: `src/field/screen.test.tsx`, a launch on home,
    `Begin` to Today, then home by Today's `Your field` and back by
    `Begin`, in happy-dom over the real store on the device through
    `src/test/field-rig.tsx` (the rig lands on home, and holds every frame
    to the root's rule, `rootFaults` in `src/test/root-rule.ts`: one
    heading or the pending frame, `Your field` only on a read, quiet Today,
    When I need…, the chooser and About and never inside a scroll view,
    `Listening` only under Today, no control named `Today`, `When I need…`
    only on home, and home's and Today's nodes only under their headings;
    and to the field's rules: the way back taken only after a read
    completed, and each field frame the
    rule's rows with their icons and ripe counts, plants as buttons with
    their drawings (each image's source of the scheme now), days sown and
    harvest as seen and exposed, every text at AA contrast, and home A's
    frame rules, `homeFaults`, among them each `Add verses` drawn with its
    `add` icon of the scheme now and the row at least 56 pt tall; each
    open and way back leaving the
    whole disk and taking no write, remove or clear; `Begin` back only when
    Today showed `Say it` or `Next`, which it shows again): the way there
    and back through recitals, Again and a relaunch.
  - `test:field-garden`: `src/field/garden.test.tsx`, a generated garden past 140 other verses
    of any reference, canonical twins each its own plant, each label the
    exact reference and each verse number the text after its last colon.
  - `test:field-walk`, `test:field-relaunch`, `test:field-grades` and
    `test:field-again`: `src/field/walk.test.tsx`,
    `walk-relaunch.test.tsx`, `walk-grades.test.tsx` and
    `walk-again.test.tsx`, one generated device each (seeds 3, 60, 12 and
    31), generated sequences of opens, ways back, recitals, Again, peeks
    and relaunches through `src/test/field-walk.ts` (each launch on home,
    then `Begin`; in the done state, with no `Begin`, a relaunch at the
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
    launched on home; every frame held to `rootFaults`, one heading, no bar
    control, alert or limit line inside a scroll view, no add beside the
    limit line or at 3 held, nothing offered over unread passages, every
    field control, `About` and `When I need…` among them, disabled while a
    remove is pending, and every seen text of the field and the chooser at
    AA): stored lists of 0-5 or more passages with equal ones, garbled
    values and 1-3 failed reads; a round trip to Today by `Begin` (over
    unread passages `Begin` must show) or to When I need…, then
    `Your field`; a row's `Remove`, then `Keep`, another row, leaving, or
    the ask's `Remove` landing or refused, once, twice in one turn or with
    `When I need…` or `Keep` in the same turn;
    the bar's or the row's `Add verses` left or planted (each shown
    exactly when the other is); after every tap the field, the bar
    and the disk against `src/test/choose-model.ts` and the passages'
    model; each file's floors met by its own devices.
  - `test:about`: `src/about/screen.test.tsx`, About through the bar rig:
    from home, its `About` outside every scroll view and
    44 pt tall, About's one heading, the credits word for word, the licence
    equal to the file, every text at AA, the way back, nothing written and
    a relaunch on home; the foot's `Appearance` radios outside every
    scroll view, each 44 pt tall, the stored word checked (System for a
    near miss), at AA, nothing written with no tap and a tap writing its
    word under the appearance's key alone; `About` disabled in every frame
    of a pending remove; a recital started while About shows brings Today; and the
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
    plan's moment (Today's first `begin`, each tap) to the same model; and
    `src/session/phrases.property.test.ts`, the plan over long verses'
    phrases and joins against `planModel` over `expandRule`
    (`src/test/phrase-model.ts`) and `cueIn` against `joinCueRule`, over
    900 generated gardens (each verse's phrases sown none, some, ripe,
    ripe then Again, joined, whole or stale, a stray phrase plant, a piece
    twice, fifteen zones, morning and evening plantings, every minutes
    value), and `needOf` over phrase-planted promises against
    `needModel`.
  - `test:header` and `test:header-b`: `src/session/header.test.tsx` and
    `header-b.test.tsx`, each its own seed and devices of
    `src/test/header-walk.ts`, Today's header through
    `src/test/session-rig.tsx` (every frame held to `rootFaults`; a read
    launch lands on home, held to the model's counts and `Begin`, then
    `Begin`, or in the done state no Today frame and the launch's end):
    generated devices and launches (stored
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
  - `test:counts`, `test:counts-b` and `test:counts-c`:
    `src/session/counts.test.tsx`, `counts-b.test.tsx` and
    `counts-c.test.tsx`, each its own seed and devices of
    `src/test/counts-walk.ts`, Today's counts line through the same rig,
    home's line held to the same counts at each launch: generated devices
    (fresh installs planted
    through the first minute in the evening or the day, disks of the
    passage's history beside verses no piece names), launches in zones
    that change, at an evening planting's morning, the next 04:00 and the
    passage's due, unread and held, and commands (recitals heard, missed,
    unheard, refused or unwritten, Again, Minutes taps while Say it
    listens and after time passes, Voice taps, time, the field and back);
    after every step the line is `src/test/session-model.ts`'s counts of
    the plan it made at home's first show and at each Minutes tap, over
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
    recall writes and unread listings; every frame held to `rootFaults`,
    and every Today frame to the footer rule: no control in the scroll
    view but a missed word's mark, at most one action button):
    `src/run/footer.test.tsx`, home's `Begin` on a due device, then the
    action button and the grades under the scroll view through a recital,
    a grade and the field and back.
  - `test:run-walk`, `test:run-cues`, `test:run-hold`,
    `test:run-relaunch`, `test:run-edges`, `test:run-done`, `test:run-end`,
    `test:run-cells`: `src/run/run.test.tsx`, `cues.test.tsx`,
    `hold.test.tsx`, `relaunch.test.tsx`, `edges.test.tsx`,
    `done.test.tsx`, `end.test.tsx` and `cells.test.tsx`, Today's run
    against `src/test/run-model.ts` (over
    `src/test/session-model.ts`'s plan) on generated devices through
    `src/test/run-walk.ts` (each read launch on home, held to the model's
    counts and `Begin`, then `Begin` when the model shows an item, else
    the launch's end), each shown word held to its piece's cue,
    leaning toward whole plans (many pieces and groups, Next, every
    recital's ending, Again), the hold's moments (a Minutes tap while a
    recital listens or finishes whose plan holds the item first or leaves
    it out, a tap with a result or after an unheard recital, home and
    back, a relaunch), the edges (the first minute, the done state, unread
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
  - `test:wake-walk`, `test:wake-returns`, `test:wake-quiet`,
    `test:wake-clocks`: `src/wake/wake.test.tsx`, `returns.test.tsx`,
    `quiet.test.tsx` and `clocks.test.tsx`, Today's run walked through
    `src/test/wake-walk.ts` over `src/test/wake-rig.tsx` (the run rig with the
    host's state in the test's hands, each state sent taken by the session
    before the next step) against `src/test/wake-model.ts`, each read
    launch on home (`Begin` when the model shows an item; in the done state
    home stays the screen, with an away, a wait or the launch's end, and
    `Begin` once a return makes an item), leaning toward
    returns at every run state (the done state, a review, the new piece,
    Next pending, after an unheard recital or a refused write, on the
    field, every minutes choice), toward the returns that change nothing (a
    recital listening or finishing, the first minute's phases, unread
    launches, `inactive` alone and a second `active`) and toward the clocks
    (aways of minutes to a month, many returns, zones, evening plantings);
    each case's floors met by its own devices.
  - `test:wake-edges`: `src/wake/edges.test.tsx`, the first minute's phases
    and Continue's own plan on home, the pending frame and a subscription read in
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
    of the app's own pieces and of passages, against the model's, each
    long passage verse with its phrases (`withPhrasesRule`,
    `src/test/phrase-model.ts`) and the app's own with none.
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
    `reader-add.test.tsx`, `reader-add-back.test.tsx`, and
    `reader-remove.test.tsx` with `reader-remove-b.test.tsx`, generated
    readers through
    `src/test/reader-walk.ts` over the run's rig (the root over a disk, a
    recognizer that hears the verse said, a frozen clock, a zone, launched
    on home), in UTC, Los Angeles, Kathmandu, Lord Howe and Chatham,
    through home (`Begin` when it offers it, else a relaunch the next
    morning, a remove asked, kept, refused or tapped twice), Today
    (`Say it` then `Next`, Minutes, `Your field`, a relaunch after the next
    04:00) and the chooser (backs, taps by pattern, `Plant` refused,
    retried or tapped twice); after every command Today's shown verse,
    counts line and `Listen` against the plan made at each making over the
    reader's pieces, home's counts and `Begin` against the same plan, the
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
    passage and no `Remove` on it, and no taught row with the part left
    out.
  - `test:handbook`: `src/handbook`. `content.test.ts`, the Handbook lists
    (`src/handbook.ts`) over the committed data through the app's corpus:
    `HANDBOOK` equal to `data/handbook.json`, the totals pinned (25
    sections, 131 lists, 2,529 ranges, 3,542 verses, 15 skipped by reason),
    none of the eight left-out sections, no empty section or list, every
    range 1-20 verses of its chapter with text, ids unique as
    `bhb-<para>` and none a promise collection's, the source and no title
    holding "doctrine", each list's pieces and field row, and no When I
    need… card for a Handbook id.
  - `test:need`: `src/need/need.property.test.ts`, When I need…'s cards
    (`needOf`) against the rule written plainly in
    `src/test/promise-model.ts`: every subset of the Fear collection's 14
    verses with Fear taught, 3,000 generated gardens over all 188 promise
    verses with near misses and one verse alone of a longer promise, taught
    sets of none, one, several and all in any order, each case's floors
    met; then every card in the situations' order, an empty garden, and the
    first minute's promise under Strength.
  - `test:need-screen`: `src/need/screen.test.tsx`, When I need… through
    the root over `src/test/need-rig.tsx`, which holds every frame to
    `rootFaults` and the screens' rules (one heading, `When I need…` only
    on home and outside its scroll view, on When I need… the bar's
    `Your field` and no control in the scroll view but a promise, every
    control at least 44 tall and every text at AA): home's bar offering
    `When I need…` first, Today with `Your field` and no `When I need…`,
    the cards after the first minute with and without the `promises` part,
    and a visit of another collection's promise kept over Today's
    `Your field` and `Begin` both ways, said, then the done state, its
    recall the one write.
  - `test:need-offer`: `src/need/offer.test.tsx`, no `When I need…` in the
    first minute, an unread garden or over unread passages (home with
    `Begin` alone); and `src/need/offer-b.test.tsx`, none on Today, and
    none while Say it listens, home offering it again after the result.
  - `test:need-walk-a`, `test:need-walk-a-visit`, `test:need-walk-b`,
    `test:need-walk-c`, `test:need-walk-d`, `test:need-walk-e`:
    `src/need/walk-{a,a-visit,b,b2,c,d,e}.test.tsx` (`walk-b` and `walk-b2`
    both in `test:need-walk-b`), When I need… and a
    visit walked through the root (`src/test/need-walk.ts`, each launch on
    home, each command drawn from those the model's screen allows: on home
    `When I need…`, `Begin` or a relaunch; on Today `Say it`, Minutes,
    `Your field` or a relaunch; on When I need… a promise or `Your field`):
    seed 3's device 0 in `walk-a` and its device 1 in `walk-a-visit`,
    device 2 of seed 18 in `walk-b` and of seed 10 in `walk-b2`, two
    generated devices of seed 6 in `walk-c`, device 0 of seed 524 in
    `walk-d` and of seed 729 in `walk-e`, settled after every command on
    the screen the model names and held there to `shownModel`,
    `countsModel` over `planModel`, `needModel` and `fieldPassagesModel`,
    every frame to `rootFaults`, and to the disk's rule (no key added but
    the recalls said and the minutes after a tap), each part's floors met,
    the root's (`root:*`: launches on home, unread and over unread
    passages, `Begin`, no `Begin`, `Your field` with a result held, When I
    need… from home, back and a visit, a relaunch) among them.
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
    `grownModel` over generated histories, Again included.
  - `test:home-shelves`: `src/shelves.property.test.ts`, the shelves
    against `shelvesModel` (the collections derived as those not taught,
    every pick and promise choosable, ids unique, no paid words) and
    `offerStateOf` against `offerModel` over generated fields and passages.
  - `test:home-start`: `src/home/start.property.test.ts`, Start here at the
    session seam, walked as `test:session-visit` walks a visit: after every
    step the plan, the hold, the visit against `startModel`
    (`src/test/promise-model.ts`), its piece, `shownOf`, the counts and the
    disk, byte for byte the same across every `start`; each verse class's
    floor met, and a start before `begin` and over an unread garden.
  - `test:home-screen`: `src/home/screen.test.tsx`, the field in home A's
    layout through `src/test/bar-rig.tsx` (launched on home, every frame
    also held to `homeFaults`), in light and in dark, its expected values written out:
    the bar, the scroll view and the foot and what each holds, the
    furrows' icons of the scheme, a verse in two furrows chosen, let go and
    moved, `Start here with <reference>` only where a start is offered and
    Today showing that verse after it, `Begin` then on to Today, nothing
    written; and no add, remove or limit line over unread passages.
  - `test:home-clock`: `src/home/clock.test.tsx`, the field by the
    runtime's clock in light and in dark: a seed at its due after a
    Minutes tap marked with a dot filled `sun` at 3:1 against its plant
    chosen or not, `gold` nowhere, the counts line and `Begin` leading to
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
    passage due on pending frames, then home with `1 to tend · about 1
    min` and `Begin` in every home frame, no Today frame; an unread garden
    on Today with no field in any frame; garbled passages on home with
    `Begin` alone, no counts and no `When I need…`, `Begin` opening Today
    on the app's passage; a held read on pending frames, then home; a
    relaunch after a choice, `Start here` and `Your field` on home with no
    choice and `Begin` as the fresh plan gives it; and When I need… from
    home, back by `Your field`, and a known promise on Today, which holds
    no `When I need…`. `src/home/root-say.test.tsx`, a fresh install's
    first minute through `Continue` to home in the done state (no `Begin`,
    `When I need…` there, no Today frame after `Continue`), and Today
    with no `Your field` while Say it listens, then `Your field` to home.
  - `test:home-rigs`: `src/home/rigs.test.tsx`, the rig contract: each
    rig of Today's run (`today-rig`'s and `stage-rig`'s `mount`,
    `session-rig`'s and `run-rig`'s `launch`, `wake-rig`'s `wakeLaunch`,
    `phrase-rig`'s `mount`, `first-rig`'s `play`) launched on a read
    garden with the passage due under `watchedLaunch`: the screens
    `Your field` then `Today`, `Begin` shown before the step, no root
    fault, and Today's passage with `Say it`; a passage planted now (home's
    `Nothing to tend now`, no `Begin`, no Today frame); and an unread
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
  - `test:home-walk-a` to `test:home-walk-g`:
    `src/home/walk-{a,b,c,d,e,f,g}.test.tsx`, home walked through the
    root (`src/test/home-walk.ts`, a `need-walk` `Walk` over the root's
    screens: on home a tap on a plant of each class, a tap again,
    `Start here`, `Begin` when the model offers it, `When I need…` when
    planned, a landed remove and a relaunch; on Today `need-walk`'s
    commands and `Your field`; on When I need… its own), one device each
    of seeds 30, 10, 69, 74, 14, 2 and 119, part f's in the unread class
    (every listing fails: Today alone, with no `Your field`), held after
    every command, on the screen the model names, to `furrowsModel` and
    `readyModel` (full labels with `, ready today`), `countsModel`,
    `startModel` and `greetingModel` with `When I need…` exactly when
    planned, Today to `need-walk`'s oracle and the disk to its rule; every
    frame to `rootFaults` and every home frame to `homeFaults`; each part's
    floors met (part g's `Begin` over a said result held, which Today must
    still show).
  - `test:phrase`: the phrase cut and its reference form (`src/phrase.ts`).
    `src/phrase.property.test.ts`, `cutOf` against `src/test/phrase-model.ts`
    and its brute force over every partition for 13-22 words, for generated
    texts of 0-90 words (five scripts, astral letters, combining marks,
    numbers, every mark before and after a word, mark-only runs between
    words, every kind of whitespace), and `phraseReference` with `phraseOf`
    over round trips, near misses and generated strings;
    `src/phrase/census.test.ts`, the cut over all 31,102 verses: 28,417
    phrased into 85,244 phrases, 8,041 cuts at a plain gap and 31,282 at a
    comma, each phrase 4-12 words holding its own words, and the pinned
    digest of every phrased verse's ranges; `src/phrase/voice.test.ts`, the
    natural voice's `planOf` over a seeded sample of 700 verses' phrases,
    each phrase planned whenever its verse is, one mark per word at its
    UTF-16 run within the phrase's text.
  - `test:phrase-walk-a`, `test:phrase-walk-b`, `test:phrase-walk-c`:
    `src/phrase/walk-a.test.tsx`, `walk-b.test.tsx` with
    `walk-b2.test.tsx`, and `walk-c.test.tsx` with `walk-c2.test.tsx`,
    Today over four days (seven for `walk-b2`) with long verses learned
    as phrases, walked through the root (`src/test/phrase-rig.tsx`, each
    launch on home, held to the model's counts and `Begin`, then `Begin`),
    one generated device per file (devices 1-5, devices 2 and 5 teaching
    Fear), each starting with its verses' phrases sown none,
    some, ripe or joined: Listen reads the piece's own text and lights each
    of its words by its UTF-16 span, Say it's summary and record carry the
    piece's word count under its own reference, a held phrase survives a
    Minutes tap while its recital listens, and Next goes on, held after
    every step to `shownModel`, `countsModel` and `joinCueRule` over
    `planModel` of the expanded pieces, and to the disk's rule, each part's
    floors met.
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
  - `test:appearance-walk`: `src/appearance/walk.test.tsx`, the root
    through the bar rig as generated readers (launches over each stored
    text class and either system; a choice on About, landed or refused, a
    flip of the system, a relaunch, the field), every frame held to the
    frame oracle for the model's scheme, every commit that holds a new
    appearance (the launch's and each choice's) drawing the screens in the
    model's scheme in its layout phase, before it is seen, About's radios
    and the disk to the model.
  - `test:dark-today`: `src/look/today.test.tsx`, Today in dark and across
    flips of the system through the run rig, reached from home by `Begin`,
    as generated walks (Say it
    heard, with a word missed or unheard, a flip while it listens, a peek,
    a grade, Next to the done state, Minutes, the field and back, a flip
    between any two steps), every frame held to the frame oracle
    (`src/test/look.ts`) for the system's last value.
  - `test:dark-first`: `src/look/first.test.tsx`, the first minute's
    phases (hear while the voice reads, letters while their recital
    listens, alone, Planted, then home in its done state) in dark, each
    flipped to light and back, every frame held to the oracle and to
    `rootFaults`.
  - `test:dark-screens` and `test:dark-screens-dark`:
    `src/look/screens.test.tsx` (light) and `screens-dark.test.tsx`
    (dark), each a walk of `src/test/screens-walk.ts`: the field (every
    plant stage, a remove asked and pending), About, the chooser (books, a
    chapter, a verse chosen, `Plant`) and When I need…'s cards
    through the bar and need rigs, each flipped and back, each
    control held pressed in turn with its opacity composed. The bar, need,
    field and chooser rigs hold every frame to the oracle beside their own
    rules.
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
    plugin serves it). It leaves `scripts/icon.test.ts` to `test:icon`,
    `scripts/home-icons.test.ts` to `test:home-icons`,
    `scripts/home-pixels.test.ts` to `test:home-pixels`,
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
    title missing), and `data/handbook.json` as the writer writes it.
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
    mapped or kept; `recolour` against a rule written in the test over 400
    seeded texts (each master hex in any case, the kept ones, random
    six-digit hexes, three-, four- and eight-digit tokens, a bare `#`,
    filler; both schemes, floors on clean and unmapped texts); the table
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
