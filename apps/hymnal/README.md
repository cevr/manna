# @manna/hymnal-app

The hymnal app (One). This README covers how the app reads the hymns, how it
plays their recordings, and where the recordings live and how they got there.

## Web development

Use the real One client to verify web startup: follow
[Web client](../../.claude/skills/verify-hymnal/features/web-client.md)
for cold startup, migration from an existing optimizer cache, a warm restart
and the hydrated production build. Server HTML can contain the list and
stanzas even when the client fails before mounting.

`vite.config.ts` keeps Gesture Handler's deep Reanimated TSX probe and its
nested CommonJS helpers inside the web dependency optimizer. The explicit
deep include changes Vite's cache hash too; changing only the eligible
extensions does not invalidate an existing cache. The validation script
stays included so its CommonJS default export is available.

## The reader

One screen and a stack: the home screen lists all 695 hymns, number and
title. On a phone the list falls under sticky rows that name the hymnal's
topical sections (each hymn's topic is joined from the compiled
`topics.json` through `topicOf` when the app is bundled), and a find bar at
the list's foot holds `Search`, which grows into a search box (number,
title or first line) over the list, and the `#`. A hymn page shows the same
bar over the right end of its own bar, and its `Search` searches in place
over the page. A gear in the title row opens Settings (appearance, chords) as a
sheet. A hymn opens pushed over the home screen. A hymn shows its words in the order they are sung: each stanza
under its number, and the refrain written out each time it is sung.

- The words come from the compiled 1985 set (`@manna/hymnal`). The
  `virtual:hymnal` plugin (`vite/hymnal.ts`) derives them when the app is
  bundled, for the web and the native bundle alike, so the app opens offline
  and no derived file is committed.
