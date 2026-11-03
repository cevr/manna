# Settings and about

The Settings tab holds choices, each a check beside the one chosen:
the appearance, `System`, `Light` or `Dark`, which the app draws every
screen in at once; then under the heading `Chords` the switch `Chords`,
off at first, the same setting as the bar's `Key` and the player sheet's
switch. Only with chords on: the chord style, `Simple` (the default) or
`Advanced`, which every hymn's chords are shown in; `Chord placement`,
which chooses `On the beat` (the default), `Simpler` or `As the file
plays` for every hymn that uses the global choice; and, on a device with
the ear, `Tuner`. Then the switch `Sounds and haptics`, on at first: off,
no control is felt or heard. Below them, the heading `About` credits the instruments the recordings are
played on, as their licences ask; the app's version is not shown.

## Sub-features

- `settings-appearance`: a radio group `Appearance` of `System`, `Light`, `Dark`; a press chooses one.
- `settings-kept`: the choice holds after leaving the tab and after a relaunch.
- `settings-chords-switch`: under the heading `Chords`, after `Appearance`, the switch `Chords`, off (`0`) at first: no `Chord style`, no `Chord placement`, no `Tuner`. A press turns it on (`1`): `Chord style` (`Simple`, `Advanced`) and `Chord placement` show, and `Tuner` on a device with the ear. A press again hides them. It is the same setting as the bar's `Key` and the player sheet's `Chords`, kept after a relaunch.
- `chords-placement-global`: with chords on, the radio group `Chord placement` offers `On the beat`, `Simpler`, `As the file plays`; `On the beat` is checked on a fresh install. A change applies immediately to every inheriting hymn.
- `chords-placement-kept`: the global choice and each hymn override survive a relaunch. A hymn with an override keeps it when the global choice changes.
- `settings-chords`: with chords on, under the switch `Chords`, a radio group `Chord style` of `Simple`, `Advanced`, `Simple` checked at first; a press chooses one, hymns show their chords in it, and it holds after a relaunch (and while chords are off).
- `settings-feel`: the switch `Sounds and haptics`, after the switch `Chords` (and, with chords on, `Chord placement`) and before `About`, on at first; a press turns it off, and it stays off after a relaunch (`feel.md` for what it silences).
- `about`: the heading `About`, then the credits: `Salamander Grand Piano` by `Alexander Holm`, `CC BY 3.0` (a link to the licence), and `VS Chamber Orchestra 2` by `Versilian Studios`, `CC0`; then the Gemma notice for the meaning table: made from `EmbeddingGemma` and modified, `Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms` (a link), and the `Gemma Prohibited Use Policy` (a link); then the button `Gemma Terms of Use`, which shows the Terms word for word under it, and hides them on a second press.
- Downloads: after `Sounds and haptics`, before `About`. [Downloaded recordings](offline.md) owns `offline-download-all`, `offline-progress`, `offline-size`, `offline-delete`, `offline-resume` and `offline-deduplicate`, including the fake-origin journey and silence limits.

## How to get to it (user POV)

- The `Settings` tab.
- The link `hymnal://settings` (iOS) or the route `/settings` (web).
- The `Chords` switch: the same screen, below the appearance; the chord style and `Chord placement` below it, with chords on.
- About: the same screen, at its foot.

## Driving it with sim

