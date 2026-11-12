# Home

The home's rules (`apps/heartseed/README.md`, Home): the greeting by the
reader's local hour, the furrows (one per row of the field, each its list's
kind, icon and caption, each plant's stage and ready mark), the lists
the field holds, the shelves the Add a list sheet offers, and a start on a
verse (a tap on its plant) that makes it the session's visit. The field
(`apps/heartseed/src/field/screen.tsx`, `field.md`) is the app's home:
every launch on a read garden opens it, and so does the first minute's
`Continue`; Today's `Your field` leads back to it. It draws them in this
layout: fixed above the scroll view the greeting (`Good morning`, `Good
afternoon` or `Good evening`, with a sun or a moon), then the Today card
(`id=today-card`: its headline `<n> verse(s) · about <k> min` and its
parts `<r> to review · 1 new`, or `All tended for today` and `Nothing is
due right now.`, and one full-width button: `Start`, which opens Today as
the run stands, else `Practice anyway` on the weakest planted verse, else
none); in the scroll view
the heading `Your field`, the days sown and the harvest, the label
`Lists` with `Add a list` (`id=add-list`) or the limit line, one furrow
per row (its icon, its title as the button `Open <title>`, which opens
the list's own page, `list.md`, a caption `<n> verse(s) · <r> ready
today`, else `<n> verse(s) · <p> planted`, else `<n> verse(s) to
learn`, and its plants as buttons named
`<reference>, <stage>`, then `, ready today` with a gold dot when a plan
item not done is on the verse, no number under any), the legend, then the
rows `Settings` and `How Heartseed works`. A tap on a plant goes straight
into Today on its verse, whole (a review of a planted verse, or a verse
not planted learned fresh), with no card between (owner, 2026-11-12);
Today's `Your field` comes back. The `Settings` row opens the Settings
sheet (`apps/heartseed/src/settings/sheet.tsx`): the heading `Settings`
and `Done`, then the `Minutes` radios, `Voice`, the `Appearance` radios
and `About`; `How Heartseed works` replays the welcome and how a verse
grows in home's place (`first.md`; no `Your first verse`, no reference,
the second screen's button `See your field`, which shows home with its
three tips and `Got it`; the welcome's `Skip` shows home with none).
Leaving home for Today or a list ends the tips. Today holds no `Minutes`
and no `Voice`. `Add a list` opens the Add a list sheet
(`apps/heartseed/src/shelves/sheet.tsx`) over home: the heading
`Add a list` and `Done`, then a shelf head per shelf (`Any passage`, which
opens the chooser, whose first back `‹ Add verses` returns to the sheet;
then the Psalms, Proverbs and John picks and each collection the session
does not teach, then the 25 sections of Haskell's Bible Handbook
(`handbook.md`), each opening its offers in place, one shelf at a time),
each offer its reference or title, its count and `Plant <reference>` (or
`Plant <title>`) or `In your field`. The development probe
(`apps/heartseed/app/probe/home.tsx`, in a development build only) shows them as text over the live garden, passages and session,
one line each, then the home's icons as images with a count of those
loaded, then one `motion` line, the motion plan (`motionOf`) over the
live furrows: `motion icons <each icon delay> · springs <each spring
delay in reading order> · sways <count>`, `none` for an empty list. On
home only drawings move (each furrow's icon, each planted plant, full
corn's sway; the end's grown plants), hidden from the tree, so no node a
snapshot reads waits on them. It begins the session once the garden is read, as Today
does. Its one button, `Start with <reference>`, starts the first plant (in
furrow order) that `startOf` offers. Nothing it does writes the store.

## Sub-features

- `home-probe`: after the first minute, the probe shows the greeting by
  the host's hour, the own furrow and the `Protection & Fear` furrow with
  their kinds, icons and captions, each plant's label, the counts of
  the plan, the lists and the shelves; `Start with Isaiah 41:10` makes the
  verse the visit, and Today would show it.
- `home-icons`: the same probe loads every one of the home's icons
  (`src/home/icons.ts`, 12 names in light and dark, 24 PNGs) through One's
  asset registry, and says how many loaded.
- `home-probe-motion`: the same probe's `motion` line over the first
  minute's field: `motion icons 0 90 · springs 70 · sways 0` (two
  furrows, the own verse a seed, 14 plants not planted). It shows the
  plan on the device's runtime, not the drawings moving.
- `home-motion-reach`: at once after a relaunch, while the drawings still
  enter, home holds every control: `Practice anyway`, `Add a list`,
  `Settings`, `How Heartseed works`, the own plant's button and the 14
  not planted, and a tap on the own plant opens Today on it.
- `home-how`: at `first-home`, `How Heartseed works` shows the heading
  `Heartseed`, `Plant a verse. Say it from memory. Watch it grow.`,
  `Begin` and `Skip`, no `Your first verse` and no `Isaiah 41:10`;
  `Begin` shows `Every verse is a plant` with the one button `See your
  field`; that shows home with the three tips and `Got it`, `id=sown`,
  `id=harvest` and the plant buttons as before the tap, and no `[voice]
  speak` line since it.
- `home-how-skip`: after `Got it`, `How Heartseed works` then `Skip`
  shows home, `id=today-card`, no tip and no `Got it`.
- `home-tips-leave`: with the tips shown again (`How Heartseed works`,
  `Begin`, `See your field`), `Practice anyway` opens Today with no tip
  and no `Got it`; its `Your field` shows home with none.
- `home-open`: the first minute's `Continue`, then `Got it`, opens home in the done
  state: the heading `Your field`, the greeting, the Today card with
  `All tended for today`, `Nothing is due right now.` and `Practice
  anyway`, no `Start`, no `When I need…`; no Today.
- `home-anyway`: at `first-home`, before the seed is due, the Today card
  reads `All tended for today` and `Nothing is due right now.` with one
  `Practice anyway` and no `Start`; its tap opens Today on
  `Isaiah 41:10`.
- `home-today`: 7 minutes after planting and a `5 min` tap in Settings,
  `id=today-card` reads `1 verse · about 1 min` and `1 to review` with
  one `Start`, and home holds no `Begin`, `When I need…`, `id=add-verses`,
  `id=add-row` or `id=counts`.
- `home-start-run`: the card's `Start` opens Today (`id=session`) on
  `Isaiah 41:10` with `Say it`.
- `home-lists`: scrolled through, home holds the text `Lists`, one
  `id=add-list`, the captions `1 verse · 1 planted` and `14 verses to
  learn`, the buttons `Open Isaiah 41:10` and `Open Protection & Fear`,
  15 plant buttons, 0 buttons named `Remove` or starting `Remove `, and
  no text that is only a number.
- `home-furrows`: the field shows the greeting by the hour, the own
  furrow `Isaiah 41:10` (`1 verse · 1 planted`) with the plant button
  `Isaiah 41:10, seed`, the `Protection & Fear` furrow (`14 verses to
  learn`) with 14 plant buttons not planted, the Today card with
  `Practice anyway` and no `About`, and at the field's end the rows
  `Settings` and `How Heartseed works`.
- `home-learn`: one tap on `Psalms 91:1, not planted` opens Today on
  `Psalms 91:1` (no card, no `Learn` button between) with `Listen`
  offered; after `Say it` the summary reads `<k> of 19 words`; after a
  grade, `Your field` shows the button `Psalms 91:1, seed` and the
  caption `14 verses · 1 planted`.
- `home-start`: one tap on `Isaiah 41:10, seed` opens Today on that
  verse; home holds no `id=chosen` and no button starting `Practice ` or
  `Learn ` but `Practice anyway`.
- `home-back`: Today's `Your field` (shown `‹ Your field`) leads to home,
  no plant selected and `Start` on the Today card while the visit is open;
  Today holds no `When I need…`.
- `home-begin`: with the started visit open the Today card offers
  `Start`, which opens Today on it.
- `home-add-places`: `Add a list` (`id=add-list`) opens the Add a list
  sheet, whose `Done` leads back to home.
- `home-add`: the sheet lists the 17 shelves in order, then the 25
  Handbook shelves (`handbook.md`); `Proverbs` lists
  its five picks, `Proverbs 18:10` (taught in `Protection & Fear`) as
  `In your field`, the rest with `Plant`; `Plant Psalms 46:1-3` leads home
  with `Psalms 46:1-3` the furrow after `Isaiah 41:10`.
- `home-add-any`: the sheet's `Any passage` opens `Add a passage`, whose
  one back `‹ Add verses` returns to the sheet, all shelves closed; its
  `Done` leads home.
- `home-dot`: a seed at its due after a `Minutes` tap in Settings on home
  shows on the field as `Isaiah 41:10, seed, ready today`, with
  `1 verse · about 1 min`, `1 to review` and `Start`, and starts there.
- `home-relaunch`: a relaunch opens home, with the greeting and the
  Today card, never Today.
- `home-settings`: the `Settings` row at the field's end (no `Settings`
  in the fixed top) opens the sheet: the heading
  `Settings`, `Done`, the line `A day's tending` over the `Minutes` radios
  with `5 min` alone selected, the line `Reads new verses aloud` over
  `Voice` valued `Her`, the `Appearance` radios with `System` selected,
  and `About`; `Done` closes it to home.
- `home-settings-minutes`: `10 min` chosen in the sheet stays selected
  across a relaunch.
- `home-settings-about`: the sheet's `About` opens About (`about.md`:
  the name, the version and `Licences`, no licence), whose
  `Your field` returns to home with the sheet closed.
