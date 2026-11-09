# Home

The home's rules (`apps/heartseed/README.md`, Home): the greeting by the
reader's local hour, the furrows (one per row of the field, each its list's
kind, icon and ripe count, each plant's stage and ready mark), the lists
the field holds, the shelves Add verses will offer, and Start here, a tap on
a verse that makes it the session's visit. The field
(`apps/heartseed/src/field/screen.tsx`, `field.md`) is the app's home:
every launch on a read garden opens it, and so does the first minute's
`Continue`; Today's `Your field` leads back to it. It draws them in home
A's layout: in a bar fixed above the scroll view `When I need…` (once a
plan is made in this launch), the gear `Settings` and `Add verses`
(`id=add-verses`); in the scroll
view the greeting (`Good morning`, `Good afternoon` or `Good evening`,
with a sun or a moon), the heading `Your field`, the days sown and the
harvest, the hint, one furrow per row (its icon, title, ripe count
`<k> of <n> ripe`, a held passage's `Remove`, and its plants as buttons
named `<reference>, <stage>`, then `, ready today` with a gold dot when a
plan item not done is on the verse), the dashed row `Add verses`
(`id=add-row`) and the legend; in a foot fixed under it the Begin card
(the counts line and `Begin`, which opens Today as the run stands) or,
with a plant chosen, `<reference> · <stage words>` and
`Start here with <reference>`, which makes the verse the visit and opens
Today on it. A tap on a plant chooses its verse, a second tap lets it go.
`Settings` opens the Settings sheet (`apps/heartseed/src/settings/sheet.tsx`):
the heading `Settings` and `Done`, then the `Minutes` radios, `Voice`,
the `Appearance` radios and `About`; Today holds no `Minutes` and no
`Voice`. The development probe
(`apps/heartseed/app/probe/home.tsx`, in a development build only) shows them as text over the live garden, passages and session,
one line each, then the home's icons as images with a count of those
loaded, and begins the session once the garden is read, as Today
does. Its one button, `Start with <reference>`, starts the first plant (in
furrow order) that `startOf` offers. Nothing it does writes the store.

## Sub-features

- `home-probe`: after the first minute, the probe shows the greeting by
  the host's hour, the own furrow and the `Protection & Fear` furrow with
  their kinds, icons and ripe counts, each plant's label, the counts of
  the plan, the lists and the shelves; `Start with Isaiah 41:10` makes the
  verse the visit, and Today would show it.
- `home-icons`: the same probe loads every one of the home's icons
  (`src/home/icons.ts`, 12 names in light and dark, 24 PNGs) through One's
  asset registry, and says how many loaded.
- `home-open`: the first minute's `Continue` opens home in the done
  state: the heading `Your field`, the greeting, `Nothing to tend now`
  with no `Begin`, `When I need…` and `Add verses` in the bar; no Today.
- `home-furrows`: the field shows the greeting by the hour, the own
  furrow `Isaiah 41:10` (`0 of 1 ripe`) with the plant button
  `Isaiah 41:10, seed`, the `Protection & Fear` furrow (`0 of 14 ripe`)
  with 14 plant buttons not planted, `Nothing to tend now` in the foot
  with no `Begin` and no `About`, `When I need…` and `Settings` in the
  bar, and `Add verses` in the bar and as a row.
- `home-choose`: a tap on a plant chooses it (`Isaiah 41:10 · a seed`
  and `Start here with Isaiah 41:10`), a second tap lets it go, and a
  verse not planted offers no `Start here` on the day of a planting.
- `home-start`: `Start here with Isaiah 41:10` opens Today on that verse.
- `home-back`: Today's `Your field` (shown `‹ Your field`) leads to home,
  the choice gone and `Begin` in the foot while the visit is open; Today
  holds no `When I need…`.
- `home-begin`: with the started visit open the foot offers `Begin`,
  which opens Today on it.
- `home-need`: the bar's `When I need…` opens When I need…, whose
  `Your field` leads back to home; a known promise there opens Today on
  it.