- The colours are the brand's, Moonlit wheat (the wheat on the night), from
  its one source, `@manna/brand` (`packages/brand`), which the First the
  Blade site reads too, as the owner's pick "sky" (2026-10-25): the brand's
  painted sky as the second colour. `src/theme.ts` draws two families of
  roles from it in light and dark. The opaque roles: ground, ink, muted,
  line, accent, chord (the chords and the dials' current stop), soft,
  onAccent (the text on an accent fill), pressed and onPressed (a held
  accent fill and its text), panel and edge (the open dials' panel and its
  border), bar (the docked player bar), pill and onPill (the key button's
  lit pill and the dials' Reset, and their ink), and chosen and onChosen (a
  checked chip's fill and its ink), button and onButton (a filled
  control: the bar's marks and play, the wheel's lit item, the find bar's
  chosen disk), and selected (a chosen tab's fill). The glass roles, laid
  over any opaque role under the find bar's capsule: glass (soft at 85 %),
  onGlass (its words), onGlassMuted (its placeholder), and glassChosen and
  onGlassChosen (the disk behind its chosen control, on the button's fill,
  and that control's ink). Light is a cool white page under the night's
  ink, with the dusk's gold deepened for the chords; dark is the owner's
  Night field (2026-11-11, base C2): the night 42 % toward black as the
  page, the bar and lines mixed from it toward the sky, with the s1
  Analogous accents: a cyan for the numbers, the buttons and a chosen
  tab, and a periwinkle for the chords a step dimmer and more coloured
  than the words (owner, 2026-11-12: `oklch(0.75 0.13 283)`, so chords and
  words part at the same weight), each a fixed OKLCH value written as hex
  in `theme.ts`. A
  screen reads a role, never a hex value. On
  iOS each role is a `DynamicColorIOS` (`src/color.native.ts`), on the web
  a CSS `light-dark()` property (`src/color.ts`). Android keeps the
  system's colours. `src/theme.test.ts` holds every text role to WCAG AA on what it
  sits on, and the panel's edge to 3.5:1 on the ground. Selah keeps its own
  palette.
- The phone's list is a Legend List (`src/reader/HymnList.native.tsx`):
  each row of a kind has one height from the text size, the topic rows
  stick under the status bar, and the tab row sits above the first row,
  under the title (`src/home/Home.native.tsx`). Deep in the list, an upward
  scroll of 8 pt pins a copy of the tab row under the status bar and a
  downward one sends it away (`src/home/reveal.ts`, `src/home/PinnedTabs.tsx`),
  a layer moved on the UI thread with the pinned topic row under it
  (`src/reader/pin.ts`), so the list's rows and offset never move for it.
  The find bar (`src/home/FindBar.tsx`) stands wherever the `#` does: at the
  list's foot over the floating bar's top, and on a hymn page over its bar's
  right end. It rides the keyboard while search is open. The open search
  belongs to the screen it opened on (`searchOpen`, keyed by the path), and
  the stack's wrapper (`src/player/StackBottom.tsx`) draws its results
  (`src/home/Search.tsx`) over that screen and puts the screen out of reach.
- Search (`src/hymns/search.ts`) finds a hymn by its number in any form a
  reader writes one (`100`, `#100`, `no. 100`, `Hymn #100`, `number 100`),
  or by any line of any stanza or refrain half remembered: a typo or two in
  its longer words, a word or two left out, two words swapped, a modern
  word for an old one or the other way (`you` and `thee`). A title query
  lists the hymns whose title holds it first, in number order, and a hymn
  that holds a word comes before one a typo of it finds. On a phone a
  result found by a line other than its title shows that line under the
  title, quiet, in a taller row. Its index is built in memory as search mode
  opens, never at the app's start; `search.property.slow.test.ts`
  sweeps it over the whole hymnal. A test over the real hymnal asserts on
  hymn numbers, counts and booleans, never on a hymn, a `Found` or a string
  of its words, so a red run prints no hymn words.
- Meaning search (`src/hymns/meaning.ts`) finds the hymns about a query,
  and the hymns like a hymn, with no model at run time: a word table
  distilled from EmbeddingGemma (each word's vector at 4 bits) and each
  hymn's vector (8 bits), 13 MB in `assets/meaning/meaning.js`, a module
  whose strings are read when search mode opens or the sheet first asks,
  never at start. A query is the sum of its words' rows, rare words
  weighted more and the fifteen commonest words of the hymnal not at all;
  the hymns are ranked by cosine. `packages/hymnal`'s `bun run meaning` rebuilds the
  file from the pinned model (fetched by checksum into a cache outside the
  repository), the same bytes each time. The table is a Gemma model
  derivative, so `assets/meaning/` is under the Gemma Terms of Use, not the
  repository's MIT (its `LICENSE`, with their use restrictions as a
  condition), with their `NOTICE` and a copy of the Terms
  (`gemma-terms.js`); Settings → About carries the notice and shows the
  Terms on a press. On a phone, search
  mode looks for the hymns about the query after a pause of 150 ms in the
  typing (`aboutQuery`: none for a query with a digit or under three
  letters) and shows them under the five strongest matches, in a section
  `Hymns about this`, then the rest of the matches under `More matches`,
  each hymn once (`src/reader/rows.ts`, `resultRowsOf`).
- A hymn page's quiet topic line is a button, `About this hymn`, that opens
  a sheet (`/about?hymn=<n>`, `src/reader/About.tsx`): first `More like
  this`, the 8 hymns nearest by meaning, each a row that closes the sheet
  and opens its page.
- One's web navigators are headless, so `src/web/` draws a small header and
  search field on the web, and the web's home screen shows the search field
  above the list, with no topic rows. A phone never renders them.
- On the web a screen is mounted anew when the reader comes back to it, so
  the search's query and each list's scroll offset live in the app's
  registry (`src/reader/place.ts`), not in the screen. A list keeps its
  offset as it unmounts and opens there again before its first paint, and
  holds its opening props only until it is there. A list at its top renders
  as the server rendered it, whatever the window, so hydration keeps it.
  Every row is one line of one height (a long title ends in an ellipsis), so
  the list can open at any row at once (`src/reader/HymnList.tsx`). On the
  web a list puts the keyboard away only when the reader drags it with a
  finger, so its own scrolls never take the search field's focus
  (`src/reader/keyboard.ts`).
- Each row is a link (an anchor on the web): a press opens the hymn inside
  the app; Enter, a Cmd-click and "Open in New Tab" work as on any link.
- The unit tests (`*.test.ts(x)`, not `*.slow.test.*`) run as twelve parts,
  each a package script and a task of `turbo.json` that the commandless
  `test` task depends on, so the gate runs each as its own task and
  `bun run test:budget @manna/hymnal-app` times each alone (under 1 s). The
  `src` parts run with `src/test/setup.ts` as the preload (react-native-web
  for `react-native`, the real words for `virtual:hymnal`, a happy-dom
  document for the tests that press and type); `test:infra` runs with none.
  - `test:search`: the search half of `src/home` (`Search`, `pinch`, `zoom`,
    `findlook`, `FindBar`, `findglass`, `finding`, `reveal`), named file by
    file; `test:home` runs the rest of `src/home` and ignores those.
  - `test:tempo`: the tempo half of `src/player` (`TempoDial.reset`,
    `TempoDial.tap`, `tempo`, `tempo.beat`, `dial`, `find`,
    `finddrums.open`, `drums`, `findplace.property`, `findplace.static`,
    `glide`, `bar`, `button`, `title`), named file by file; `test:player`
    runs the rest of `src/player` and ignores those and `tunerbar`.
  - `test:bar`: the bar mounted whole over a player and a reader's store
    (`src/player/tunerbar.test.tsx`), apart because the bar's tree is
    the part's load.
  - `test:seek`: the held reader's two files of `src/reader`
    (`word-seek.test.ts`, `WordSeek.test.tsx`), named file by file;
    `test:reader` runs the rest of `src/reader` and ignores those.
  - `test:reader`, `test:follow` and `test:hymns`: their folders of `src`.
  - `test:tuner`: `src/tuner`, apart because its mounted screens are the
    part's load.
  - `test:rest`: `src/feel`, `src/offline`, `src/test` and the test files at
    the root of `src`, named file by file.
  - `test:infra`: `infra`, `scripts` and `vite`.

  Run one with `bun run test:<part>` here, or all with `bun run test
  --filter=@manna/hymnal-app` at the repository root. A new test file
  falls to its folder's part; a new file at the root of `src` must be named
  in `test:rest`, and one of a named half in its part and in its sibling's
  ignores. `scripts/parts.test.ts` holds the parts to the files on disk:
  each unit-test file runs in exactly one part, no part takes a slow file,
  and `src` runs under the preload. Each part's turbo inputs leave out the
  other parts' test files, never their sources, so an edit of one part's
  test reruns that part, plus `test:rest` and `test:infra`: `test:rest`
  holds `core-import.test.ts` and `jsx.test.ts`, which read every `src`
  file, and `test:infra` holds `parts.test.ts`. `test:infra` hashes the
  verify-hymnal journeys (`.claude/skills/verify-hymnal/features/`), which
  `scripts/sim/features.test.ts` reads; the driver itself is `@manna/sim`
  (`packages/sim`), run with the hymnal's values in `scripts/sim-app.ts`.
  `HYMNAL_LIST_SEED` reaches the browser tests through
  turbo's `test:slow`.

- `bun run test:browser` (`test/browser/`) renders the home screen's list and
  its search results on a server, hydrates them in Playwright's Chromium, and drives
  them: hydration keeps the server's list and a scroll made before it (the
  page hydrates once that scroll's own event has come, so the list must be
  told of it); Back,
  the header's back link and a switch to the other list (the test's own
  links between the list and the search), at offsets across the whole list
  and window heights from 320 to 1400 px, come back within one row with
  every row on screen drawn (a press at once whose list heard of the last
  scroll before it left is made again, up to three tries, and the run prints
  how many were); the search field keeps the reader's focus;
  and a row is a real link. Its cases are drawn from that whole domain by a
  seeded sampler (`test/browser/visits.ts`), every pair of values meeting in
  each run and each visit leaving from its own offset; the run prints its
  seed, and `HYMNAL_LIST_SEED=<seed>` runs its cases again. It needs
  Chromium installed once (`bunx playwright install chromium`).

## Chords

Chords disclose the instrument: the stored `chords` setting, off by
default and kept across launches, is one switch with three doors. With
chords off the app is a singer's hymnal: the words, the player and its
bar, `Tempo`, `Stanzas`, `Start` (`Intro`, `Click`), `Sound`, the reading
choices and the find bar all show, and nothing for playing an instrument
does. The doors stay: the bar's `Key` button is the guitar's head alone,
dim (value `Chords off`, hint `Turns chords on`), and a tap on it turns
chords on and opens nothing, on every hymn's page, one with no chords
too; the player sheet's `Chords` switch heads its `Chord settings` group
whenever the sheet holds a hymn; Settings' `Chords` switch heads its
`Chords` section. Turning chords on brings in the chords over the words,
the `KEY`/`CAPO` face on `Key`, its key and capo dials and its wheel, the
sheet's key and capo dials (over the hymn's own page, the hymn having
chords) and its `Chord placement` dial, and Settings' `Chord style`,
`Chord placement` and `Tuner` (where the tuner has an ear). With chords
off a hold of `Key` (350 ms) turns them on, as a tap does. With chords on,
on a hymn with a printed key, the hold opens the key button's wheel out of
`Key` (`src/player/wheel.ts`, the rule; `wheelmotion.ts`, its motion;
`KeyWheel.tsx`, its view). Its origin is fixed by the bar, 47 points from
the screen's left edge on the bar row's centre line, and `Key` is its
centre, ringed while the wheel is up; no dot marks it. Its items are
112-point pills on the Arc, rows 58 points apart over the bar and centres
on a quarter ellipse up and to the right: `Chords off` lowest, then
`Reset`, `Key ♯`, `Key ♭` and `Tuner` (with the ear) highest, up and a
little right, each in its own direction from `Key` (23°, 41°, 54°, 65° and
75°), so no item touches another, the bar or the find bar at any width
from 375 to 440 points. The items spring out of `Key` along their rays,
the nearest first, and at a release fall back into it, the picked one
last; with Reduce Motion they fade in and out in place. The page dims
under them, and the bar's other controls and the find bar fade and take
no touch (`wheelOpen`). Still holding, the finger slides; beyond 34 points
out and above the bar it is over the item whose direction is nearest its
own, which then lifts on the button's fill, with a dotted ray to it from
`Key` and a tick (`choose`). Letting go over an item does it once: the tuner,
the key a semitone down or up with the dials closed (`StepKey` in
`thumb.ts`, whether they were open or not; a turn of the key dial itself
keeps them open), the printed key with no capo, or chords
off; letting go in the middle or over the bar, or a cancelled touch, does
nothing. A press
that drifts 10 points before its hold is the bar's swipe's or the page's.
The wheel is hidden from VoiceOver, which reaches its items as `Key`'s
actions (`Open tuner`, `Key down`, `Key up`, `Reset key`, and the
`chords` switch). On a hymn with no printed key the hold turns chords on
or off. Chords turned off by any door close the bar's dials (`useThumb`
in `src/player/Dials.tsx`), and they stay closed when chords come back.
The tuner and chord-sheet routes stay open to a link; only their entries
hide.

