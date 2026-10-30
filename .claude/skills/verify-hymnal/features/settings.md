# Settings and about

The Settings tab holds choices, each a check beside the one chosen:
the appearance, `System`, `Light` or `Dark`, which the app draws every
screen in at once; and the chord style under `Chords`, `Simple` (the
default) or `Advanced`, which every hymn's chords are shown in. `Chord placement`
chooses `On the beat` (the default), `Simpler` or `As the file plays` for
every hymn that uses the global choice. Then the
switch `Sounds and haptics`, on at first: off, no control is felt or
heard. Below them, the heading `About` credits the instruments the recordings are
played on, as their licences ask; the app's version is not shown.

## Sub-features

- `settings-appearance`: a radio group `Appearance` of `System`, `Light`, `Dark`; a press chooses one.
- `settings-kept`: the choice holds after leaving the tab and after a relaunch.
- `chords-placement-global`: the radio group `Chord placement` offers `On the beat`, `Simpler`, `As the file plays`; `On the beat` is checked on a fresh install. A change applies immediately to every inheriting hymn.
- `chords-placement-kept`: the global choice and each hymn override survive a relaunch. A hymn with an override keeps it when the global choice changes.
- `settings-chords`: under the heading `Chords`, a radio group `Chord style` of `Simple`, `Advanced`, `Simple` checked at first; a press chooses one, hymns show their chords in it, and it holds after a relaunch.
- `settings-feel`: the switch `Sounds and haptics`, after `Chord style` and before `About`, on at first; a press turns it off, and it stays off after a relaunch (`feel.md` for what it silences).
- `about`: the heading `About`, then the credits: `Salamander Grand Piano` by `Alexander Holm`, `CC BY 3.0` (a link to the licence), and `VS Chamber Orchestra 2` by `Versilian Studios`, `CC0`; then the Gemma notice for the meaning table: made from `EmbeddingGemma` and modified, `Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms` (a link), and the `Gemma Prohibited Use Policy` (a link); then the button `Gemma Terms of Use`, which shows the Terms word for word under it, and hides them on a second press.
- Downloads: after `Sounds and haptics`, before `About`. [Downloaded recordings](offline.md) owns `offline-download-all`, `offline-progress`, `offline-size`, `offline-delete`, `offline-resume` and `offline-deduplicate`, including the fake-origin journey and silence limits.

## How to get to it (user POV)

- The `Settings` tab.
- The link `hymnal://settings` (iOS) or the route `/settings` (web).
- The chord style: the same screen, below the appearance.
- About: the same screen, below the chord style.

## Driving it with sim

- **Preconditions:** the appearance `System`, the chord style `Simple` and `Sounds and haptics` on (the defaults); the journey puts all three back.
- **States:** default, open (the chosen radio). Focus-visible, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/settings.test.ts`, `apps/hymnal/src/home/settings.test.tsx`, `apps/hymnal/src/reader/reader.slow.test.tsx`, `apps/hymnal/src/theme.test.ts`, `apps/hymnal/src/about.test.tsx`, `apps/hymnal/src/feel/feel.slow.test.tsx` (the radios' `choose`, and `Sounds and haptics` off and on).

**The journey:** `sim journey settings`. Settings (`settings`), `Dark`, `Hymns` and back to `Settings` (`second-view`), `System`, a scroll down to the credits (`about`), `Advanced` (`settings-chords`), `Sounds and haptics` off (`settings-feel`), `sim relaunch` and Settings again (`kept`), then `Simple` and `Sounds and haptics` on.

Read in the receipts:

- `settings`: `Appearance` with `System` checked. `dark`: the shot dark, `Dark` checked. `second-view`: `Dark` still checked, the shot dark.
- `about`: the heading `About`, `Salamander Grand Piano`, `CC BY 3.0` as a link and `VS Chamber Orchestra 2`.
- `settings-feel`: the switch `Sounds and haptics` after `Advanced` and before `About`, off (iOS value 0).
- `kept`: `Advanced` checked and `Sounds and haptics` off after the relaunch. `feel-put-back`: on (`[checked]` or value 1).

By hand: **Chord style on a hymn (`settings-chords`).** With `Advanced` checked, `sim open hymns/3 --expect "label=Stanza 1"`, chords on (`sim hold id=key-button --settle 10` when `id=key-button` reads `Chords off`; `label=Chords` matches only the player sheet's switch). → `chord-1-1-5` reads `Dsus4 Dsus2`, and still after `sim relaunch`. Then chords-and-capo's journey reads as it always has. Put `Simple` back and chords off.

## Gotchas

- Placement journey: on Settings select each placement by its radio label; leave and return, then relaunch and return. On 373 and 388 open `Open player` and read the adjustable `Chord placement` value. An explicit override stays while a different hymn inherits. Clear through `Use global chord placement`, change the global value again and check the cleared hymn follows it. Finish with global `On the beat` and both hymns using global. Keep Sound off before every Play. Retain only control values, numeric chord IDs and counts; no images or hymn text. The per-hymn and in-play rows are in `chords-and-capo.md`. `src/player/placement.slow.test.tsx` covers the 8,340 persistence combinations and corrupt values.

- On iOS the radios read as `other` elements with `[checked]`/`[unchecked]`; on the web as `radio` with `aria-checked`. Tap by label on both.
- `Settings` names the tab and the screen title on iOS: use `role=button`.
- On iOS Settings is a form sheet: `sim back` does not close it. Drag it down before you leave, or the next deep link stacks over it.
- A run that leaves `Dark` chosen changes the next run's screenshots: always end at `System`.
- A run that leaves `Advanced` chosen changes the chords every later run reads: always end at `Simple`.
- A run that leaves `Sounds and haptics` off silences every later run's `feel.md` steps: always end with it on.
- On iOS a build from before unit `feel` has no switch: `sim tap` reports `TargetMissing label=Sounds and haptics`.