- `home-settings-today`: Today holds no `Minutes` radio, no `Voice` and
  no `Settings`.
- `home-renew`: from Today, `Your field`, then `5 min` (the radio already
  selected) in Settings at the seed's due makes the plan again at the tap:
  home shows the seed ready today with `Start`, which opens Today on it
  with no `Minutes` radio, `Voice` or `Settings` (the trip the test rigs
  take to renew the plan).
- `home-end`: after a run's last `Next`, Today is the end: the heading
  `The field is tended` and no heading `Today`, `1 grew a stage.`, an
  image labelled `Isaiah 41:10, blade`, a button `Your field`, and no
  `Nothing to tend now`, `Say it`, `Next`, `Grade`, `Settings`, `Minutes`
  or `Voice`. `Your field` leads home: the heading `Your field`,
  `All tended for today` with `Practice anyway`, no `Start`, and the plant
  button `Isaiah 41:10, blade`.

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
   - `furrow Isaiah 41:10 · own · bow · 1 verse · 1 planted`, or
     `furrow Isaiah 41:10 · own · bow · 1 verse · 1 ready today` when the
     counts line says `1 to tend`;
   - `furrow Protection & Fear · taught · bow · 14 verses to learn`;
   - `counts Nothing to tend now`, or `counts 1 to tend · about 1 min`
     when the seed's learning step had passed when the probe made the
     plan;
   - `plant Isaiah 41:10, seed`, ending `, ready today` exactly when the
     counts line says `1 to tend`;
   - 14 nodes `plant <reference>, not planted`;
   - `lists 2`;
   - `shelves 42` and
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