- `home-add-places`: the bar's `Add verses` opens the chooser, whose
  `Your field` leads back to home.
- `home-dot`: a seed at its due after a `Minutes` tap in Settings on home
  shows on the field as `Isaiah 41:10, seed, ready today`, with
  `1 to tend · about 1 min` and `Begin`, and starts there.
- `home-relaunch`: a relaunch opens home, with the greeting and the
  foot's counts line, never Today.
- `home-settings`: the gear `Settings` opens the sheet: the heading
  `Settings`, `Done`, the `Minutes` radios with `5 min` alone selected,
  `Voice` valued `Her`, the `Appearance` radios with `System` selected,
  and `About`; `Done` closes it to home.
- `home-settings-minutes`: `10 min` chosen in the sheet stays selected
  across a relaunch.
- `home-settings-about`: the sheet's `About` opens About, whose
  `Your field` returns to home with the sheet closed.
- `home-settings-today`: Today holds no `Minutes` radio, no `Voice` and
  no `Settings`.
- `home-renew`: from Today, `Your field`, then `5 min` (the radio already
  selected) in Settings at the seed's due makes the plan again at the tap:
  home shows the seed ready today with `Begin`, which opens Today on it
  with no `Minutes` radio, `Voice` or `Settings` (the trip the test rigs
  take to renew the plan).
- Planned, not yet drivable (the later units of the home, split.md):
  `home-add`, `home-end`.

## How to get to it (user POV)

- None: a reader never sees the probe. A drive opens it by its link
  (Driving it, step 2).
- The field: every launch opens on it; from Today, tap `Your field`.

## Driving it

Set `RUN`, `EVIDENCE`, `PORT` and `START` as `first.md` sets them, and
`sim` = `bun run --cwd apps/heartseed sim`. Nothing native changes for the
home's rules: `--app` with a build of the head's native code serves; the
JavaScript comes from the dev server.

1. `first.md` steps 1-7, to `first-home`.
2. `home-probe`:

   ```bash
   date +%H%M
   sim open probe/home --expect "label=Home probe"
   sim snapshot home-probe
   ```

   → the text nodes:
   - `greeting Good morning sun` for 0400-1159 by `date +%H%M`,
     `greeting Good afternoon sun` for 1200-1759, else
     `greeting Good evening moon` (take `date` again after the snapshot
     when the first read was within a minute of an edge);
   - `furrow Isaiah 41:10 · own · bow · 0 of 1 ripe`;
   - `furrow Protection & Fear · taught · bow · 0 of 14 ripe`;
   - `counts Nothing to tend now`, or `counts 1 to tend · about 1 min`
     when the seed's learning step had passed when the probe made the
     plan;
   - `plant Isaiah 41:10, seed`, ending `, ready today` exactly when the
     counts line says `1 to tend`;
   - 14 nodes `plant <reference>, not planted`;
   - `lists 2`;
   - `shelves 17` and
     `shelf Psalms · harp · Songs to carry through the day · 6 lists`;
   - a button `Start with Isaiah 41:10`.

3. The tap:

   ```bash
   sim tap "label=Start with Isaiah 41:10"
   sim snapshot home-probe-start
   ```

   → `visit Isaiah 41:10 fresh false` and `today shows Isaiah 41:10`.

4. `home-icons`:

   ```bash
   sim open probe/home --expect "label=icons loaded 24 of 24"
   sim snapshot home-icons
   ```

   → the text `icons loaded 24 of 24`, no node starting `icons failed`,
   and 24 nodes named `icon <name> <scheme>`, one for each of add, blade,
   bow, corn, ear, gear, harp, lamp, moon, scroll, seed and sun in `light` and in
   `dark` (record the role the snapshot gives them, expected `image`); the
   `home-probe` lines of step 2 still as listed there.

5. Regression: `field.md`'s `field-first` and `field-back` on the same
   install pass unchanged.
6. Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Red on base: `sim open probe/home --expect "label=Home probe"` times out
(`ReadinessTimedOut`): base has no such route. For `home-icons`, the
`--expect "label=icons loaded 24 of 24"` times out on a base whose probe has
no icon lines, or no `gear`.

### The field in home A's layout

On an install of its own (the probe's `Start with` leaves a visit, which
puts `Begin` in the field's foot), with the same variables:

1. `first.md` steps 1-6, to `first-planted`; note `PLANTED` (`date`) and
   `date +%H%M`.
2. `home-open`: `sim tap "label=Continue"`,
   `sim open / --expect "id=counts"`, `sim snapshot home-open` → the
   heading `Your field`; the greeting by `date +%H%M`, as `home-furrows`
   takes it; in the foot `Nothing to tend now`, no `Begin` and no
   `About`; the buttons `When I need…`, `Settings` and two `Add verses`,
   and the button
   `Isaiah 41:10, seed`; no heading `Today`, no button `Today`, no
   `Say it`, no label starting `Stage:`.
3. `home-furrows`: on the same screen,
   `sim snapshot home-furrows` → the heading `Your field`; the text
   `Good morning` (0400-1159 by `date +%H%M`), `Good afternoon`
   (1200-1759) or `Good evening` (take `date` again when within a minute
   of an edge); the text `A gold dot marks a plant ready today. Tap one to
   start there.`; the text `Isaiah 41:10` and the text `0 of 1 ripe`; a
   button `Isaiah 41:10, seed`; the text `Protection & Fear`, the text
   `0 of 14 ripe` and 14 buttons ending `, not planted`; `1 day sown`;
   `0 verses at full corn`; in the foot `Nothing to tend now`, no `Begin`
   and no `About`; the buttons `When I need…`, `Settings` and two
   `Add verses`; no
   `Today` heading, no button `Today`, no `Say it`, no label starting
   `Stage:`.
4. `home-choose`: `sim tap "label=Isaiah 41:10, seed"`,
   `sim snapshot home-choose` → the text `Isaiah 41:10 · a seed`, the
   button `Start here with Isaiah 41:10`, no `Begin` (record how the
   snapshot shows the plant's selection: `selected` or nothing). Then
   `sim tap "label=Isaiah 41:10, seed"` again, `sim snapshot
   home-choose-letgo` → `Nothing to tend now` back and no label starting
   `Start here`. Then `sim tap "label=Psalms 91:1, not planted"`,
   `sim snapshot home-choose-unplanted` → the text
   `Psalms 91:1 · not planted yet` and no label starting `Start here` (no
   new piece on the day of a planting).
5. `home-start` and `home-back`: `sim tap "label=Isaiah 41:10, seed"`
   (the choice moves), `sim tap "label=Start here with Isaiah 41:10"`,
   `sim snapshot home-back-today` → the heading `Today`, the reference
   `Isaiah 41:10`, `Say it`, `Stage: seed`, a button `Your field`, and no
   `When I need…`. Then `sim tap "label=Your field"`,
   `sim snapshot home-back` → the heading `Your field`, no text
   `Isaiah 41:10 · a seed` (the choice gone), and `Nothing to tend now`
   and `Begin` in the foot (the started visit is open).
6. `home-begin`: `sim tap "label=Begin"`, `sim snapshot home-begin-today`
   → the heading `Today`, `Isaiah 41:10`, `Say it`.
7. `home-need`: `sim tap "label=Your field"`, `sim tap "label=When I need…"`,
   `sim snapshot home-need` → the heading `When I need…`, a button
   `Your field`, a button `Isaiah 41:10`, and no button `Today`. Then
   `sim tap "label=Your field"` → the heading `Your field`. Then
   `sim tap "label=When I need…"`, `sim tap "label=Isaiah 41:10"`,
   `sim snapshot home-need-visit` → the heading `Today`, `Isaiah 41:10`
   and `Say it`.
8. `home-add-places`: `sim tap "label=Your field"`,
   `sim tap "id=add-verses"` → the heading `Add a passage`;
   `sim tap "label=Your field"` → the heading `Your field` again.
9. `home-dot`, only when `PLANTED` was 0400-1759 local (an evening
   planting is due the next morning; otherwise record
   `Nothing to tend now` and skip, as `run.md` step 3 does): wait until 7
   minutes after `PLANTED`, on home `sim tap "label=Settings"`,
   `sim tap "label=5 min"` (the plan made again at the tap; the idle visit
   dropped), `sim tap "label=Done"`, with no trip to Today,
   `sim snapshot home-dot` → the button
   `Isaiah 41:10, seed, ready today`, `1 to tend · about 1 min` and
   `Begin` in the foot; `sim tap "label=Isaiah 41:10, seed, ready today"`,
   `sim tap "label=Start here with Isaiah 41:10"`, `sim snapshot
   home-dot-start` → the heading `Today`, `Isaiah 41:10` and `Say it`.
10. `home-relaunch`: `sim relaunch`, `sim open / --expect "id=counts"`,
    `sim snapshot home-relaunch` → the heading `Your field`, the greeting,
    the foot's counts line, and no heading `Today`.
11. Regression on the same install: `field.md`'s `field-first`,
    `field-control` and `field-back` (the plants as buttons), and
    `about.md`'s way to About through `Settings`. Then `sim doctor` (record
    `head` and `timingsHold`) and `sim down`.

### The Settings sheet

On an install of its own, from `first.md` steps 1-7 to `first-home`, with
the same variables:

1. `home-settings`: `sim tap "label=Settings"`, `sim snapshot
   home-settings`, and a raw snapshot (`agent-device snapshot --json --raw
   --observe-only --force-full --session verify-heartseed`) → the heading
   `Settings` and the button `Done`; the radios `2 min`, `5 min`,
   `10 min`, `20 min`, `5 min` alone selected; the button `Voice`, valued
   `Her` (raw); the radios `System`, `Light`, `Dark`, `System` selected;
   the button `About`. Record whether home's nodes (`Your field`, the
   furrows, `When I need…`) appear in the same snapshot: that is the
   modality as the accessibility tree holds it. Then `sim tap
   "label=Done"`, `sim snapshot home-settings-done` → the heading
   `Your field`, no heading `Settings`, a button `Settings`, and no
   button `About`.
