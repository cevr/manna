# Heartseed: product brief

Heartseed is Selah's new name. It is the Scripture memory app rebuilt on One for iPhone, Mac and Android. This brief holds the owner's decisions from the planning talk on 2026-10-26. The `selahone` unit plans the build from it after the hymnal queue (`packages/hymnal/plans/hymnapp-run.md`).

## Why it exists

The owner, 2026-10-26: "it's intended to be a kind of a vocal first memorization app that uses all the modern methods to really memorize the whole Bible. A core concept is that I believe that memorizing the Bible is necessary for guarding ourselves and by in the second order effect is that it would be necessary for salvation because we need to remember the promises of God to receive their fulfillment."

The owner on the feel: "something delightful, something that kind of is fun and simple and easy to use".

The name comes from Luke 8:11–15: the seed is the word of God, and the good ground is "an honest and good heart" that keeps it.

## The experience

- **First minute.** One promise, Isaiah 41:10, in three phases: hear it, say it with first letters, then say it alone. It ends with the first seed planted. There is no sign-up and no setting.
- **Today.** One button, "Say it". Each word lights as the user says it, with a soft haptic tick. A missed word shows only a mark, and a tap reveals it (a peek). After a recall the verse grows a stage, and Heartseed suggests the grade, which the user can change. A sound plays only when a verse grows. Silent mode is respected.
- **Daily time.** Five minutes by default; the user can choose 2, 10 or 20. Heartseed fills the time with due reviews and one new piece. There is never a pile of overdue cards.
- **The field.** Every passage is a row and every verse a plant: seed, then blade, then ear, then full corn (Mark 4:28). Progress is "days sown", which never resets, and a harvest count of verses at full corn.
- **When I need….** The promises the user knows, by situation (fear, temptation, worry, sickness, guilt, guidance, need, grief). Saying one counts as a review.
- **Hands-free.** In the first release. Heartseed says the reference, the user recites, and Heartseed answers with a sound and says only the missed words. Again, pause and next work from the lock screen and headphones.
- **Voice.** An on-device voice reads each new verse in the hear phase. The user can turn it off.
- **Share at harvest.** When a verse reaches full corn, a quiet Share offers a card: the verse, its reference and the full-corn plant in the Wada palette, with the name small.

## Memory methods

- FSRS review (as in Selah today).
- Cues that fade: full text, then first letters, then nothing.
- Long verses learned as phrases first, then joined.
- Plant at night, recall in the morning: a verse planted in the evening gets its first recall the next morning.
- Understand it first: one line on what the verse means in its place, with the hard KJV words glossed. Open: who writes and checks these lines (the owner's doctrine frame applies).
- Mixed review across passages and promises.

## Texts, tiers and prices

- **Free:** the KJV; 3 passages of up to 20 verses each; the full loop (say it, live marks, peek, hands-free); the Fear promise collection; a daily reminder; sync.
- **Pro:** $2.99 a month, $14.99 a year or $39.99 lifetime. It adds unlimited passages, all 14 promise collections, whole chapters and books, the other public-domain texts, reminders when reviews come due (several a day), the home-screen widget and more Wada palettes.
- **Licensed texts** (NKJV, ESV and others) are separate purchases, one per text, priced to cover the licence fee.
- This replaces the $3.99 one-time unlock decided on 2026-10-19.

## Platforms and data

- iPhone first (TestFlight on the owner's phone), then the Mac from the same One code, then Android.
- Local-first, with no account. Progress syncs through iCloud on Apple devices and Google backup on Android. Sync is free for everyone.
- No import from the SwiftUI Selah app (the owner: "I don't use it much"). The SwiftUI app retires when Heartseed on the Mac replaces it.
- Family profiles on one device come later.
- Palette A, Wada No. 167 (Ecru #c2ae93, Pale King's Blue #a7d4e4, Vandar Poel's Blue #064f6e), as in the hymnal.

## Website

From the owner's reference video (2026-10-19), a site for the app helps both search and AI recommendations:

- four blocks: what it is, how it works, the features, and who it is for (plus App Store reviews once there are any);
- the site set as the marketing URL on each App Store localization;
- about 20 keyword pages over two weeks: "best Bible memory apps in 2026", "… alternatives" pages, free tools (a promise finder, a first-letter card maker, "how long to memorize Psalm 23") and guides;
- open to AI crawlers, with `llms.txt`.

The site follows the house web stack (Solid 2, prerendered on Cloudflare, as First the Blade). Domain: heartseed.app (no DNS on 2026-10-26; a registrar check is pending; heartseed.com is taken).

## Prototypes

Throwaway HTML: `tmp/orchestrate/hymnapp/selahone/prototypes/app.html` (six screens) and `site.html`. They were shown on Sideshow on 2026-10-26.

## Open

- Who writes the "understand it first" lines, and from which sources.
- Domain purchase (reserved for the owner).
- App Store and Play listings, and the in-app purchase products (reserved for the owner).
