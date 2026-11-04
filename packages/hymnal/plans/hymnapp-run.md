# hymnapp — "to parallelize some of this work, use /ui guidance /react /composition-patterns and the react-native skills"

The work, in the owner's words (2026-10-16/17): a hymnal app on One (onestack.dev) whose chords match the sheet music, each chord "right above the syllable where the harmony changes"; transpose with a capo fret; light and dark; "a plain hymn first with a toggle somewhere that turns chords on"; full glass design (react-native-gpui videos, Android's closest equivalent); Effect wherever possible with the official Effect atom React integration, local-first, cached and fast; move S3 `cvr-hymns` to Cloudflare R2 with Alchemy; the 1941 Church Hymnal too; chords from the MIDI ("i think its fine, lets use the midi"); the hymn decks get the syllable splits, last.

Host: claude (laptop) · Units at once: 1 agent (owner, 2026-10-21) · Gate: ~35 s warm (`bun run gate`, 31 tasks) · Reserved: publish, paid calls, force-push (the r2 deploy and copy are the orchestrator's after merge, owner 2026-10-18; the owner deleted S3 `cvr-hymns` 2026-10-18 after all 694 objects matched R2 by size) · Repo: ~/Developer/personal/bible-tools · Base: b27a9471b
Workspaces: git worktrees under `~/Developer/personal/.rifts/bible-tools/<unit>` (rift fails on this repo), branch `hymnapp/<unit>`. Merge = rebase on origin/main, gate, `git push origin HEAD:main` (ff only).

| Unit      | Depends on      | Workspace          | Agents                                                                       | Result                                                        |
| --------- | --------------- | ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| topicsdb  | initfresh       |                    |                                                                              | parked (owner: topics follow the films)                       |
| keyfollow | worship         |                    | owner note: the playing recording follows a key change made in the hymn view | blocked: not reproduced, waits on the owner (Owner questions) |
| selah     | reader          | .rifts/manna/selah |                                                                              |                                                               |
| hsdictate | hsmatch, simkit |                    |                                                                              |                                                               |

Later, not yet planned: `ch1941` (1941 Church Hymnal chords from page scans), `inexact` (the 7 MIDI files whose verses do not split: 126 225 262 292 403 453 580), `decks` (syllable splits into feat/hymn-decks, last by the owner's word), `selah` (planned: after reader, see Decisions; macOS stays SwiftUI until react-native-gpui ships a real package).

## Decisions

- Orchestrator, 2026-11-04, simlife decide: after the rewrite's verify passed, the live check found `sim boot` kept alive by a leaked fd. Counted literally, the rewrite's third failure; it ran as one narrow fix round instead of a second rewrite, because the three failures were three distinct classes and the rewrite's premise held in every check, the live one included. The planner's oracle measured wall time on a 20x clock, so its verdicts depended on host load; the orchestrator had it fixed to a simulated clock (`tmp/orchestrate/hymnapp/simlife/oracle-fix.md`).
- Orchestrator, 2026-11-04, voicedocs decide: hsvoice merged with the film docs test red, because the merge legs did not run it (the gate does not; it is a slow test). Every merge now also runs `cd packages/film && bun test ./src/docs.slow.test.ts` at the head and reads its fail count.
- Orchestrator, 2026-11-03, simkit part 1 decide: three failed rounds, all in one class: a path the driver reads, writes, builds into or installs from leaves its root through a symlink. The triggers were r1 the configured workspace and plist, r2 `dd/Build`, and r3 the `build.log` write copied from base. Every repair assumed containment is a check added at chosen call sites. The rewrite's premise is that the driver reaches the host only through one contained host layer (FileSystem and tool path arguments, checked at use against the Place's roots), with a property over every host call. The rewrite runs on a new branch `hymnapp/simkit2` from main. The old branch `hymnapp/simkit` (e3f39c010) is data, and its parity move may be ported. Write containment moves from part 2 into part 1; part 2 keeps HOME and teardown. Record: `tmp/orchestrate/hymnapp/simkit/rewrite.md`.

- Orchestrator, 2026-11-03, orchestrate update (dotfiles c496317, relayed by personal-5a): the machine is plan, implement, verify, with three roles. One verifier per round, from the other model family, on a clean checkout of the head, proves the change does what the spec says (the acceptance check, each new test red under its mutation, its own probes: a property, a model test, or a live drive) and that it follows the written rules (`CLAUDE.md`, the dotfiles principles, the owning skills). It files no Minor, Optional or nit. Opus-built units get a Codex sol thread (`role: "verifier"`) told `verify directly`; Codex-built units get an Opus `verifier` (agent types `planner`, `implementor`, `verifier` and `worker` since dotfiles b8e0983; the `orchestrate-` prefix is gone). This run has no separate review round or counsel round from here on. hsmatch r2's queued verifier brief was amended before its turn started.

- Orchestrator, 2026-11-03: the hymnal queue is done, so `selahone` planning ran (owner, 2026-10-26: "lets do selah after we're done current queue"). Its planner proved the iOS lane for a new One app (`one prebuild` needs `android.applicationId` even for iOS; Debug build 397 s; agent-device read Today, Isaiah 41:10 and its KJV text) and split Heartseed into 29 units, core loop first: selahone (the pilot), simkit, hsmatch, hsdictate, hssayit, hsgrow, then the rest of the first TestFlight build to hsship; Pro, texts, sync, Mac, site and Android after. The list, Done lines and decisions: `tmp/orchestrate/hymnapp/selahone/units.md`. The pilot `selahone` (apps/heartseed, `@manna/heartseed`, bundle id `app.heartseed`) runs first. (selahone)

Older decisions, answered owner questions and closed follow-ups: [hymnapp-run-archive.md](hymnapp-run-archive.md).

- Owner, 2026-11-03, on the phone look at today's main (chordmode, the tuner) and the two tuner questions: "looks good - yes tuner only shows plucked strings, keep it". (1) The phone look passes: the hymn opens in the simple view and the guitar head brings chords in. (2) The tuner shows a plucked string only; a bowed string, a held sung note or a tuning-fork app shows nothing, and any later tuner unit holds that as a spec rule. (3) The filler flashes stay: no unit pays about 46 ms on every pluck to hold "uh", "um" and held vowels at zero. So pitchfill is dropped; pitchring and pitchtalk (measured weaknesses, no owner-felt defect, after "looks good") are dropped by the exit rule and reopen only on a defect the owner feels; humgate stays dropped.

- Never use `git stash` in a manna worktree. Every worktree shares one stash list, and palette r2's drop briefly removed p6-guardloop's stash (restored). Every brief now says so. (palette)

- Owner 2026-10-19: the palette is A, Wada No. 167 (Ecru #c2ae93, Pale King's Blue #a7d4e4, Vandar Poel's Blue #064f6e), for the hymnal and for Selah. Selah is a free download with a $3.99 one-time unlock. The free tier is 3 passages, and the promise collections come with the unlock. The owner will talk through what else the unlock gives. Quote: "I'll pick A and let's do free plus unlock. We'll talk about kind of what does the unlock give us and um maybe, yeah, three passages and then promises become like an like a plus". (selah, reader1)

- Install layout: Bun's isolated linker with `publicHoistPattern = ["*", "!bun"]`, not the hoisted linker: One resolves its own dependencies from the app folder (isolated alone fails on `@vxrn/query-string`); hoisted put the npm `bun` (a peer of effect-bun-test) on `node_modules/.bin`, shadowing the Bun that runs scripts and breaking `merge-audit` (`--ignore-scripts`); `peer = false` dropped real peers (zod, RN babel). — fix the cause, appbase

- Selah goes to One for iOS and Android after reader; the SwiftUI macOS app stays as it is until `react-native-gpui` ships a real package (npm is a 0.0.1 placeholder, measured 2026-10-19). Owner, 2026-10-19: "a, start Selah on One after the reader https://github.com/anomalyco/hex might be useful for dictation. goal si to make dictation the preferred way to use it, make it delightful. maybe real time so they can see their mistakes as they speak if possible?" So dictation is the primary input, and the Done line includes live feedback: the words appear as they are spoken, held against the verse so a mistake shows while the user speaks. HEX (anomalyco/hex, MIT, Rust, macOS/Windows/Linux, active) is desktop-only, so it is a reference for on-device models and correction modes, not a drop-in. The planner researches the live path on each platform: iOS SpeechAnalyzer/SpeechTranscriber volatile results, Android SpeechRecognizer partial results, and a shared on-device model (whatever HEX ships) as the fallback. — owner, selah

- Selah's dictation is our own Nitro module (owner, 2026-10-19: "We can use nitro modules as well in the one framework, which could be good for these dictations"). It matches the research: One links Nitro packages automatically, because `ios/` and `android/` are regenerated by prebuild. One package in the monorepo, Swift (SpeechAnalyzer, then DictationTranscriber, then the on-device SFSpeechRecognizer) and Kotlin (on-device SpeechRecognizer with pause-proof sessions, hints and word times), streaming tentative and final words with times to the shared TypeScript matcher. `react-native-nitro-speech` is read for its recipe, not used (no word times; drops repeated words). The first selah prototype proves that a workspace Nitro package autolinks under `one prebuild` (inferred so far). — owner, selah

- The hymnal runs one agent at a time (owner, 2026-10-21: "Just organize you have one agent"; the shared budget gives hymn / selah 1 of the host's 4). The queue is serial: playstall r3 part 8 → part 9 → review → verify → census2 → one29 → topicdata → shell → render → indexes. A reviewer or verifier counts as the one agent, so each unit's roles run one after another. (all units)

- Owner, 2026-10-26: "With this new update to the framework, we can also probably make Sela using the one framework, the desktop macOS app". This replaces the 2026-10-19 rule that the macOS app stays SwiftUI until `react-native-gpui` ships: One 2.11 adds native macOS inside the default install (oneup `release-notes.md`). Unit `selahone` moves Selah to One, one tree for macOS first (the app the owner uses now) and iOS/Android from the same code, after oneup merges (it needs One 2.11.1 in the lockfile). Its planner first proves the macOS lane on a throwaway route (prebuild, a Release build, a window that opens), then specs the port: parity with the SwiftUI app's screens and its FSRS review loop, the stored progress carried over from the SwiftUI app's store, Wada 167 palette, glass, Effect atoms, and the dictation module as a Nitro module. The SwiftUI app stays until the One app reaches parity and the owner says to retire it. Hymn and Selah share one agent slot, so `selahone` planning runs after oneup and before playbulk's implement. (owner, selahone)

- Owner, 2026-10-26, Selah planning (in the orchestrator session): Selah becomes **Heartseed** (Luke 8:11–15), a voice-first app to memorize the whole Bible, "delightful … fun and simple and easy to use". Free: KJV, 3 passages of up to 20 verses, the Fear promises, sync. Pro: $2.99 a month, $14.99 a year, $39.99 lifetime (replaces the $3.99 unlock); licensed texts sold one by one. iPhone first, then Mac, then Android; no import from the SwiftUI app. Every decision with its quote: `apps/selah/plans/heartseed-brief.md`. (owner, selahone)

- Owner, 2026-10-26: "I have heartseed now. I've bought it. It's available" — the domain heartseed.app is bought (Cloudflare Registrar recommended). The Heartseed site deploys there when selahone builds it. (owner, selahone)

- Owner, 2026-10-27, on the CC BY-SA 4.0 Webster text in Heartseed: "put the CC. For the Webster text". Heartseed ships the Webster 1828 entries under CC BY-SA 4.0 with its attribution and licence notice in the app (an About/credits screen); share-alike binds the dictionary data, not the app code. (heartseed, webster)

- Owner, 2026-10-27, on topicsdb: "the topics will be based off the videos that we're making, kind of like, um, further study and more in-depth study on all the videos." topicsdb is parked: no topic pages are written ahead of the films. Each topic page grows from a published film (its script, verses and sources) as that film's further, in-depth study, beside its First the Blade study page; the 40 draft stubs wait for that. `manna wiki topics` keeps answering from the Nave catalog until then. (topicsdb)

- The web is not a product target for the hymnal or Heartseed; only marketing sites matter on the web (owner 2026-10-27: "The web is not a target we care about. The only thing we would care about the web would be the marketing side of anything"; earlier: "You don't need to verify on the web"). Verification runs on iOS only; web-only findings and follow-ups are dropped; the web build and its unit tests stay green but get no new work. playbulk P5 r3 on.

## Owner questions

- Heartseed "understand it first" lines (hsgloss): who writes them, from which sources? Recommended: an agent drafts one line per promise (158) from the KJV and its context in the pioneer frame, and the owner reviews them in one sitting before hsgloss merges; other passages get Webster 1828 word glosses only. (selahone, asked 2026-11-03) **Answer (owner, 2026-11-04):** agent drafts one line per promise from the KJV and its context in the pioneer frame; the owner reviews them in one sitting before hsgloss merges; other passages get Webster 1828 word glosses only.

- Heartseed Pro texts (hstexts): which public-domain texts beyond the KJV? Recommended: none in the first Pro release; name them when hstexts is planned. (selahone, asked 2026-11-03) **Answer (owner, 2026-11-04):** KJV only in the first Pro release; name others when hstexts is planned.

- Heartseed App Store setup (reserved for the owner): bundle id `app.heartseed` (permanent after the first upload), product ids `app.heartseed.pro.monthly`, `.yearly`, `.lifetime` at $2.99, $14.99, $39.99. Recommended: register when hsship is ready. (selahone, asked 2026-11-03) **Answer (owner, 2026-11-04):** register the bundle id and the three products when hsship is ready; ids and prices as listed.

- Heartseed licensed texts (hslicense, NKJV/ESV need publisher licences and fees). Recommended: defer until Pro has users. (selahone, asked 2026-11-03) **Answer (owner, 2026-11-04):** defer until Pro has users.

- Heartseed hands-free: spoken commands ("again", "next") beside the lock-screen and headphone controls? Recommended: yes, through the same speech module. (selahone, asked 2026-11-03) **Answer (owner, 2026-11-04):** yes, spoken commands ("again", "next") through the same on-device speech module.

- keyfollow: the key change that did not follow the playing hymn is not reproduced (simulator, three variations; an off-device fake follows the key every time). Next time it happens: which control turned the key (the key dial on the hymn page, or another), how many turns, and how long the old key kept sounding, on the current build. (keyfollow, asked 2026-11-01) **Answer (owner, 2026-11-04):** the owner notes the control, the number of turns and how long the old key kept sounding the next time it happens on the current build; keyfollow stays blocked until then.

- Heartseed dictation model download (hsdictate Decided 3): the first two engines in the chain (SpeechAnalyzer with SpeechTranscriber, then DictationTranscriber) need Apple's on-device speech model, often not yet installed; may Heartseed ask iOS to download it in the background (`AssetInventory`), the recital falling through to the on-device SFSpeechRecognizer meanwhile, against the first release's "no network calls"? Recognition and the reader's voice never leave the phone. Recommended: yes. (hsdictate, asked 2026-11-04) **Answer (owner, 2026-11-04):** "Yes, ask iOS".

## Follow-ups

- simheart (`tmp/orchestrate/hymnapp/simheart/`, merged 0ac60353c): the planner's check (`heart.ts`) does not read the skill for seven owner rules the verifier's mutants removed unseen (the 8191 and 8095 previews, the microphone kept revoked or granted by hand, `verify-hymnal` off limits, a snapshot kept with the report, a `--state` naming the hymnal's); the skill keeps them all today, and a docs-test or skill-lint guard would hold them; the shared driver's help mentions the web for an iOS-only app; both apps' `sim.ts` hold the same warm-checkout list; any app's `--state` can point at another app's state, so its `down` can stop that app's server (the stop rule checks identity, not the app); the cold Heartseed build left about 7 GB free, under the 12 GB build bar, until its rift's `ios/build` is removed.

- simlife (`tmp/orchestrate/hymnapp/simlife/`, merged 4b1c013e8): the hymnal dev server's typegen rewrites `apps/hymnal/native/feel/Voice.d.swift.ts` and `native/tuner/Listen.d.swift.ts` during `open`; a ledger lint that an owner entry cites words the owner said; filing a session across devices (EXDEV) fails as on base; two test-strength notes (`app.property` no longer checks the start script, and `host.scenarios`' socket hash differs from the product's outside the BMP); `@manna/sim`'s slow files total about 4 min, each under the 240 s alarm alone.

- hsvoice (`tmp/orchestrate/hymnapp/hsvoice/`, merged e954b1101): hssayit must not rely on `changes` for a reading's terminal event (a sliding buffer of 16 can drop it after a replacement plus 16 views; read `events`); Heartseed's `tsconfig.test.json` excludes `scripts/`; on the device, agent-device reports Today's heading as plain text although the source sets `role="heading"` (check in hssayit's live drive). The quiet-host budget was measured before the r3 rebase (matcher 0.85 s).

- simkit (`tmp/orchestrate/hymnapp/simkit/`, merged 6748f0194): parts 2 and 3 are `simlife` (scratch child HOME and owned teardown, per `split.md`'s ruling) and `simheart` (Heartseed adapter and both live drives); hsdictate waits on both. The planner's A6 oracle `contain.ts` walks links lexically and misses the alias and `..` class (the package's own oracle does not). On main, the hymnal web SSR fails with `Unexpected token 'typeof'` while `doctor` reports ok (web is not a target; `doctor` should read `server.err.log`). `one prebuild` reformats two tracked `*.d.swift.ts` files in the hymnal; recheck after hsvoice's oxfmt ignore merges.

- hsmatch (`tmp/orchestrate/hymnapp/hsmatch/`): the next Heartseed unit that adds tests splits `@manna/heartseed`'s tests into parts first (0.92 to 0.95 s alone).

- selahone (`tmp/orchestrate/hymnapp/selahone/`): the A5 core-import guard (T1, T2 in `round-3-findings.md`); `typecheck-coverage.ts` checks only packages/scripts; on main, `dead-exports` new=106 and `fmt:check` red on `source-maps.md`.

- nohashes (`tmp/orchestrate/hymnapp/nohashes/`): move film's `tools/digest.ts`, the First the Blade kit's `sha256` and animations `screening.ts` onto `Digest`.

- archdocs (`tmp/orchestrate/hymnapp/archdocs/`): the docs test should read a verify skill's declared scratch folders (`ROOT=tmp/verify/$RUN`).

- oxlint0321 (`tmp/orchestrate/hymnapp/oxlint0321/`): a review-safe offline lint entry (no credential read, no judged-store write), so reviewers run every lint leg.

- docsfix (`tmp/orchestrate/hymnapp/docsfix/`): the docs test's first-folder rule passes any path under an ignored top folder; the `Scrubber.android.tsx` doc comment is out of date.

- oxlint031 (`tmp/orchestrate/hymnapp/oxlint031/`): the docs test should read `docs/architecture/**` anchors by symbol; the `@vite-ignore` removal in `vector-accel.ts` is unproven (diff the egw-search worker bundle).

- verify-hymnal helpers to move into the skill (build the lever): the verifier helpers of tidyup, tempo, pintabs, tunerui and coldload (`tmp/orchestrate/hymnapp/<unit>/`), and tempo's rule to turn `Sounds and haptics` off before any dial gesture (`tmp/orchestrate/hymnapp/tempo/`).

- checkbulk (`tmp/orchestrate/hymnapp/checkbulk/`): a later census3 unit for S4 (1), (2), (4) and (5).

- numreplace (`tmp/orchestrate/hymnapp/numreplace/`): a One upgrade ports the same-name dynamic replace in `patches/one@2.11.1.patch`; reporting One's route-name fault upstream is the owner's call.

- recrate (`tmp/orchestrate/hymnapp/recrate/`): a One upgrade ports or drops `setPlaybackRate` in `patches/one@2.11.1.patch`; the owner's ear checks speed and pitch on the phone.

- wordlight (`tmp/orchestrate/hymnapp/wordlight/`): apply the agreement rule to lines already syllable-level, or fix the compiler's alignment; `apps/hymnal/turbo.json` build inputs omit `packages/hymnal/data/midi/**`.

- loop663 (`tmp/orchestrate/hymnapp/loop663/`): `failed === 0` in `offline/sets.test.ts` (B m1, carried by tunerauto, not yet taken); the render's default `--set warm-1` still lists 663 (A m1).

- tunerspot (`tmp/orchestrate/hymnapp/tunerspot/`): restore the encoding of three test names in `thumb.test.ts` (lines 80, 162, 179) from 880725a17, if no later unit did.

- seektap (`tmp/orchestrate/hymnapp/seektap/`): `hymn-list.journey.json` step `back-keeps-place` fails once hymn 31 is in the recent hymns.

- keyfollow follow-up (`tmp/orchestrate/hymnapp/keyfollow/repro.md`): tail-7, when a key's recording is shorter than the held place, playback goes silent (`apps/hymnal/src/player/sound.ts:170-171`); the owner's path does not reach it.

- versecheck (`tmp/orchestrate/hymnapp/versecheck/`): a hymnal slow test pinning every hymn's verse starts (carried into keyfollow, which is blocked); 225 and 262 still held; unhold 403, 453 and 580 on proof.

- One upgrade: Android play from a place (prepare paused at a seek, with the lock screen), closing playstall's F5 gap.

- A store-review prompt counted by settled opens (old-app idea), once the app ships to a store.

- toolnits r6 M1/M2 + O1-O3 tests (the r6 reviewer wrote three in a scratch copy; bundle toolnits2.bundle in the unit dir).

- appbase r2 m1: `apps/hymnal/turbo.json` build inputs `app/**` also hash the git-ignored `app/routes.d.ts` that `one dev` writes (needless cache misses, never a false green). Add `"!app/routes.d.ts"`; carried into glass, which owns the app's files next.

- `bun run android` ignores the Metro port (`one run:android` takes no flags, `vite.config.ts` sets no `server.port`), so a unit on a port other than 8081 calls the community CLI with `--port`. Set per-unit ports through `server.port` or an env var in a unit that owns `vite.config.ts` (reader), not mid-glass. (android r3)

- r2 r3 m1: a malformed R2 reply (a non-string `etag`, a null listing item) throws a TypeError outside the typed errors and stops the copy run (fails safe: nothing verified wrongly). Decode R2's replies with a Schema so a bad field is that key's `StoreFailed`. Also: bun's junit gives every `it.effect` case line 166, so `redfirst` misses `it.effect` cases edited in place (a packages/scripts follow-up).

- r2flag m1: the unknown-flag test passes on any failure and prints the CLI's whole help into every gate log; assert the error's tag and silence the help. The README's test sentence is incomplete (r2flag o1).

- A deploy needs `--yes` in a non-interactive shell: `bun run deploy` alone refuses ("Cannot prompt for approval"). The README's step 2 should say `bun run deploy --yes`.

- `keychange`: hymn 685 changes key mid-verse and its later chords are spelled in the first key (compile r3 m5; already on main). Detect key changes in the MIDI and spell per section.

- `filmreach` (testsplit F1, F2): film's tests reach outside its declared dependencies. `sfx-audit.test.ts`, `page-css-budget.test.ts` and `page-graph.test.ts` import `apps/animations`, which depends on film, so declaring it would make a cycle. These cases move to `apps/animations`, and film exports what they need. `src/docs.test.ts` is the repo's docs test and moves to a repo-level workspace (`packages/scripts`). Plan it when the RBF agent is idle.

- compile r5 verify F2: `Syllables` leaves "beyond" as one syllable in 21 hymns; in 273 stanza 4 that shifts the line. A syllable-dictionary fix with a case in `syllables.test.ts`, as a small unit or with `inexact`.

- `aligner` (hymnrows r2): 273:3 stays inexact. A candidate rule (a held note costs more on an unstressed syllable) fixes it, gives 76 exact key lines and changes 428 hymns. Adopt it only after a seeded page sample shows a net gain over before, scored as hymnrows r1/r2 scored (syllables right, blocks fully right). The integer-tenths and stepwise rules both measured worse and are out.

- Owner photo batch 3 (hymnrows r2, `hymnrows/owner-photos.md`): 112 122 127 259 419 436 467 493 532 547 626 632 634 636 687. 13 `unsettled`, 259 `unsettled` (one source), 687 `nopage` (whole hymn). Each settles one word difference (687 is unread). When the photos land, a small follow-up re-reads those entries.

- testsplit verify r4: `test:budget`'s judge also needs the 5-minute load at or below the cores, but agents' host notes wait on the 1-minute load only; say both in the protocol notes and in the unit spec template's Host line. `packages/hymnal` reads `../../core/data/hymnal.db` by path: declare it (a turbo input or a workspace dependency) so the budget and the cache see it. Selah cold: 30.4 s alone, 27.7 s of it the Swift compile (`selahbuild`).

- scriptstypes r1 review (accepted; carried): m4 a git-ignored `.ts` under `packages/scripts` enters tsc's program but not turbo's `typecheck` hash, so a local cached gate can differ (CI keeps no cache); turn caching off for `@bible/scripts#typecheck` (~1.1 s). m1 no test holds the recursive listing; m2 `.d.ts` counted covered under `skipLibCheck` (name each); m3 `Reflect.apply` in `source.test.ts:202` returns `any`. O4: a failed truncate restarts the vector run with no log line.

- selahbuild r1 review (accepted; carried): m1 `apps/selah/scripts/compile.sh`'s comment says `swift test` "only links and runs" after it; it does neither (measured 0.16 s, no link). m2 `gate.sh` sources `toolchain.sh` and no longer reads it. o1 the Swift flag list is written twice by hand (`compile.sh`, `test.sh`).

- Simple mode, hymn 3: 29 of 83 chord boxes are wider than their syllable, the same on base (chordbulk verify F2): a layout follow-up for chordbar's sheet work. (chordbulk) chordbar left it as it is (no owner report names it); it stays open.

- chordbar r2 verify O1: on a Debug iOS build the seeker knob froze 2.0 to 2.8 s after large dial moves. Measure the bar side per detent and the stored move write on a Release build before any change. (chordbar)

- The volume dial of bar J needs One `createPlayer` volume (unit `rate`). (chordbar)

- From ftbbrand: the link cards keep the approved field fade, not the new soil (match them if the owner wants); move the marks generator (`marks-2/draw.ts`) into `apps/firsttheblade/kit/`; the phone night close crops the moon at 390 px. (ftbbrand)

- polishbulk (`tmp/orchestrate/hymnapp/polishbulk/`): F2 the dial echo queue; P3 a device frame trace; the dark launch screen colour; `one typegen` leaves `Voice.d.swift.ts` unformatted.

- topicsdb (new unit, measured by the initfresh r2 verifier): the committed `packages/core/data/topics.db` is an empty stub (0 topics, aliases, edges and catalog keys; 6 meta rows), so a fresh `manna init` reports Topics unavailable and the owner's 53 KB `~/.bible/topics.db` is probably the same stub (guess; not opened). Build the real topics corpus with `bun run build:topics`, find what it needs, and decide how it ships (committed artifact or release asset, as `docs/bible-build.md` says for the Bible). (initfresh)

- initwal (new unit): two init fixes in one place. (1) initfresh N1: `init --force` over a destination whose `-wal` is non-empty must refuse and say why, never replay that WAL onto the new file or write the old database. (2) The CLI slow test "keeps a verified active runtime corpus unchanged across repeated init" runs about 5,0xx ms against Bun's 5,000 ms default and failed the initfresh and webkjv verifiers; make it pass by design (faster fixture or an explicit timeout with a measured reason). (initfresh, webkjv)

- topicsdb (blocked on owner, 2026-10-27; `tmp/orchestrate/hymnapp/topicsdb/blocked.md`): all 40 `content/topics/*.md` are `status: draft` stubs, and the compiler builds only approved pages; the tracked `data/egw-paragraphs.db` stub has 0 rows and an old `content` column, so quote verification cannot run. A rebuild cannot make the missing topic prose. Question for the owner: author the topic pages (a pilot of a few flagship topics, owner-reviewed), or leave Topics empty for now. Recommendation: leave it parked until after Heartseed; `manna wiki topics` still answers from the Nave catalog. (topicsdb)

## Review later