5. `home-probe-motion`:

   ```bash
   sim open probe/home --expect "label=motion icons 0 90 · springs 70 · sways 0"
   sim snapshot home-probe-motion
   ```

   → that line, and the `home-probe` lines of step 2 still as listed
   there.

6. Regression: `field.md`'s `field-first` and `field-back` on the same
   install pass unchanged.
7. Then `sim doctor` (record `head` and `timingsHold`) and `sim down`.

Red on base: `sim open probe/home --expect "label=Home probe"` times out
(`ReadinessTimedOut`): base has no such route. For `home-icons`, the
`--expect "label=icons loaded 24 of 24"` times out on a base whose probe has
no icon lines, or no `gear`. For `home-probe-motion`, the `--expect` times
out (`ReadinessTimedOut`) on a base (`55f2bad31`) whose probe has no
`motion` line.

### The field in its layout

On an install of its own (the probe's `Start with` leaves a visit, which
puts `Start` on the Today card), with the same variables:

1. `first.md` steps 1-6, to `first-planted`; note `PLANTED` (`date`) and
   `date +%H%M`.
2. `home-open` and `home-anyway`: `sim tap "label=Continue"`,
   `sim tap "label=Got it"`,
   `sim open / --expect "id=today-card" --no-relaunch`, `sim snapshot
   home-open` → the heading `Your field`; the greeting by `date +%H%M`, as
   `home-furrows` takes it; the texts `All tended for today` and
   `Nothing is due right now.`; one button `Practice anyway`, no `Start`,
   no `Begin` and no `About` in the fixed top; no `When I need…`; the
   button `Isaiah 41:10, seed`; no heading `Today`, no button `Today`, no
   `Say it`, no label starting `Stage:`.