While chords are off the recording plays in the hymn's printed key:
`settings.heardMove(n)` (`src/settings.ts`) is the hymn's stored move
with chords on and `still` with them off, and `LivePlayer` hands it to the
player as `moveFor`. It is derived and never written, so each hymn's
stored key and capo are kept and heard again once chords come back on.
Turning chords off while a moved hymn plays is a key change, on the path
a key turn takes.

`Chord placement` in Settings chooses On the beat (default), Simpler, or
As the file plays. Each hymn's player sheet has the same three choices on
an adjustable dial. Turning it stores an override for that hymn;
`Use global chord placement` clears it explicitly. Both choices survive
a relaunch and take effect during play without a recording command.
Placement changes numeric guitar anchors before Simple/Advanced spelling.
It changes no words, timing, sounding Key or capo. Only actual changes show.

With chords on, the page draws the hymn's guitar chords over its words. Each sung syllable
is a box with its chords above it in the body's own font, a word's boxes
stay together, and a line wraps between words; a chord wider than its
syllable widens the box, and inside a word the gap shows a hyphen. Both
alignment levels draw each chord over its syllable. Only changes show;
a line with no opening change starts with no chord above it. A plain part
shows its words alone, and a hymn with no chords says so. With chords off, a sung
line still shows its syllables, a hyphen inside each word, so a played
hymn's follow lights the syllable sung, on a line of either alignment level;
a line without note times (a plain part's, one held to even shares, or one
the recording does not play), or a line-level line another singing on the
same notes lays elsewhere, is highlighted whole. While chords are on,
`Transpose down`/`Transpose up` move the sounding key (`Key <key>`) through
the twelve keys, and `Capo down`/`Capo up` set a capo fret, 0 to 11, the
chords then shown as the shapes that fret plays (`Capo <n>, <key> shapes`).
Each hymn keeps its own move (`move.<number>` in the settings store).

With chords on, Settings → Chords chooses how the chords are shown
(`Chord style`, stored as `chords.style`, the same for every hymn; kept
while chords are off):

- `Simple`, the default, for a beginner: each syllable shows at most one
  plain chord (major, minor or seventh), only where the harmony changes, so
  a line keeps its words' spacing. `src/hymns/simple.ts` derives it from
  the full harmony as the page draws it: a seventh-family chord becomes its
  triad or seventh, a diminished chord the seventh it stands for, a sus the
  chord it resolves to, a stack its first chord, and a one-syllable passing
  chord between two of the same goes.
- `Advanced`: every chord as compiled, stacks and all.

Both styles follow the transpose and capo, and a change of style keeps the
hymn's move.

- The chords come in a module of their own, `virtual:hymnal-chords`,
  derived from the compiled set when the app is bundled (`vite/chords.ts`,
  served by the same plugin as the words): one compact string per hymn,
  about 780 KB in all. The words module is unchanged, and a hymn's string is
  decoded only when it is shown with chords on, once (`chordBook` in
  `src/hymns/chords.ts`).
- The chords are degrees above the hymn's key, spelled with
  `@manna/hymnal/chord` in the key the move reaches: the printed key at rest
  and after a whole octave, else the key a signature names on that pitch.
- `src/hymns/chords.property.test.ts` walks every hymn, section and syllable
  at every transpose and capo; its Simple cases hold every hymn's Simple
  chords to the rules above and to the same transpose and capo.

## The player

`src/follow/seek-targets.ts` is the pure musical seek seam: `targetsOf`
accepts uncut bundled timing and the displayed sung sections, applies the
stanza choice once, and preserves the original flat line index of every
retained occurrence. `targetAt` resolves an exact line or trusted compiled
word ordinal; `initialTarget` anchors intro, current playback and tail with
last-at-or-before shared times. Targets carry sung milliseconds, not recording
milliseconds, and never scale with tempo, chords or appearance. A word uses
its earliest syllable onset; shared onsets expose every ambiguous ordinal.
Stripped timing, even timing and unplayed score-tail lines remain line-only
score targets, not a claim of recorded word precision. Malformed geometry,
line counts or nonempty word arrays fail closed. The lexical count ignores
standalone punctuation, without renumbering the compiled word ordinals.
`playerOn` exposes an additive `hold.state`/`hold.send` transaction. Begin
acquires only current Playing topology, pauses once, and freezes the actual
pause acknowledgement. Select changes preview only. The first Release or
Cancel wins, including before pause acknowledgement: Release uses the
existing seek proof/retry path and resumes only after its acknowledged
landing; Cancel resumes the frozen origin without a corrective seek.
Unique player-created tokens and current settings snapshots guard every
continuation. Normal commands revoke synchronously before dispatch. The
optional seventh `TargetsFor` argument defaults to the bundled score and
sections; an inert fixture can supply its own score projection. The optional
eighth Sound atom participates in ownership checks. Existing callers keep
their defaults. `word-seek.test.ts` belongs to `test:player` and uses the real
score clock over a controllable silent Playback boundary.
`LivePlayer` owns `HoldLifetime`: route changes invalidate in a layout
effect, inactive/background notifications invalidate through AppState, and
cleanup removes the listener and invalidates. These events leave ordinary
navigation audio unchanged when no hold exists. Stanza topology, effective
requested Key, tempo, Intro, Sound, recording selection and Start generation
are checked from current atoms before each continuation, not only from
subscription notifications. Invalidation never restores or resumes an old
origin. A native operation already issued cannot be un-issued; later work
and completions remain token-owned. The slow hold acceptance file exercises
fixed refusal/retry/interruption traces and replayable seeded immediate and
deferred reference histories over the real player and score clock. It proves
numeric protocol behavior, not acoustic word landing or a continuous gesture.
The development-only route `probe/scrub` mounts `WordSeekProbe`: normal
projection, player and score clock over an inert silent Playback boundary
and isolated nonpersistent fixture atoms. Its numeric controls/readout test
wiring, not real reader gestures. The default route renders nothing unless
`typeof __DEV__ !== 'undefined' && __DEV__`; the slow hold acceptance renders
that guard and the fixture controls. The six numeric-only by-hand rows in
`.claude/skills/verify-hymnal/features/scrub.md` have no journey. Both slow
acceptance files are explicit in `test:slow`, outside every fast part.
The held reader below is the reader's one use of this seam. `seek-targets.test.ts` belongs to
`test:follow`; `seek-targets.property.slow.test.ts` independently enumerates
every corpus stanza subset, occurrence and word and generated numeric scores.

