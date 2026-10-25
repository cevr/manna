# Brand

A visitor sees the Moonlit wheat brand on every page: the wheat `#ffefae` and
the night `#12354e`, the header's lockup (the bare wheat beside "First _the_
Blade" in small capitals, "the" in italic and not in small capitals), and the
series marks in fine lines drawn in the wheat's hand (each stroke swelling
and coming to a point), each on a band tile. Nothing on the site is cut
paper: no torn strip, no tilted card, no paper shadow, no disc. Down the home
page the sky turns: the wheat stands on its soil, the soil fades into the
paper through warm earth, the paper warms to the wheat under "Why we make
these", the dusk runs from the wheat through warm
stops to the night with Mark 4:27 in it, and the moonlit night rises out of it
with the stacked lockup, the sign-up and the footer. There is no dark theme:
a visitor whose system asks for dark sees the same page.

## Sub-features

- `brand-palette`: the stylesheet's `--color-night` is `#12354e` and its `--color-wheat` is `#ffefae`.
- `brand-lockup`: the header's home link holds the wheat; the wordmark is `all-small-caps`, its "the" `normal`.
- `brand-marks`: the four series marks are lines with no fill, and the home page has them.
- `brand-no-paper`: no element is clipped to a polygon, tilted, or a disc picture (`img[src*="mark-"]`).
- `sky-turns`: the home page's day into night, read from its screenshots down the page, with its two fades (`mask-image`).
- `brand-night`: the night close's painted sky is the night's blue, its moon and stars in place.

## How to get to it (user POV)

- Every page by its address: `/`, `/about`, `/privacy`, the four
  `/series/<slug>` pages, `/subscribe/check`, `/subscribe/confirmed`,
  `/subscribe/expired`, and a missing page (the 404).
- The home page, scrolled from the field to the footer, for `sky-turns` and
  `brand-night`.
- The system's light or dark setting (`ab set media light|dark`): both show
  the same page.

## Driving it with agent-browser

- **Preconditions:** the baseline, at both boards, in light and dark.
- **States:** default only; the brand has no focus, open, loading, empty or
  error state of its own (the header's link focus is Pages' `skip-link` and
  `header`).
- **Regression:** `apps/firsttheblade/src/brand.test.ts`,
  `apps/firsttheblade/src/palette.test.ts`,
  `apps/firsttheblade/src/ui/emblems.test.ts`,
  `apps/firsttheblade/kit/night-paint.slow.test.ts`, and
  `bun run --cwd apps/firsttheblade contrast`.

1. **Read each page.** At each board (`ab set viewport 1280 800`, then
   `ab set viewport 390 844`) and each scheme (`ab set media light`, then
   `ab set media dark`), `ab open $O<path>` for each page above, wait 1.5 s,
   then `ab eval` one read that returns, as JSON: `--color-night` and
   `--color-wheat` from the root's computed style; the `fontVariantCaps` of
   `[data-logo]` and of its `i`; whether `header a[href="/"]` holds an `svg`
   or a wheat `img`; the count of `img[src*="mark-"]`; the count of elements
   whose `clipPath` starts `polygon`; the count of elements outside an `svg`
   whose transform has a rotation or skew (`new DOMMatrix(t).b` not 0); the
   shapes in `li svg` and how many have a fill other than `none`; and the
   count of elements whose `maskImage` holds a `linear-gradient`. Every page
   reads `night` `#12354e`, `wheat` `#ffefae`, `all-small-caps`, `normal`,
   the wheat true, and 0 discs, polygons, tilts and filled marks
   (`brand-palette`, `brand-lockup`, `brand-marks`, `brand-no-paper`). On `/`
   the marks are more than 0 and the masks at least 2.
2. **Scroll the home page.** On `/`, `ab eval "window.scrollTo(0, <y>)"`,
   wait 0.7 s and `ab screenshot` at y = 0, 900, 1800, 2700, 3600, 4500 and
   9000, at each board and scheme (`sky-turns`). The shots show the header
   and Mark 4:28 on the painted sky with no strip under them; the wheat
   standing on its soil, and the soil fading into the paper through warm
   earth with no edge and no grey or blue band; the series as rows with a
   hairline between them, each mark on a tile; the paper warming to the wheat under
   "Why we make these"; the dusk from the wheat into the night with Mark 4:27
   in it where it is still light; the night rising out of it with the
   stacked lockup and the sign-up; then the footer on the night. The light
   and dark shots are the same page.
3. **The night.** The y = 9000 shot (`brand-night`): the night's sky is the
   night's blue, not violet; the moon stands at the top right and the stars
   are in the sky. `bun run --cwd apps/firsttheblade kit:night` writes the
   night's stills, and a second run writes the same bytes.
4. **Proof.** Each read's line (`<board> <scheme> <path> <json>`) and each
   screenshot go into `$EVIDENCE/brand/`.

## Gotchas

- The probe reads the computed style; a page still loading its stylesheet
  reads empty tokens. Wait for the load before the read.
- A screenshot shows the motion canvas, not the still: the field's and the
  night's canvases draw the still first, so a shot right after the load is
  the still to the eye.
- `ab set media dark` must be set before `ab open`, or the first read is in
  the scheme before it.
- The series marks stir under the pointer (Motion's `motion-card`); move the
  pointer off the rows before a screenshot of them.