3. `home-furrows` and `home-lists`: on the same screen, `sim snapshot
   home-furrows`, then `sim scroll "label=How Heartseed works" down` and
   `sim snapshot home-lists` → the heading `Your field`; the text `Good morning`
   (0400-1159 by `date +%H%M`), `Good afternoon` (1200-1759) or
   `Good evening` (take `date` again when within a minute of an edge); the
   text `Lists` and one button `id=add-list` (`Add a list`); the button
   `Open Isaiah 41:10` and the caption `1 verse · 1 planted`; a button
   `Isaiah 41:10, seed`; the button `Open Protection & Fear`, the caption
   `14 verses to learn` and 14 buttons ending `, not planted` (15 plant
   buttons in all); 0 buttons named `Remove` or starting `Remove `;
   `1 day sown`; `0 verses at full corn`; the rows
   `Settings` and `How Heartseed works` at the end; no text node that is
   only a number; no `When I need…`, no `id=add-verses`, no `id=add-row`,
   no `id=counts`; no `Today` heading, no button `Today`, no `Say it`, no
   label starting `Stage:`. `sim scroll "label=Isaiah 41:10, seed" up`.
4. (No step: home has no chosen card; `home-start` below is the plant's
   tap.)
5. `home-start` and `home-back`: `sim tap "label=Isaiah 41:10, seed"`
   (one tap), `sim open / --expect "id=session" --no-relaunch`,
   `sim snapshot home-back-today` → the heading `Today`, the reference
   `Isaiah 41:10`, `Say it`, `Stage: seed`, a button `Your field`, and no
   `When I need…`. Then `sim tap "label=Your field"`,
   `sim snapshot home-back` → the heading `Your field`, no `id=chosen`,
   no button starting `Practice Isaiah` or `Learn `, and on the Today
   card `1 verse · about 1 min`, `1 to review` and `Start` (the started
   visit is open).
6. `home-begin`: `sim tap "label=Start"`, `sim snapshot home-begin-today`
   → the heading `Today`, `Isaiah 41:10`, `Say it`.
7. `home-learn`: `sim tap "label=Your field"`,
   `sim tap "label=Psalms 91:1, not planted"` (one tap),
   `sim open / --expect "id=session" --no-relaunch`, `sim snapshot
   home-learn-today` → `id=reference` `Psalms 91:1` and a button
   `Listen`. Then `sim tap "label=Say it"` and say it (or, on the
   simulator, as `run.md`'s recital) → the summary `<k> of 19 words`;
   tap a grade when one shows, then
   `sim tap "label=Your field"`, `sim scroll "label=Psalms 91:1, seed" down`, `sim snapshot home-learn` → the button `Psalms 91:1, seed` and
   the caption `14 verses · 1 planted`.
8. `home-add-places`: `sim tap "id=add-list"` → the heading `Add a list`;
   `sim tap "label=Done"` → the heading `Your field` again.
9. `home-dot` and `home-today`, only when `PLANTED` was 0400-1759 local
   (an evening planting is due the next morning; otherwise record
   `All tended for today` and skip, as `run.md` step 3 does): wait until 7
   minutes after `PLANTED`, on home
   `sim scroll "label=Settings" down`, `sim tap "label=Settings"`, `sim tap "label=5 min"` (the plan made
   again at the tap; the idle visit dropped), `sim tap "label=Done"`, with
   no trip to Today, `sim open / --expect "id=today-card" --no-relaunch`,
   `sim snapshot home-dot` → one `id=today-card` with the texts
   `1 verse · about 1 min` and `1 to review` and one button `Start`; the
   button `Isaiah 41:10, seed, ready today`; no `Begin`, `When I need…`,
   `id=add-verses`, `id=add-row` or `id=counts`. Then `home-start-run`:
   `sim tap "label=Start"`, `sim open / --expect "id=session"
   --no-relaunch`, `sim snapshot home-start-run` → `Isaiah 41:10` and
   `Say it`.
10. `home-relaunch`: `sim relaunch`, `sim open / --expect "id=today-card"`,
    `sim snapshot home-relaunch` → the heading `Your field`, the greeting,
    the Today card, and no heading `Today`.
    `home-how`: record `id=sown`, `id=harvest` and every plant button's
    name; `sim scroll "label=How Heartseed works" down`, `sim tap
    "label=How Heartseed works"`, `sim snapshot home-how`; `sim tap
    "label=Begin"`, `sim snapshot home-how-grows`; `sim tap "label=See
    your field"`, `sim snapshot home-how-tips`; then `sim doctor`.
    `home-how-skip`: `sim tap "label=Got it"`, the row again, `sim tap
    "label=Skip"`, `sim snapshot home-how-skip`.
    `home-tips-leave`: the row, `Begin`, `See your field`; `sim tap
    "label=Practice anyway"`, `sim open / --expect "id=session"
    --no-relaunch`, `sim snapshot home-tips-today`; `sim tap "label=Your
    field"`, `sim snapshot home-tips-back`.
11. `home-motion-reach` (a keep-guard): `sim relaunch`,
    `sim open / --expect "id=today-card"`, at once `sim snapshot
    home-motion-reach` → the heading `Your field`, the Today card's button
    (`Start` or `Practice anyway`), `Add a list`, the own plant's button
    (its label starts `Isaiah 41:10, seed`; it ends `, ready today` when
    step 9 ran) and the buttons ending `, not planted`. Then at once tap
    that plant by the label the snapshot gave, and `sim snapshot
    home-motion-reach-today` → the heading `Today` and the reference
    `Isaiah 41:10`. Record the seconds between the relaunch and
    each snapshot.
12. Regression on the same install: `field.md`'s `field-first`,
    `field-control` and `field-back` (the plants as buttons), and
    `about.md`'s way to About through `Settings`. Then `sim doctor` (record
    `head` and `timingsHold`) and `sim down`.