**The held reader** (`src/reader/word-seek.ts`, `WordSeek.tsx`,
`WordSeek.native.tsx`, `HymnPage.tsx`) lets a reader seek by the sung words
while the page's own hymn plays. A still finger on the words for 350 ms
(`HOLD_MS`, within 10 pt, `SLOP`) takes the hold through the player's seam
above: playback freezes at its origin, the choice starts at the player's
own first target, and dragging moves it on both axes at once, a sung line
for each 48 pt down or up (`LINE_STEP`) and a word for each 24 pt across
(`WORD_STEP`). A Select is sent only when the choice changes; lifting plays
from it once (Release), and the platform taking the touch, Escape, Pause,
a route, the page leaving view or its words moving (text size, font,
spacing, chords, viewport) cancels or revokes it once, without a seek. A
quick swipe or a drift past the slop never holds, so the page's scroll and
the pager keep their ordinary gestures; a press on a chord, the native
back-edge strip and the web's left 20 pt (`BACK_STRIP`) never start one.
On a phone the page's scroll and the pager's are each the gesture
handler's native gesture (`SeekScroll`, and the pager's own through
LegendList's `renderScrollComponent`), and the hold's recognizer blocks
both (`block`), so neither begins until the hold fails.
While held, the native pager's scroll is off (`seekHeld`), the page's own
scroll is off, and only the page seen (`ShownPages`, which the pager tells
on each settle without drawing its pages again) can hold.

The geometry exists only while held: the page gains end padding of half
its viewport at each end, so the first and last lines can stand at its
middle, and each choice scrolls its line's full block to the middle
(`centerOffset`, at once under Reduce Motion; a newer choice wins over an
older measure answering late, and a measure the follow asked before the
hold, or before the page went, never scrolls). The middle is that of the
words left seen: the page less its foot, which is the sounding bar's rise,
the bar's `#` over it (`FindRoom`); the marker stands there, and the
choice is centred again whenever the foot changes. The chosen line takes an outline and the
chosen word an underline in the accent; follow's marks, hand-scroll
detection and Resume follow pause for the preview and come back as it
ends, restoring the frozen place or the released one. A line timed only by
its line (no word onsets) chooses by line alone: horizontal drags and the
word steps do nothing, and the page shows `Line timing only`. Words that
share an onset stay distinct ordinals; the status says the timing is
shared, and a release from either lands on the same time. The cues are the
ones Feel already plays: a grab as a hold takes, a tick per changed choice,
a release.

The page draws no button or panel for the seek (owner, 2026-11-11: the
hold and its drag are the whole of it). The way without a drag is
unseen: each sung line's accessible element (a boxed line's each box)
offers a screen reader the actions `Seek by line or word`, then
Previous/Next line and word while they move the choice, `Play from here`
and `Cancel`, which take, step and end the same hold (`useSeekActions`);
on the web the focused words take Enter, the arrows and Escape. While a
page holds, a status one point square and clear (`reader-seek-status`)
says the choice by row, sung line and word, with the numbers as its
accessible value; iOS also announces each new choice. `Seek by line or
word` is offered only while a hold would take now, as the player itself
decides (`hold.canBegin`, the rule its Begin keeps): Paused, a count-in,
another hold, a recording being replaced or a place still pending take it
away, and the phone's recognizer and the web's armed candidate read the
same value.

`test:seek` holds the fast traces; `word-seek.property.slow.test.tsx`,
appended alone to `test:slow`, runs seeded histories over the web, native
and steps surfaces against an independent reference: words drawn plain, as
syllables and boxed under chords, every reading setting, measures that
answer late in any order, a landing held back, the `#` coming and going,
the player's own commands and Reduce Motion; the steps surface comes by a
screen reader's actions or the web's keys. `pager.slow.test.ts` reads the
mounted recognizer graph on the phones' pager. The Sideshow feel page
the owner chose the constants from is a standalone audition, not the One
reader. Not proved by any test here, and left to the owner on a Release
build from main: native continuous hold-then-drag recognition, UIKit
arbitration with the pager and scroll after activation, multitouch, the
acoustic landing of a word, actual haptics and VoiceOver navigation.

Play on another hymn's page replaces the held hymn at that page's own start and saved Key. Navigation alone keeps the held hymn. `Command.Start({ track })` is the normal start/swap command for reader and browse controls. Each Start owns its status reads, including Starts in one clock millisecond; late replies cannot describe the replacement. A full sheet route for another hymn also offers that hymn's Play while the held hymn sounds. The bar and sheet share `PlayPage` and the same command.

A hymn page plays the hymn's 1985 recording from `audioUrl(n, offset)`: a Play or
Pause button in the button role (a `UIButton`'s title on iOS, a `button`
fill under the `onButton` text on the web and Android, and the loading
spinner in `button`; `src/player/buttonrole.test.tsx`), a bar to seek, and the time played and the
length. The recording plays on when the reader leaves the hymn, and a bar
docked at the foot of the screen shows the hymn playing (its number, title and Play or Pause);
a press on it opens the hymn. Playing another hymn replaces the first.

The held hymn's saved Key selects its signed recording set (offset -5…6)
while chords are on; with chords off it plays the printed key (`heardMove`,
Chords).
From Playing, a Key change replaces One's global session at the retained
musical place plus elapsed preparation time. Loading, Buffering, a resume
from Paused and a Seek keep a fixed landing through preparation. Follow
receives the running replacement place, keeping a hand pause held.
A short gap is allowed; numeric
`player.key.settled` timestamps report it. A paused selection waits for the
next Play. Missing sets fall back once to printed key at the retained place;
the bar and sheet show that fallback, and a Play from Paused or Retry retries
the chosen Key. A remote Play while Playing keeps the sounding fallback.
Selecting the effective set updates the selection without loading or seeking.
Capo changes shapes only. It dispatches no playback operation. The
lock-screen and Media Session continue to use the global One session.
Recording hand-overs seek immediately after Play. If readiness refuses the seek,
it pauses before the retry wait and resumes after landing when Play is
still wanted. One starts before that separate Pause can take effect, so
opening-sample exposure remains unverified. An atomic paused-load/start-at
operation on One's global session is a later upstream follow-up.
`src/player/keyplay.slow.test.ts` covers these rules through the real player,
score clock and adapter with a fake device; it makes no sound.
`src/player/recording.ts` owns selection and fallback below the score clock,
so Sound on and a rewind from a silent tail use the same policy. Recording
identity travels explicitly with play options and status. A silent tail
keeps its clock when Key changes, then uses the chosen set on a rewind.

- `src/player/player.ts` holds the player: its states (idle, loading,
  playing, buffering, paused, ended, stopped, failed) as an Effect atom, and
  the commands that move it. It plays through the `Playback` service;
  `playback.live.ts` is One's `Audio` session (AVPlayer on iOS, MediaPlayer
  on Android, an `<audio>` element on the web). The page shows the reader's
  ask at once (a Play loads, a Pause pauses), before the device answers it.
  One's `Audio` sends no status events and no byte counts, so the player
  reads the status every 250 ms and proves what the device does from those
  reads (`src/player/proof.ts`).