2. `home-settings-minutes`: `sim tap "label=Settings"`,
   `sim tap "label=10 min"`, a raw snapshot → `10 min` alone selected.
   `sim tap "label=Done"`, `sim relaunch`, `sim open / --expect
   "id=counts"`, `sim tap "label=Settings"`, a raw snapshot → `10 min`
   still alone selected. Then `sim tap "label=5 min"`, `sim tap
   "label=Done"` (restored).
3. `home-settings-about`: `sim tap "label=Settings"`,
   `sim tap "label=About"`, `sim snapshot home-settings-about` → the
   heading `About`, a label equal to `CREDITS`, and no radio `System`.
   `sim tap "label=Your field"`, `sim snapshot home-settings-back` → the
   heading `Your field`, and no heading `Settings`.
4. `home-settings-today`: home after the first minute is in the done
   state, so no `Begin`: `sim tap "label=Isaiah 41:10, seed"`,
   `sim tap "label=Start here with Isaiah 41:10"`, `sim open / --expect
   "id=session"`, `sim snapshot home-settings-today` and a raw snapshot →
   the heading `Today`, `‹ Your field` (label `Your field`), and no radio
   `2 min`, `5 min`, `10 min` or `20 min`, no `Minutes` group, no `Voice`
   and no `Settings`.
