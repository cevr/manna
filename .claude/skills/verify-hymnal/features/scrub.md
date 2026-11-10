# Silent held-seek probe

A development-only synthetic score exposes numeric held-seek state through buttons. It is not a reader gesture or an acoustic word-landing check. Production has no probe content or reader entry point.

## Sub-features

- `scrub-start`: Playing → Held; position freezes and preview makes no commits.
- `scrub-release`: selected sung onset commits once, then playback progresses; duplicate Release does nothing.
- `scrub-cancel`: cancel resumes the frozen origin without a seek; explicit interruption prevents a late restart.
- `scrub-inactive`: Paused and count-in reject Begin without acquisition or movement.
- `scrub-stanzas`: retained original identities map into cut time; changing choice revokes an old hold.
- `scrub-repeat`: repeated occurrences stay distinct; shared onsets keep distinct ordinals; line-only horizontal selection is a no-op.

## How to get to it (user POV)

Development deep link only: `hymnal://probe/scrub` / `/probe/scrub`. There is no normal-reader opener. Fixture settings are isolated and discarded when the route ends.

## Driving it with sim

- **Preconditions:** SKILL.md's doctor passes on this head, own state/port and verify-hymnal simulator. Establish a mounted existing native reader on base before recording base TargetMissing. Read and disable Sound and Sounds and haptics immediately before any Play; the fixture is independently silent.
- **States:** default, open, loading (Acquiring/Landing), empty (production), inactive and count-in; focus-visible and error n/a to this by-hand drive (device failures belong to executable histories).
- **Regression:** `apps/hymnal/src/follow/seek-targets.test.ts`, `apps/hymnal/src/follow/seek-targets.property.slow.test.ts`, `apps/hymnal/src/player/word-seek.test.ts`, `apps/hymnal/src/player/word-seek.property.slow.test.tsx`.

No journey: a by-hand numeric recipe, with no video, screenshots or retained raw trees. `sim` means `bun run --cwd apps/hymnal sim`, with this run's `--state` on every call. Require each command's JSON `ok`. Read status after every action; retain numeric fields and boolean comparisons only. Read `agent-device snapshot --json --raw --observe-only --force-full --session verify-hymnal` in the drive's own HOME, filtering in memory to the node labelled `player=…` (`scrub-status`). Record player/hold tags, line, word, targetMs, originMs, positionMs, commits, commitMs and choice. Negative word means no word, not ordinal zero. Two reads are separate host-clock observations; no timing claim when doctor says timingsHold=false.

**Silent setup/restore.** `sim open settings --expect "label=Sounds and haptics"`; read its switch value in memory, save the boolean, and `sim tap "label=Sounds and haptics"` only if on. Leave/reopen settings and confirm 0. `sim open hymns/100 --expect "label=Sound"`; read Sound's checked/unchecked value in memory, save it and `sim tap "label=Sound"` only if checked. Reopen and confirm unchecked. Immediately before each fixture Play confirm both remain off; make no other global setting changes. Finally restore both through these controls, leave/reopen each view and confirm the original booleans. Keep booleans only.

1. **Start (`scrub-start`).** `sim open probe/scrub --expect id=scrub-begin`; `sim tap id=scrub-play` → Playing. `sim tap id=scrub-begin` → Held/Paused, finite originMs=positionMs. Read twice at least one second apart → position unchanged. Save commits=C. `sim tap id=scrub-next-line`; `sim tap id=scrub-next-word` → preview changes, commits=C, position still origin. Repeated selection at a boundary is a no-op.
2. **Release (`scrub-release`).** Save preview target T and C; `sim tap id=scrub-release` → Free/Playing, commits=C+1, commitMs=T. A later read has positionMs>T. `sim tap id=scrub-release` → commits unchanged and playback continues. Fixture line starts are 1000, 6000, 11000 and 16000; word onsets are start+100/start+200 except the shared pair on line 2.
3. **Cancel/external intent (`scrub-cancel`).** `sim tap id=scrub-play`; `sim tap id=scrub-begin`; save origin O and C. `sim tap id=scrub-next-line`; `sim tap id=scrub-cancel` → Playing/Free, commits=C, position progresses from O rather than preview. Repeat Begin, then `sim tap id=scrub-pause`, Release, Cancel → Paused/Free, no restart/commit. Repeat Play, Begin, `sim tap id=scrub-invalidate`, Release, Cancel → no restart/commit. Repeat Play, Begin, `sim tap id=scrub-replace`, Release → replacement owns the player, no old target commit. Route exit and inactive/background revoke; foreground alone never restores an old hold.
4. **Inactive (`scrub-inactive`).** Play, `sim tap id=scrub-pause`; save C/position, `sim tap id=scrub-begin` → Free/Paused, unchanged. `sim tap id=scrub-count-in`, then Begin while count-in is visible → Free, commits unchanged. The synthetic tempo leaves time to read count-in; if already Playing, repeat the trial. Do not claim other inactive tags from this drive.
5. **Stanzas (`scrub-stanzas`).** Play, Begin, `sim tap id=scrub-stanza` → old hold Free, late Release makes no commit. Choice is now 2. Play, Begin → original line 2, shared word onset 1100 (cut from 11100); next line is original line 3 at 6000, never line 0 or 1. Release lands at that cut target. `sim tap id=scrub-stanza` restores all. Leaving/reopening discards fixture choices.
6. **Repeated/shared/line-only (`scrub-repeat`).** All stanzas: Play, Begin; Previous line until line 0, then Next line twice → line 2, not line 0 despite identical synthetic text. Next word selects word 0 at11100, Next word selects word 1 also at11100: distinct ordinal, equal time, no commits. Release → commitMs11100. Play, Begin, step to line 3 → Line at16000, word=-1; Previous/Next word leave preview unchanged. Release → commitMs16000. This does not promise a uniquely lit shared word. Corpus/663 accuracy is the slow sweep.

## Gotchas

- On base or production `sim open probe/scrub --expect id=scrub-begin` is TargetMissing; a broken base reader is infrastructure-blocked, not feature-red.
- Controls may require `sim scroll screen down` or `sim scroll screen up`; read status independently of control visibility. Restart Play per trace so the short score has not ended.
- The counter observes seeks across the normal score-clock boundary: compare deltas per trace. Refused device retries remain one logical player act (covered by controlled tests).
- No One Audio, microphone, real recording, haptics or continuous hold-and-drag is enabled. UIKit gesture arbitration, acoustic landing, VoiceOver and feel are not proved; the later hymscrub reader owns them.