- A read is the device's state at one unknown instant between its ask and
  its answer. Two reads with no act between them prove silence when the
  place stayed within 2 ms and both say `loading` or `playing`, whatever the
  gap; they prove sound when the place moved on and the second says
  `playing`. An act (a page command, a lock-screen press, a play from a
  place) that moves the device is pending until it lands, and a read's
  place never lands it: One answers a seek only at its completion, so the
  act lands at the answer of the page's seek (or of a play's seek) when the
  answer's place lies from its target (clamped to the length) to the target
  plus the time since the page learnt of it, each within 2 ms (One rounds a
  place), or the answer says `ended`. A read of `ended` lands every act. A
  lock-screen seek with a place is the page's own seek, asked again; a seek
  the device refused, answered outside its window, or a newer command cut
  off is asked again while the device holds the recording. Two reads at one
  place still prove silence while an act is pending.
  No pair is taken across an act or while one is pending, no length of a
  gap and no count of reads proves anything, and the player alone owns the waits; the adapter
  asks a play's place again while the device holds the recording, and never
  gives up by its own clock.
- The rules. **P1:** after each act that asks for sound (Start, Resume, the
  lock screen's play) the page shows Loading until a pair proves sound, or
  Buffering once the load (each `play`) has sounded; a seek or a
  lock-screen act before that proof keeps the tag. **P2:** Playing at the
  first read that closes a sound pair while the device says `playing`; a
  landing ends it until a pair after it. **P3:** silence proved for 2 s
  shows Buffering after the first sound, Loading before it. **P4:** a wait
  starts at the answer of the first read of the silence run after the
  latest act, never earlier, and each act starts it again. **P5:** Failed
  (offline, with the reader's place) and one `stop`, once silence has been
  proved for 15 s while the reader wants to hear and One's `Network` told
  offline 15 s before, both at one read's ask; a device that says `failed`
  shows Failed at that read. **P6:** online, the same 15 s after the first
  sound shows Retry beside Buffering, and the device plays on. **P7:** the
  reader's place is where a sound pair last left the device, or the latest
  seek since; Failed and Stopped carry it, and a Resume from them, from
  Buffering with Retry, or from the lock screen on any of them, plays from
  it. A Start plays from 0:00. **P8:** Ended once a read says `ended`, and
  only then; an end leaves no place, so a Resume from Ended plays from 0:00, or follows a phone that
  already plays the recording again (the lock screen's play acts before
  the page hears of it).
- The full player (`/player?hymn=<n>`, `src/player/FullPlayer.tsx`) opens on the bar's hymn; while another hymn sounds over the reader, its route also carries `page=<m>` and the sheet offers that page's Play. Once the player holds that page's hymn, the sheet keeps it on Pause too. With no route hymn it shows the held hymn. Its number and title is a button to the hymn's page (`src/player/title.ts`): the sheet closes and the page is pushed where it was (on iOS a page put in a form sheet's place by a replace has no back button), or the sheet only closes over that page; the track plays on. It says each state in a line under it:
  Loading and Buffering read "Loading the recording…" with Pause; Failed
  reads "The recording needs a connection." offline, else "The recording
  could not be played."; Stopped reads Paused. Retry (Resume) shows in
  a Failed player, and beside Buffering once it offers Retry. An act clears
  Retry, as it starts the wait again. The lock screen's announce runs beside
  the reads, never ahead of them.
- A Pause before the first sound stops the recording: the page shows
  Stopped with the reader's place, and the device lets it go. iOS keeps
  such a pause, but Android's MediaPlayer starts once prepared and the web
  rejects the waiting `play()`, so one rule serves all three: Stopped, and
  a Play from the place. A `paused` the reader did not ask for (an
  interruption, or a lock-screen pause) shows Paused, and the page asks the
  device to pause once: Android starts a recording paused before it was
  prepared and says `paused` over its sound (`HybridOneAudio.kt:199-204`).
- The order the rules rest on (inferred from One 2.8.1 and Nitro 0.37.1,
  not measured on a device): a phone applies a lock-screen press and calls
  the app's listeners in one main-thread task (iOS
  `ios/Nitro/HybridOneAudio.swift:698-727`, Android
  `HybridOneAudio.kt:971-1015`), and a status read resolves in a later one
  (iOS `:159` and `:826`, Android `:230-234`); Nitro sends the listener call
  and the read's promise to JS through one `CallInvokerDispatcher`
  (`cpp/utils/JSCallback.hpp:106-114`,
  `cpp/threading/CallInvokerDispatcher.hpp:24-25`,
  `cpp/jsi/JSIConverter+Promise.hpp:56-68`). So the page knows every press
  before it handles a read that shows it. On the web the Media Session's
  handlers are the page's own. A later One that tells presses on another
  path breaks this order, and with it the rule that one pair proves sound.
- Known gaps. **1:** a server that stops sending while online leaves the
  page in Loading or Buffering; after the first sound Retry shows after
  15 s. **2:** Android sounds from 0:00 for a moment before a play from a
  place lands (MediaPlayer's lead-in; a gap of One's session player, still
  there in 2.9.0).
  **3:** a host pause hides what happens inside it: a connection blip One
  tells no change for, or sound no read sampled, is unseen, and the page
  keeps the place from before it.
- The app announces the hymn to the lock screen and Control Center once
  per recording, once the device holds it, and follows their play, pause
  and seek: each press is a command of the
  player, as the page's own buttons are. On a phone the session moves
  first and tells the app; on the web the page sets the Media Session's
  handlers itself, after One's `play`, `stop` and `setNowPlayingInfo`
  (One's handlers wait for the element to play before they tell), so a
  press shows on the page at once (`src/player/playback.live.test.ts`).
  `vite.config.ts` turns on
  `native.app.audio.background`, so the prebuild writes the `audio`
  background mode (iOS) and the media playback service (Android).
- The bar is docked under the stack, above the home indicator, on every
  platform while the player holds a hymn (`app/(hymnal)/_layout.tsx`); the
  lock screen also controls the recording.
- The seek bar on iOS is the app's own (`src/player/Scrubber.ios.tsx`): a
  track, the part played in the accent, and a thumb. It is not
  `One.iOS.Slider`: One builds that slider with a step, always (it refuses a
  step of 0), and iOS 26 draws a stepped slider's ticks under its track,
  which at a second a step read as a stray line. Its touch is a gesture
  handler's pan, which holds the finger, so a drag on the bar never moves
  the sheet; a drag seeks once the finger lifts, a tap seeks where it lands
  at once, and VoiceOver adjusts it ten seconds a swipe. On Android it is
  `One.Android.Slider` (it seeks once the thumb rests for 300 ms, as the
  slider reports no release), and on the web a range input. On the web a press belongs to the pointer
  that opened it with the main button: it opens at that pointer's
  `pointerdown` and ends at the first of its `pointerup` (the drag seeks
  when it ends on another second than it began on), `pointercancel` or
  `lostpointercapture` (the drag is dropped); another pointer, another
  button and a key end nothing. The browser's `change` ends nothing, as
  Chrome sends none for a drag that comes back to where it began. The bar
  steps its own keys (the arrows, PageUp, PageDown, Home and End, by the
  browser's steps): a key's step seeks at once, inside a press or not, and
  a key that moves nothing (held at an end) leaves nothing behind. A value
  change with no press open (a screen reader's) seeks at once. After a seek, each
  bar holds the place sent until the player reaches it, or for 2 s. The
  played part of the track is in the accent, the rest in the line role;
  while the length is unknown the bar is disabled and its thumb is muted.
- `src/player/bar.property.slow.test.tsx` holds the web bar to these rules over
  seeded runs of presses, all eight step keys (held, repeated with
  `repeat` set, their keyup lost) and modifiers held (each event says
  them), other pointers and buttons, a screen reader's steps and
  playback's ticks, from anywhere on the bar and often its ends, in
  Chrome's event order.
- `src/player/world.property.slow.test.ts` holds the page to these rules in a
  world of One's devices (`src/test/world.ts`, measured constants from the
  iOS and Android captures): seeded runs on iOS, Android and the web of
  slow and silent loads, dry spells, iOS's closed socket, failures, host
  pauses with presses and connection changes inside them, lock-screen and
  page acts at any phase, landings that lag, and the end. The world judges
  the page at each step by what the device did, never by what the page
  proved, by the rules O1 to O10 (O10: a page turns from Playing to
  waiting only after the stand of silence); each earlier counterexample is
  a fixed case. A deep sweep runs by
  hand: `WORLD_SEEDS=8000 bun test --preload ./src/test/setup.ts
  src/player/world.property.slow.test.ts -t seeded`.
- The tests run the player over a device the test holds
  (`src/test/device.ts`): each state and move in `src/player/player.test.ts`,
  and the page's control and the bar, pressed in a document, in
  `src/player/ui.slow.test.tsx`.

## Feel

The controls are felt and heard (`src/feel/`): each touch that gives a cue
(`cue.ts`: a dial's detent, a wall, Favourite, a switch, Play, a radio, the
seeker's grab, its five-second ticks and its release, a topic taking the
list's pin) gets a haptic through One's `Haptics` and a short code-made
sound (`body.ts`), while Settings' `Sounds and haptics` (`settings.feel`, on
at first) is on. The sounds are rendered in TypeScript with seeded noise
(`voice.ts`) and played on iOS through System Sound Services, from the
app's own Swift package `native/feel` (One's native source, a local pod at
prebuild): the ring/silent switch mutes them, the haptics stay, and they
never touch the audio session, so a click lies over a hymn's recording.
`src/feel/guard.test.ts` holds the Feel and the package to that path. The
voice loads after the first screen in one background pass and logs
`[feel] ready sounds=<n> ms=<t> simulator=<bool>`; the simulator plays no
sound and logs each `[feel] play sound=<name> skipped=simulator`. A tick
plays no closer than 30 ms after the last; the web gets no body, and
Android haptics only.

## Tuner

- `src/tuner/pitch.ts` finds a guitar string's pitch in one frame of
  samples (`detect`, McLeod's NSDF over an FFT autocorrelation, 60 to
  1200 Hz at 44.1, 48 and 96 kHz), or none in silence and noise. A key at half the period gives
  way to the key at its double lag when that stands higher, so a pluck
  with strong even partials reads at its fundamental, not an octave up.
- `src/tuner/focus.ts` decides which frames show a pitch (`hear`, pure,
  from the start state `unfocused`; its `Focus` is opaque), so the gliding
  pitch of talk in the room does not move the tuner: a pitch shows once 4
  frames in a row read it within 10 cents (about 170 ms after a pluck),
  then follows the string within 20 cents a frame and rides out 2 missed
  frames; the 3rd lets it go. A reading under 65 Hz (mains hum) counts as
  none. A voice glides through most syllables, so it seldom holds that
  long; a drawn-out level vowel (a filled pause, "uhh") or a sung note
  can. `focus.test.ts` holds the rule's edges on steady tones and the rule
  on generated talk, room noise and plucks; `focus.property.slow.test.ts`
  sweeps their domains, plucks under room noise among them.
  `focus.screen.slow.test.tsx` holds the screen, which reads every frame
  through `hear`; the screen starts the focus afresh on each listen and
  each rest, and a shown pitch sets the string last heard
  (`focus.reset.test.tsx`).
- `src/tuner/tuning.ts` reads a pitch (`reading`): the nearest note and
  octave from A4 = 440 Hz, the nearest standard string (E2 A2 D3 G3 B3
  E4), its signed cents, and in tune within 5 cents. The tuner plays no
  sound.
- `native/tuner/Listen.swift` takes the iOS microphone in 2048-sample
  mono Float32 frames (session `.record`, mode `.measurement`; on its end
  it gives the audio back with `.notifyOthersOnDeactivation` in the
  category, mode and options it found, so a paused hymn's next Play
  sounds, and leaves a session another owner took as it is) and
  sends each to JavaScript; `onEnd` names why listening stopped
  (`interruption`, `route`, `failure`, `stopped`). It asks for no
  permission itself. `src/tuner/native.ios.ts` types it as `Listen`;
  off iOS `src/tuner/native.ts` has none, so the tuner hides there. The
  system's microphone prompt reads the `audio.microphone` text in
  `vite/app.ts`.
- `src/tuner/session.ts` is the sheet's rule as a pure machine (`step`):
  it reads the permission on opening, asks for it at most once in an
  opening, pauses a sounding player once before it listens, and never
  listens while the player sounds, the app is away or the sheet is
  closed; a start that resolves when nothing waits on it is given back.
  `session.property.test.ts` holds the rule over generated worlds. The
  same file names a string and its cents (`labelOf`), holds the needle
  to ±50 cents (`needleOf`), and lights a string after 8 frames in a row
  in tune on it (`latch`).
- `src/tuner/Tuner.tsx` is the sheet at `/tuner`, opened by the chord
  sheet's `Tuner` button, the key button's wheel's `Tuner` (its highest item, up and a
  little right of `Key`, and its `Open tuner` action) and Settings' `Tuner` row, each shown only where the tuner
  has an ear (iOS); the wheel and the row only with chords on, and the chord sheet is reached from a
  chord, which shows only then. It says the reading at most once a second,
  shows `Open Settings` when the microphone is denied and `Tap to listen
  again` when listening ended. In development
  `hymnal://tuner?feed=<string>:<cents>` (for example `A2:-12`) feeds it
  frames of that pitch in place of the microphone.

## App icon

The app is named Hymnal, and its icon is one blade of wheat:
`assets/icon/wheat.svg` is the one shape. `bun run icon`
(`scripts/icon.ts`) redraws every icon from it in Heartseed's colours, so the
two apps read as one family. `src/icon-colours.ts` holds them, copied from
`apps/heartseed/src/theme.ts`; the script, `vite/app.ts` and the icon test
read them there:

- iOS: light (Heartseed's gold blade `#d4a640` on its garden ink
  `#2c4542`), dark (the gold blade on its night ground `#142420`) and
  tinted (white on black), in `assets/icon/`.
- Android: the adaptive icon's foreground (the gold) and monochrome (white)
  layers, on a garden-ink ground the launcher draws.
- Web: `public/favicon.svg` (the dark icon's colours in dark mode),
  `favicon-32.png`, `apple-touch-icon.png`, and the manifest's icons, one of
  them maskable. The manifest's ground is the light launch screen's.
- The launch screen: `public/splash.png` (the ink's blade) and
  `splash-dark.png` (the gold's), each on a transparent square the launch
  screen centres 200 points wide on Heartseed's page grounds (`#f1f0e6`, and
  `#142420` in dark mode). The hymn list that follows keeps the app's own
  grounds, the sky's white and the Night field, so the screen steps to them
  in one frame. One's prebuild trims an opaque ground away, so the ground is
  the config's `backgroundColor`, not the PNG's.

Every face's mark stands at 4.5:1 or more on its ground (the icon test); the
light icon's gold on the ink is 4.58:1, so a deeper gold falls under it.

`vite/app.ts` holds the native app's name, icons and launch screen; `vite.config.ts` passes
it to One. A native build reads new icons only after
`bun run prebuild:native`. `scripts/icon.test.ts` goes red when a drawn file
no longer matches the script, so an edit to `wheat.svg` needs `bun run icon`.

## Recordings: R2 at hymns.cvr.im

The app saves a visible hymn's printed-key recording after a 750 ms dwell.
Play in another Key queues that set too; capo never changes its identity.
`src/offline/` owns two scoped workers and media files: application support
excluded from iCloud backup on iOS, origin-private files on web, one
storage per recording set (`storageOf`, `hymnal-recordings-<set>-v1`). A
hymn's files live in the storage of the set it plays from (`storageFor`,
by `setOf`), so a later set moves only its own hymns: every other hymn's
saved recording is still found, and a moved hymn's file left in its old
set's storage is a stray, never listed or played. Delete frees every saved
file, the strays, and each storage no hymn reads (`removeOld`). Web requests persistent storage for Download all; the UI
states that a browser may remove downloads. Startup indexing runs in the
background; playback can use remote while an entry is not yet indexed.
Save intentions wait for discovery so they join retained files, and Cancel
retires intentions still waiting for that index.
Media bytes never enter settings KVS. Saved copies live outside the browser HTTP cache. A completed
file resolves locally first. A failed local read invalidates it and attempts
the original remote URL once. Missing sets retain the normal Retry behavior.

Settings → Downloads offers all 695 printed-key recordings, completed counts,
saved MB and exact accessible byte size, cancel/resume and confirmed delete.
It shows an estimated total before Download all. Saves use bounded 2 MiB
ranges with only the CORS-allowed Range header and check each reply's strong
ETag. Only a complete, length-checked file with a media
header becomes available locally. Partial data resumes only at its exact
durable offset with a matching entity; otherwise it restarts. Delete and
cancel invalidate older work, including pending dwell saves. A storage failure
halts the queue. Download all retries failed changed-key identities too.
Delete also removes retired recording-set folders owned by the app.
React draws progress in one Settings leaf and
does not own the workers. `bun run test:offline` checks synthetic storage,
loopback HTTP and the public player without making sound. For a development
UI drive, `VITE_HYMNAL_RECORDINGS_ORIGIN` selects a loopback fixture. A release
always uses R2. Never use production Download all for a verification run.

The 1985 SDA Hymnal's recordings are in the Cloudflare R2 bucket `cvr-hymns`,
served publicly at `https://hymns.cvr.im`. The app builds each URL from
`src/remote.ts` (`audioUrl(n)` is `https://hymns.cvr.im/audio/<set>/sdah/<n>.mp3`,
`<set>` the hymn's `setOf(n)`: `warm-2` for 663, `warm-1` for every other hymn).
That module imports only `@manna/hymnal/recordings`, which imports nothing, so
the app, Vite and the infra all read it.

Key layout:

- `audio/<set>/sdah/<n>.mp3`: hymn `n` of the 1985 hymnal in a rendered set,
  with the number unpadded. The sets are `RECORDING_SETS` in
  `packages/hymnal/src/recordings.ts`: `warm-1` holds every hymn, `warm-2`
  holds hymn 663 alone (its one verse sung once for each of its six
  stanzas), and a hymn plays from the latest set that holds it (`setOf`). A
  set is rendered from the hymnal's MIDI files (`packages/hymnal/README.md`,
  "Recordings") and is never replaced: changed recordings are a later set
  beside it, listing the hymns it holds.
- `audio/sdah/<n>.mp3`: the recordings copied from the old S3 bucket
  (`sourcedKey(n)`). They stay, so going back is one constant.
- `data/`: reserved for the compiled hymn data.

Settings → About credits the instruments the sets are played on
(`src/about.tsx`), as the Salamander piano's CC BY 3.0 licence asks.

### The stack

`alchemy.run.ts` declares one resource, the bucket (`infra/bucket.ts`):

- The custom domain is `hymns.cvr.im`. The `r2.dev` host stays off, because it
  is rate-limited and meant only for development.
- CORS allows `GET` and `HEAD` from any origin, with `range` allowed for seeking.
  It exposes `content-length`, `content-range`, `etag` and `accept-ranges`.
- The bucket is adopted when it exists and retained on destroy, and
  `forceDestroy` is off. A deploy therefore never deletes the recordings.
- Only the stage `prod` exists. The stack refuses any other stage, because a
  second stage would take the same bucket and domain.

State lives in the Cloudflare state store. No CI workflow deploys this stack.

### The copy job

`bun run audio:copy` copies the recordings from the old S3 bucket
(`https://cvr-hymns.s3.amazonaws.com/<n>.mp3`, which the old Expo app still
plays) into R2. The code is in `infra/audio/`.

- It reads hymns 1 to 695 with S3 HEAD requests, because S3 refuses to list.
  On a single key, 403 means absent. Any other status except 200 is retried
  and then fails the key. It never counts as absent.
- S3 has no `388.mp3`. A key absent from S3 is filled from the owner's
  `cevr/sda-hymns` repo, pinned at commit `4645e76c`. The job uses a fill only
  after its size and git blob SHA-1 match the tree. Each fill prints its own
  `fill <n> github <bytes>` line. More than 10 fills prints a warning, because
  S3 may be refusing reads.
- It checks each upload: S3's bytes must match their ETag's MD5 (for a
  multipart ETag, their size), and R2's reply must carry that MD5 and size.
  At the end, the job lists R2 again and checks all 695 keys.
- It is idempotent and resumable. A key that R2 already holds with the same
  size and MD5 is kept. A failed key does not stop the other keys, also when
  an answer breaks after its headers. The run exits non-zero when any key
  failed or is missing, and a rerun copies only what is still missing.
- Both R2 calls go through distilled's Cloudflare protocol, so they fail and
  retry as distilled's own calls do: up to 8 retries with capped backoff.
  Distilled retries a 403 only when its message names a transient auth blip
  (code 10000 "Authentication error", code 10001 "internal error" or "Unable
  to authenticate request"). A permission denial, such as code 10001 "Method
  not allowed for token", fails at once. A final failure keeps Cloudflare's
  code and message. Each download, each upload and the R2 listing fail after
  3 minutes without completing, retries included.
- `x-amz-meta-title` is not copied, because the REST upload has no custom
  metadata. Titles come from the hymnal's own data.

`bun run audio:copy --dry-run` reads only the public sources: the S3 HEADs,
the GitHub tree, and the fill's bytes. It does not touch R2 or the Cloudflare
profile. It prints what would move and ends with:

```
audio-copy dry-run s3=694/1574581124 github=1/2991377 missing=0 total=695/1577572501 target=unread
```

A real run ends with
`audio-copy run … target=kept K uploaded U failed F verified V/695`.

`bun run test:infra` runs the copy job's tests against fake stores, and
`bun run test:slow` the adapters' (`infra/audio/adapters.slow.test.ts`) over
a recording HTTP client. Neither uses the network.

### The upload

`bun run audio:upload --set DIR` uploads a rendered set (the folder the render
writes, `~/.cache/manna-hymn-render/sets/warm-1/` by default) into R2 under
`audio/<set>/sdah/<n>.mp3`. The code is `infra/audio/upload.ts`, and its plan
is `infra/audio/upload-plan.ts`.

- It refuses the set before any upload unless its `manifest.json` is a set
  the app plays and holds exactly that set's hymns (1 to 695 for `warm-1`,
  663 alone for `warm-2`) once each, each with its own key and each passed,
  and unless every MP3 has the manifest's sha256, MD5 and size.
- It lists the set's prefix once. A key R2 holds with the manifest's size and
  MD5 is kept. A key R2 lacks is uploaded, 4 at a time, as `audio/mpeg` with
  `cache-control: public, max-age=31536000, immutable`, and R2's reply must
  carry that MD5 and size.
- A key R2 holds with other bytes is a conflict. It is never replaced: the run
  says to render the hymn into a later set. That refusal is what makes
  `immutable` true.
- At the end it lists the prefix again and checks every hymn. A failed hymn
  does not stop the others, the run exits non-zero unless every hymn of the
  set is verified, and a rerun uploads only what is still missing.

`--dry-run` reads and checks the local set only. It does not touch R2 or the
Cloudflare profile. Both modes end with
`audio-upload <run|dry-run> set=<set> kept K uploaded U conflict C failed F verified V/N`,
N the set's hymns (695 for `warm-1`, 1 for `warm-2`).
A real run writes with the owner's Alchemy Cloudflare profile, as the copy job
does, and runs before the change that points the app at the set reaches
`main`, so the app never plays keys that do not exist.

### The key sets

`bun run audio:stream --keys all` renders the Warm band in the 11 other keys
the Key stepper reaches (+1, -1, +2, -2, ... +6) and streams each hymn to R2
under `audio/<set>/sdah/<n>.mp3` (`warm-1-up2`, `warm-1-down3`). The code is
`infra/audio/stream.ts` and `infra/audio/stream-job.ts`. The key sets go to R2
only, never to the GitHub copy of `warm-1`. `--set <name>` (default `warm-1`)
names the set whose key sets are streamed: `--set warm-2 --keys all` streams
663 into `warm-2-up1` … `warm-2-down5`.

- Each hymn renders in its own `render.ts --set <set> --transpose <t>`
  process, which waits while the load is over `--load` (12 by default).
  `--parallel` (4 by default) hymns run at once. `--hymns 1,46` takes some
  hymns only; by default every hymn the set holds, and a hymn the set does
  not hold is refused.
- A hymn is rendered and checked, uploaded under the upload's rules
  (`audio/mpeg`, a year's `immutable` cache, R2's MD5 and size must match),
  read back from R2, and only then its MP3 and work folder are deleted. The
  disk holds at most `--parallel` hymns' files, and the set folder keeps the
  records and, after each key, its manifest.
- A hymn that fails a check is not uploaded; its record stays. A key R2 holds
  with other bytes is never replaced, and a failed upload deletes nothing.
- A rerun resumes: a hymn whose record passed and whose bytes R2 holds is
  kept, with no render and no upload. Stop it with SIGTERM.
- Each line goes to the console and to `stream.log` in the render cache:
  `key <set> hymn <n> rendered|kept|uploaded|failed`, the running totals,
  and a `key <set> done:` line for each key. The run exits non-zero when a
  hymn failed. It writes with the owner's Alchemy Cloudflare profile.

### Deploy and copy

The orchestrator of the run that made this app runs these steps after the
change merges, from its detached main worktree
`~/Developer/personal/.rifts/manna/hymnapp-main` (never the main
checkout, which another agent edits), in this order. It stops at the first
result that differs from the expected one:

1. `cd ~/Developer/personal/.rifts/manna/hymnapp-main/apps/hymnal && bun run plan`.
   Expected result: one create, a `Cloudflare.R2.Bucket` named `cvr-hymns`
   with the domain `hymns.cvr.im` and the CORS rule. Nothing else.
2. `cd ~/Developer/personal/.rifts/manna/hymnapp-main/apps/hymnal && bun run deploy`.
3. `cd ~/Developer/personal/.rifts/manna/hymnapp-main/apps/hymnal && bun run audio:copy`.
   Expected last line: `… uploaded 695 failed 0 verified 695/695`. Run it
   again. Expected: `kept 695 uploaded 0`.
4. Probe (read-only; anyone can run it after step 3):
   `curl -sI https://hymns.cvr.im/audio/sdah/1.mp3` returns 200,
   `content-length: 2313865` and `content-type: audio/mpeg`.
   `curl -sI -H 'Origin: https://example.com' https://hymns.cvr.im/audio/sdah/388.mp3`
   returns `access-control-allow-origin`.
5. Listing (read-only):
   `cf r2 objects list --bucket-name cvr-hymns --prefix audio/sdah/ --per-page 1000`.
   Expected: 695 keys under `audio/sdah/`, `audio/sdah/1.mp3` to
   `audio/sdah/695.mp3`.

A key that fails in step 3 is retried by running step 3 again: the job copies
only what is still missing, and its `failed <n>` line gives Cloudflare's code
and message. Never upload a key with `cf r2 objects put`: it percent-encodes
the key's slashes, so the object would not land at `audio/sdah/<n>.mp3`.

The owner's Alchemy Cloudflare profile must allow these writes:

- R2 bucket write and R2 object write.
- Zone and DNS write on `cvr.im`, for the custom domain.
- The account listing (`memberships.read`), so that Alchemy can find the
  account.

Every stack in this repo shares the profile, and Cloudflare is already
connected to it. If a step fails on scopes, the owner runs
`! bunx alchemy profile edit --reconfigure Cloudflare` and chooses All Scopes
(recommended). With Custom, he chooses at least `memberships.read`,
`zone.read`, `dns.read`, `dns.write`, `workers-r2.write` and
`workers-r2-bucket-item.write`, plus the scopes that the other stacks
(`apps/egw-search`, `apps/firsttheblade`, `apps/animations`) already use.
`--add Cloudflare` is only for a profile that has no Cloudflare yet: on a
connected profile, Alchemy refuses it ("already connected").

The S3 bucket stays. The old Expo app still reads it, so its deletion is the
owner's decision.

## Playback metadata

The chord and follow bundles join the same versioned numeric sidecars from
`packages/hymnal/data/playback` onto the read-only corpus words. The selected
melody supplies both syllable times and chord anchors. A melisma keeps its
syllable until the next syllable onset. Shared-note syllables have the same
onset. A played line with note times lights by syllable when its times fit
it (one per syllable, in order, inside the line). At `line` level, the
compiler's less sure placing of the words, it lights only when every other
singing of it on the same notes of the sung file lays it alike: a refrain
line each syllable on the same note, a stanza line opening within one note
(`vite/timing.ts`, `agrees`). A Plain part's line, a line held to even
shares, an unplayed line and a line-level line that fails that check keep
whole-line follow marks. Input hashes
prevent metadata from being joined to different corpus words.
One manifest fingerprints compiler inputs and lists changed projections.
The manifest's global fingerprint is generation provenance only. The build
checks each override's corpus digest, schema and word cuts; other hymns reuse
the corpus objects. Stale compiler or MIDI inputs never fail the app build.
Generation and the slow fresh-compile test catch staleness.
All 695 default sidecars and their numeric placement alternatives remain available. Their census records each part's
follow level. A mismatch names its reason and the regenerate command.