### The Settings sheet

On an install of its own, from `first.md` steps 1-7 to `first-home`, with
the same variables:

1. `home-settings`: `sim snapshot home-settings-top` before the tap →
   no control named `Settings` above the scroll view's top (record each
   `Settings` node's y beside the scroll view's); then
   `sim scroll "label=Settings" down`, `sim tap "label=Settings"`, `sim snapshot home-settings`, and a raw snapshot (`agent-device snapshot --json --raw
   --observe-only --force-full --session verify-heartseed`) → the heading
   `Settings` and the button `Done`; the line `A day's tending` over the
   radios `2 min`, `5 min`, `10 min`, `20 min`, `5 min` alone selected;
   the line `Reads new verses aloud` over the button `Voice`, valued
   `Her` (raw); the radios `System`, `Light`, `Dark`, `System` selected;
   the button `About`. Record whether home's nodes (`Your field`, the
   furrows, the Today card) appear in the same snapshot: that is the
   modality as the accessibility tree holds it. Then `sim tap
   "label=Done"`, `sim snapshot home-settings-done` → the heading
   `Your field`, no heading `Settings`, a button `Settings`, and no
   button `About`.
2. `home-settings-minutes`: `sim scroll "label=Settings" down`, `sim tap "label=Settings"`,
   `sim tap "label=10 min"`, a raw snapshot → `10 min` alone selected.
   `sim tap "label=Done"`, `sim relaunch`, `sim open / --expect
   "id=today-card"`, `sim scroll "label=Settings" down`, `sim tap "label=Settings"`, a raw snapshot → `10 min`
   still alone selected. Then `sim tap "label=5 min"`, `sim tap
   "label=Done"` (restored).
3. `home-settings-about`: `sim scroll "label=Settings" down`, `sim tap "label=Settings"`,
   `sim tap "label=About"`, `sim snapshot home-settings-about` → the
   heading `About`, the button `Licences`, no label equal to `CREDITS`,
   and no radio `System`.
   `sim tap "label=Your field"`, `sim snapshot home-settings-back` → the
   heading `Your field`, and no heading `Settings`.
4. `home-settings-today`: home after the first minute is in the done
   state, so no `Start`: `sim tap "label=Isaiah 41:10, seed"`,
   `sim open / --expect
   "id=session" --no-relaunch`, `sim snapshot home-settings-today` and a raw snapshot →
   the heading `Today`, `‹ Your field` (label `Your field`), and no radio
   `2 min`, `5 min`, `10 min` or `20 min`, no `Minutes` group, no `Voice`
   and no `Settings`.
5. `home-renew`, only when `PLANTED` was 0400-1752 local (otherwise record
   `All tended for today` and skip, as `home-dot` does). From Today of
   step 4, the visit open: `sim tap "label=Your field"`, `sim snapshot
   home-renew-back` → the heading `Your field`, no heading `Settings`, no
   `Minutes` radio. Wait until 7 minutes after `PLANTED`, with no relaunch
   and no trip away from the app; `sim scroll "label=Settings" down`, `sim tap "label=Settings"`, a raw
   snapshot → `5 min` alone selected; `sim tap "label=5 min"` (the radio
   already selected: the plan made again at the tap, the visit dropped);
   `sim tap "label=Done"`; `sim snapshot home-renew-home` → no heading
   `Settings`, the button `Isaiah 41:10, seed, ready today`, the Today
   card's `1 verse · about 1 min`, `1 to review` and `Start`. Then
   `sim tap "label=Start"` (the card is fixed: no scroll),
   `sim open / --expect "id=session" --no-relaunch`, `sim snapshot home-renew` → the
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