5. `home-renew`, only when `PLANTED` was 0400-1752 local (otherwise record
   `Nothing to tend now` and skip, as `home-dot` does). From Today of
   step 4, the visit open: `sim tap "label=Your field"`, `sim snapshot
   home-renew-back` → the heading `Your field`, no heading `Settings`, no
   `Minutes` radio. Wait until 7 minutes after `PLANTED`, with no relaunch
   and no trip away from the app; `sim tap "label=Settings"`, a raw
   snapshot → `5 min` alone selected; `sim tap "label=5 min"` (the radio
   already selected: the plan made again at the tap, the visit dropped);
   `sim tap "label=Done"`; `sim snapshot home-renew-home` → no heading
   `Settings`, the button `Isaiah 41:10, seed, ready today`,
   `1 to tend · about 1 min` and `Begin`. Then `sim tap "label=Begin"`,
   `sim open / --expect "id=session"`, `sim snapshot home-renew` → the
   heading `Today`, `Isaiah 41:10`, `Stage: seed`, `Say it`,
   `1 to tend · about 1 min`, and no `Minutes` radio, `Voice` or
   `Settings`.
6. Regression: `home-open` and `home-relaunch` of the field drive above.
   Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Red on base (before the sheet): `sim tap "label=Settings"` finds no
element (`home-settings*`, `home-dot`, `home-renew`); base's Today shows
`5 min` and `Voice` (`home-settings-today`); `icons loaded 24 of 24`
times out (`home-icons`). `home-renew` changes no product: it is green
at `b79e5b66d`, the base of the rigs that take its trip, by design.

Red on base (`81f8866ad`, before the app opened on home): `Continue`
opens Today (`id=session`), and `--expect "id=counts"` times out
(`home-open`, `home-relaunch`); Today offers `When I need…`
(`home-back`); the field's bar has no `When I need…`, and When I need…'s
back is `Today` (`home-need`). Red before the field took home A's layout:
no `0 of 1 ripe`, no `Add verses` and the plant an image, not a button
(`home-furrows`); the plant's tap opens nothing (`home-choose`);
`sim tap "label=Start here with Isaiah 41:10"` not found (`home-start`);
no `Begin` (`home-begin`); no `id=add-verses` (`home-add-places`); no
label ending `, ready today` (`home-dot`).

Report only the lines named above and the reference; delete the
`snapshots` folder.

## Gotchas

- The probe's runtime may be a fresh one per route, so the drive asserts
  the visit on the probe (`visit …`, `today shows …`), never on Today.
- The probe shows nothing until the garden, the session, the passages and
  the taught collections are read; `--expect "label=Home probe"` waits for
  all of them.
- On the day of a planting there is no new piece, so the started visit's
  `fresh` is false whether it came from the plan's review item (the seed
  due) or from a review of the plant's recalls (nothing open).
- `icons loaded` counts each `<name> <scheme>` once, however often its
  image reloads, so a count short of 24 that never moves is a PNG One's
  asset registry did not serve; an `icons failed` line names it. A dev
  bundle that fails to load at all (before hsdevbundle) shows neither.
- Two nodes are named `Add verses` (the bar's and the row's): tap the
  bar's by `id=add-verses`, never `label=Add verses`.
- What the simulator cannot show, the tests own: the greeting at other
  hours and in other zones (`test:home-clock`), a phrase start
  (`test:home-walk-a`), a remove's effect on the furrows (`passage.md`
  covers the remove), the 3-held limit (`passage.md`), the shelves sheet
  and `Plant`, the end of a run, how VoiceOver speaks the selection, and
  how each icon looks: its colours and contrast as drawn
  (`test:home-pixels`, `test:theme`), the dot's colour and its 3:1
  (`test:home-clock`), the dark set under a dark system, whether furrow
  heads and long titles fit (the 14-plant wrap), and the icons' sharpness
  at 48 pt on a 3× screen.
- What the simulator cannot show of the Settings sheet, the tests own: the
  slide and the swipe-down close (the driver has no drag; `test:settings-ways`
  holds `onRequestClose` by Escape), what VoiceOver says of the modal
  beyond the snapshot, the gear's look and contrast (`test:home-pixels`,
  `test:theme`, `test:field-bar*`), the sheet's colours in dark
  (`test:settings`, the walks), the sheet at large text sizes, the gear
  disabled while a remove is pending (`test:settings-ways`), a refused
  write (`test:settings-walk-*`), and Today with no choices when held,
  done or on an unread garden (the root's rule on every test frame).