- **Preconditions:** the appearance `System`, chords off, the chord style `Simple` and `Sounds and haptics` on (the defaults); the journey puts all four back.
- **States:** default (chords off), open (chords on, the chosen radio). Focus-visible, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/settings.test.ts`, `apps/hymnal/src/home/settings.test.tsx`, `apps/hymnal/src/home/settings.chordmode.test.tsx` (the switch, what it shows with chords off and on, and their order), `apps/hymnal/src/reader/reader.slow.test.tsx`, `apps/hymnal/src/theme.test.ts`, `apps/hymnal/src/about.test.tsx`, `apps/hymnal/src/feel/feel.slow.test.tsx` (the radios' `choose`, and `Sounds and haptics` off and on).

**The journey:** `sim journey settings`. Settings (`settings`), `Dark`, the sheet dragged down by its grabber (`leave`) and `Settings` again (`second-view`), `System`, the switch `Chords` off with no chord rows (`settings-chords-switch-off`) and turned on (`settings-chords-switch`), a scroll down to the credits (`about`), `Advanced` (`settings-chords`), `Sounds and haptics` off (`settings-feel`), `sim relaunch` and Settings again with chords on and `Advanced` (`kept`), then `Simple`, a scroll to `Sounds and haptics` still off (`kept-feel`), it on, a scroll back up to `Chords` and it off (`settings-chords-off`), and the sheet dragged down (`close`).

Read in the receipts:

- `settings`: `Appearance` with `System` checked. `dark`: the shot dark, `Dark` checked. `second-view`: `Dark` still checked, the shot dark.
- `about`: the heading `About`, `Salamander Grand Piano`, `CC BY 3.0` as a link and `VS Chamber Orchestra 2`.
- `settings-chords-switch-off` (raw snapshot): the switch `Chords` value `0`, after `Appearance`; no `Advanced`, no `Chord placement`, no `Tuner`. `settings-chords-switch`: `Chords` `1`; `Chord style` with `Simple` and `Advanced` (`Advanced` is the step's `shows`), and `Chord placement` in the snapshot (below the fold at the half detent, so not a `shows`); `Tuner` read, not required (the simulator has the ear only if the build gives it).
- `settings-feel`: the switch `Sounds and haptics` after `Advanced` and before `About`, off (iOS value 0).
- `settings-chords-off` (raw snapshot): `Chords` `0`, and no `Advanced` or `Chord placement`.
- `leave` and `close`: no `Sheet Grabber`, the home screen. `kept`: `Advanced` checked after the relaunch; `kept-feel`: `Sounds and haptics` still off. `feel-put-back`: on (`[checked]` or value 1).

By hand: **Chord style on a hymn (`settings-chords`).** With `Advanced` checked, `sim open hymns/3 --expect "label=Stanza 1"`, chords on (Settings' switch `Chords` turned on before `Advanced`, so they are on already; else `sim tap id=key-button` when `id=key-button` reads `Chords off`). → `chord-1-1-5` reads `Dsus4 Dsus2`, and still after `sim relaunch`. Then chords-and-capo's journey reads as it always has. Put `Simple` back and chords off.

## Gotchas

- Placement journey: on Settings select each placement by its radio label; leave and return, then relaunch and return. On 373 and 388 open `Open player` and read the adjustable `Chord placement` value. An explicit override stays while a different hymn inherits. Clear through `Use global chord placement`, change the global value again and check the cleared hymn follows it. Finish with global `On the beat` and both hymns using global. Keep Sound off before every Play. Retain only control values, numeric chord IDs and counts; no images or hymn text. The per-hymn and in-play rows are in `chords-and-capo.md`. `src/player/placement.slow.test.tsx` covers the 8,340 persistence combinations and corrupt values.

- On iOS the radios read as `other` elements with `[checked]`/`[unchecked]`; on the web as `radio` with `aria-checked`. Tap by label on both.
- `Settings` names the tab and the screen title on iOS: use `role=button`.
- On iOS Settings is a form sheet with no header: `sim back` does not close it and no `Hymns` button shows. Drag it down by its grabber before you leave, or the next deep link stacks over it: `sim gesture pan "role=button label=Sheet Grabber" 0 400 --ms 300` at the half detent it opens at, `0 760 --ms 400` once a scroll has raised it to full (a pan that leaves the screen is refused, and a fast flick from full stops at half).
- `label=Chords` matches two switches: the player sheet's and Settings'. Tap a switch as `role=switch label=Chords` on the screen that shows it (only one is mounted at a time); the heading `Chords` in Settings is text, not a target.
- With chords on, at the half detent Settings opens at, `Chord placement` and `Tuner` are in the tree but below the fold: a `shows` (or `sim wait`) of either fails until `sim scroll "label=Chord placement" down`. `Advanced` is on screen there.
- A run that leaves chords on changes every later run's `off` steps (`chords-and-capo.md`): always end with chords off.
- The switch reads as a cell and a switch both named `Sounds and haptics`: tap `role=switch label=Sounds and haptics`. Below the half detent it is not on screen: `sim scroll "label=Sounds and haptics" down` first.
- A run that leaves `Dark` chosen changes the next run's screenshots: always end at `System`.
- A run that leaves `Advanced` chosen changes the chords every later run reads: always end at `Simple`.
- A run that leaves `Sounds and haptics` off silences every later run's `feel.md` steps: always end with it on.
- On iOS a build from before unit `feel` has no switch: `sim tap` reports `TargetMissing label=Sounds and haptics`.