Red on base (`7cd3cfa9b`, before the Today card): `sim snapshot` at
`first-home` holds `label=Begin` (with a visit open), `label=When I
need…`, `id=add-verses`, `id=add-row`, `id=counts` and no
`id=today-card`, so every `--expect "id=today-card"` times out
(`home-open`, `home-relaunch`, `home-dot`); the captions read
`<k> of <n> ripe` and the plants show numbers (`home-lists`); a verse not
planted starts nothing (`home-learn`); `sim tap "label=Practice anyway"`
finds no element (`home-anyway`); the sheet's heading is
`Add verses` (`home-add-places`); `Settings` is a gear in the fixed bar
(`home-settings`).

### The end of a run

Daytime only, as `run.md`'s `run-due`. From `run.md`'s drive, after
`run-recite` (`Grew to a blade.`), in place of its step 6:

1. `home-end`: `sim tap "label=Next"`, `sim snapshot home-end` → the
   nodes of the row above; record how the tree shows `role="img"`.
2. `sim tap "label=Your field"`, `sim snapshot home-end-home` → the
   heading `Your field`, `All tended for today` and `Practice anyway`, no
   `Start`, the plant button `Isaiah 41:10, blade`.

Red on base (`c7bce58da`, before the end): after `Next` the snapshot
holds the heading `Today` and `Nothing to tend now`, and no
`1 grew a stage.`.

### The Add a list sheet

On a fresh install of its own, from `first.md` steps 1-7 to `first-home`
(the first minute done, the own furrow and `Protection & Fear` on home),
with the same variables:

1. `home-add`: `sim tap "id=add-list"`, `sim snapshot home-add-sheet`
   → the heading `Add a list` and a button `Done`; the buttons
   `Any passage`, `Psalms`, `Proverbs`, `The Gospel of John`,
   `Forgiveness`, `Peace in Anxiety`, `Strength`, `Provision`,
   `Guidance & Wisdom`, `Temptation & Victory`, `The Holy Spirit`,
   `Healing`, `Comfort in Grief`, `Salvation & Assurance`,
   `Christ’s Return`, `Prayer Answered`, `Rest`, in that order (`sim
   scroll` as needed; record how the tree shows `aria-expanded`). Record
   whether home's nodes show in the same snapshot (the modality as the
   tree holds it).
2. `sim tap "label=Proverbs"`, `sim snapshot home-add-proverbs` →
   `Proverbs 4:23`, `Proverbs 15:1`, `Proverbs 16:3`, `Proverbs 18:10` and
   `Proverbs 22:6`, each with `1 verse`; the buttons
   `Plant Proverbs 4:23`, `Plant Proverbs 15:1`, `Plant Proverbs 16:3` and
   `Plant Proverbs 22:6`; the text `In your field` and no
   `Plant Proverbs 18:10` (it is in `Protection & Fear`, taught on the
   device).
3. `sim tap "label=Psalms"`, `sim tap "label=Plant Psalms 46:1-3"`,
   `sim open / --expect "id=today-card" --no-relaunch`, `sim snapshot
   home-add-planted` → the heading `Your field` and no heading
   `Add a list`; the furrow titles in order `Isaiah 41:10`,
   `Psalms 46:1-3`, `Protection & Fear`; the caption `3 verses to learn`,
   and the buttons `Psalms 46:1, not planted`, `Psalms 46:2, not planted`
   and `Psalms 46:3, not planted`; a button with `id=add-list` still.
4. `home-add-any`: `sim tap "id=add-list"`, `sim tap "label=Any
   passage"`, `sim snapshot home-add-any` → the heading `Add a passage`
   and a button `Add verses` showing `‹ Add verses`, with no button
   `Your field`. `sim tap "label=Add verses"` → the heading `Add a list`
   again, with `Psalms` not expanded. `sim tap "label=Done"` → the heading
   `Your field`.
