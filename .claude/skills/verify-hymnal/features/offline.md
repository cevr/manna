# Downloaded recordings

Opening a hymn for 750 ms saves its printed-key recording in the background. Play in a
different Key also saves that recording. Capo changes no recording. Completed
downloads play locally first. R2 remains the source for missing recordings.

## Sub-features

- `offline-open-default`: open 100 without Play. Its printed-key save starts once. The page remains usable. A neighbouring pager page starts no save.
- `offline-play-key`: change Key and press Play. The changed-key set becomes saved only after all its bytes arrive.
- `offline-local-first`: a completed set resolves locally with the remote origin blocked. A local read failure invalidates it and tries remote once. A missing recording retains the player's Retry path.
- `offline-download-all`: Settings has `Downloads` and `Download all recordings`. This action saves the 695 printed-key recordings. Other keys are saved when used.
- `offline-progress`: the count advances only after a recording is complete. Active, queued and partial-byte counts remain separate.
- `offline-size`: the saved count and exact byte size include completed recordings in every saved key.
- `offline-delete`: `Delete downloads`, then `Confirm delete downloads`, removes this app's downloaded recordings and partials, including retired recording sets. `Keep downloads` preserves them. Counts and bytes become zero. A cancelled save cannot restore them.
- `offline-resume`: `Cancel download` keeps completed files and valid partials. `Download all recordings` resumes them. A relaunch retains completed files. Cut, failed and changed-entity responses never publish partial data.
- `offline-deduplicate`: repeated opens, Plays and Download all join an existing save. At most two recordings download at once.

## How to get to it (user POV)

- Open a hymn by its list row or `/hymns/100` (`hymnal://hymns/100` on iOS).
- Open the player sheet to change Key. Read Sound as off before each Play.
- Open Settings, then scroll to Downloads.

## Driving it with sim

- **Preconditions:** a loopback fake recording origin for bulk work. Never download all from R2 for a test. Sound off before every Play. Use the owned simulator and muted browser from SKILL.md.
- The fake origin's CORS equals `infra/bucket.ts`: only `range` is allowed. Reject author-requested `If-Range` in preflights. Browsers may add their own cache validator without that preflight; do not reject it at the server. Include a synthetic file larger than the 2 MiB range bound. The HTTP guard must fail on an adapter that sends `If-Range`.
- **States:** empty, downloading, cancelled, complete, retained after relaunch, failed, retried and deleted. Check compact and regular widths and both appearances. Use control states and numeric bounds; no hymn text, images or recordings.
- **Regression:** `src/offline/cache.slow.test.ts`, `src/offline/http.slow.test.ts`, `src/player/offline.slow.test.ts`, and existing player, seek and sound suites.

1. Open 100 without Play. Wait past its dwell. Observe one printed-key save, with multiple range requests. Open Settings. A cut response leaves the completed count unchanged and shows a retry notice. Quick page turns and Cancel retire a pending dwell save.
2. Press `Download all recordings`. Observe a count between zero and 695, with at most two active saves. Press `Cancel download`. The count then stops increasing.
3. Relaunch into Settings. Completed counts and bytes remain. Press `Download all recordings` again. Matching partials resume at their durable byte offset; a changed validator restarts the file. The final default count is 695.
4. Open 100 again. Its completed default set makes no fetch. Hold its Key button if chords are off, then tap Key to open the dials. Change Key, read Sound as off, and press Play once. The saved count includes the additional key after completion. Capo adds no request.
5. Block the fake origin. Repeat the saved-key action. Saved counts remain correct and no save request is sent. The fake-device adapter check proves local dispatch; Sound-off UI alone proves only the silent clock and controls.
6. Press `Delete downloads`, then `Keep downloads`; counts stay the same. Press `Delete downloads`, then `Confirm delete downloads`. Count and size become zero. Wait for former work to finish. They remain zero. Leave and return to Settings and relaunch; they remain zero.

## Gotchas

- `downloads-progress`, `downloads-size` and `downloads-active` are the numeric observation targets. Do not retain a full DOM or AX tree.
- On iOS, verify the completed count and 695 in the progress accessibility value. Visible text alone does not prove that native numeric ARIA values reached the accessibility tree.
- The Download all button keeps the accessible name `Download all recordings` while its visible text offers Resume after cancellation or failure.
- Silent Play does not call the recording device. Keep native recording output unverified under a hard silence rule. Never use Sound-off proof as audio evidence.
- Downloads live in application support on native and origin-private files on web. On iOS the adapter sets and reads back `isExcludedFromBackupKey` before any media write, including for retired app-owned folders. Verify that native saves succeed through that boundary; a missing binding or refused flag must stop saving. No native filesystem-provider patch is needed: the existing Foundation facade exposes the resource setter.
- Web requests persistent storage when Download all is pressed. A refusal is normal. Keep the browser eviction limit visible in the Downloads copy; OPFS alone is not a permanence guarantee. Platform storage settings can clear app data. The browser HTTP cache and settings KVS hold no media blobs.
- A device Play/session rejection alone must keep a good saved file. Only a failed storage size/header/read check invalidates it. A blocked storage index must not block public Start.
- Download all remains enabled during a page-open save and keeps the same visible and accessible name. Pause/resume state belongs in the notice. Storage failure stops the bulk after at most the two already active ranges. Resume retries changed-key failures as well as defaults; partials discovered at launch are paused, not failed.
- A development launch may set `VITE_HYMNAL_RECORDINGS_ORIGIN` to a loopback fixture. Release builds always use R2.