5. `home-add-places`: step 8 of the field drive above.
6. Regressions on the same install: `passage.md`'s `passage-books`,
   `passage-range` and `passage-plant`, through `Any passage`; this file's
   `home-settings` and `home-settings-today`. Then `sim doctor` (record
   `head` and `timingsHold`) and `sim down`.

Red on base (`7cd3cfa9b`): `sim tap "id=add-list"` finds no element (the
sheet opened from `id=add-verses`, its heading `Add verses`).

### A wait that stays

`home-wait-stays`: a wait in the running app fails where it is, and never
relaunches onto home. From `first-home` with a verse due (after a
`sim relaunch` the next morning, or any install whose home offers
`Start`), with the same variables:

1. `sim tap "label=Start"`, `sim open / --expect "id=session" --no-relaunch`
   → ok, `detail.retried` false.
2. `sim open / --expect "id=today-card" --timeout 15 --no-relaunch` → exit 1,
   `TargetMissing`, in about 15 s.
3. `sim snapshot home-wait-stays` → still Today: `id=session`, the same
   reference, and no relaunch in the log.

Nothing native changes: an installed Debug build serves
(`sim install --app <copy>`). Red on base: `--no-relaunch` is
`BadArguments`. Base's own step, with no flag, is ok with
`detail.retried` true on home, and the visit gone.

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
- Home's add is `Add a list` (`id=add-list`), in the scroll view under
  `Lists`; the `Settings` and `How Heartseed works` rows lie at the
  scroll view's end, so scroll before a tap. On the chooser's
  `Add a passage`, `label=Add verses` is its one back, to the sheet.
- An offer's title is text, as a furrow's title on home under the modal
  is: target an offer by its button `Plant <reference>`.
- What the simulator cannot show of the Add a list sheet, the tests own:
  the limit line and the plant's alert in the sheet, `Full`, a double tap
  and the pending state, Escape and the swipe-down close, unread passages
  (`test:shelves`, `test:shelves-walk-*`, the acceptance file), the slide,
  the sheet in dark and its contrast (`test:dark-screens-b`,
  `test:dark-screens-dark-b`), the icons' look, whether a long title fits,
  and what VoiceOver says of the modal beyond the snapshot.
- What the simulator cannot show, the tests own: the greeting at other
  hours and in other zones (`test:home-clock`), a start on a verse with
  old pieces stored (`test:home-walk-a`, `test:home-start`), a remove's effect on the furrows (`passage.md`
  covers the remove), the 3-held limit (`passage.md`), several verses
  grown in one run (`test:run-cues-b`, `src/run/tended.test.tsx`), a
  visit's growth beside a plan (`test:home`, `test:home-walk-b`), a
  making while the end shows (`test:wake-end`), the end over an unread garden (`src/run/rule.test.ts`), and
  how each icon looks: its colours and contrast as drawn
  (`test:home-pixels`, `test:theme`), the dot's colour and its 3:1
  (`test:home-clock`), the dark set under a dark system, whether furrow
  heads and long titles fit (the 14-plant wrap), and the icons' sharpness
  at 48 pt on a 3× screen.
- What the simulator cannot show of the Settings sheet, the tests own: the
  slide and the swipe-down close (the driver has no drag; `test:settings-ways`
  holds `onRequestClose` by Escape), what VoiceOver says of the modal
  beyond the snapshot, the `Settings` row's look and contrast
  (`test:home-screen`, `test:field-bar*`), the sheet's colours in dark
  (`test:settings`, the walks), the sheet at large text sizes, no
  `Settings` on a list's page (`test:settings-ways`), a refused
  write (`test:settings-walk-*`), and Today with no choices when held,
  done or on an unread garden (the root's rule on every test frame).
- What the simulator cannot show of motion (the driver reads the
  accessibility tree, takes no picture here, and has no Reduce Motion
  switch), the tests own: that anything moves at all, the timing, the
  stagger, the spring's shape and the sway (the acceptance file,
  `test:home-motion`, `test:home-motion-root`, `test:home-motion-drawn`,
  `test:run`); stillness under Reduce Motion (the same, and the source
  guard in `test:home-motion`); dropped frames and battery on a large
  field (bounded by the caps, `test:home-motion`). That a moving wrapper
  leaves its drawing's place and size as they were, and how the motion
  feels, no check shows: the owner judges both on a Release build from
  main. `home-probe-motion` shows the plan on the device's runtime and
  `home-motion-reach` that no control waits.
