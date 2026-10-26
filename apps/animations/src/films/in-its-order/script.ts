// In Its Order: the screenplay of The Path of the Just, episode 01 of 44,
// the series' opener (Tier One, the milk). The owner kept its draft
// (`apps/animations/series/theology/scripts/01-in-its-order.md`: "Keep it:
// go on to the concept and the Board"), so this file is the film's script
// and the source of what is said; the draft is not edited for it. The
// series is named for Proverbs 4:18; milk and meat are said only inside the
// film, never in a title, a card label or a thumbnail (owner, 2026-10-20).
//
// One narrator reads it, the owner, in his voice
// (`.claude/skills/film/reference/owner-voice.md`), in the series' Language
// (`apps/animations/series/README.md`), which wins where the two differ, and
// to Ellen White's account of Christ's manner of speaking
// (`.claude/skills/film/reference/voice-counsel.md`), timed at 150–165 wpm.
// It speaks to every Christian (CRAFT rule 2): it quotes only Scripture,
// verbatim KJV checked with `manna verse` (supplied-word brackets dropped for
// speech), one quotation a beat. Ellen White and the pioneers are never
// quoted nor named in speech: their thought is said in the narrator's own
// words, inside their words (sources.md, quotes.jsonl), and the credits name
// them. No denomination and no church history after the apostles.
//
// Each line is marked for delivery
// (`.claude/skills/film/reference/elevenlabs-delivery.md`): `{*}` before the
// word that carries the sense, `{/}` a breath, `{//}` a hold (0.6 s, or the
// seconds it names) at an act's question, after a key quotation and at a
// register switch. `{mark}` cues sit before the word a picture must hit.
//
// The order. The joke (`cold`: a young man at a wedding feast still asking
// for his bottle; Hebrews says that to its readers), the title, then what
// milk is (`milk`: the plain word), which truths are the milk (`stones`: the
// first principles, said as principles and not as a list, and their
// foundation, Christ; owner, 2026-10-26), the
// problem in one small dose (`bottle`, `teeth`: some never chew), its other
// side (`rush`: some skip the first steps and twist the rest; owner,
// 2026-10-20), the turn (`math`: the meat leaves out nothing that was in the
// milk), what the meat is (`priest`: more of Christ, His priesthood now), how
// growth happens (`grain`, `eat`), the series map (`path`), and the landing
// back at the feast (`name`). The series' thesis is one Waggoner devotional
// page (MEDM September 1904, 286.4–286.8), and the script stays inside its
// words. `priest` names the meat as Hebrews names it and shows Christ
// entering the veil; where He ministers when belongs to Tier Two.
//
// Motifs (CRAFT rule 4), each introduced and paid off:
// - The cup. A baby's cup of milk in `cold`; filled in `milk` from an open
//   book (the milk is the word); in the landing the young man sets the bottle
//   down at a set table, and the cup stands among the bread and the dishes,
//   still there (`math` paid off: nothing in the milk is left behind).
// - The stones. Plain stones, no icon on any, laid as a foundation in
//   `stones` and lit gold through when Christ is named its foundation;
//   hopped over in `rush`; the first rise of the path in `path`; the
//   courtyard's paving for a breath in `name`. Tier One's episode map.
// - The grain. A seed in `grain` grows blade, ear, full corn; in the landing
//   the bread on the table is that corn.
// - The light from the cross. A small gold cross on the page in `priest`,
//   whose light widens over the stones; in `path` the whole path lies inside
//   its light; in `name` it warms the whole courtyard.
// The setting bookends (CRAFT rule 4): `cold` and `name` are one wedding
// courtyard in one layout and framing, changed: the landing's teal-to-yellow
// sky, the bottle set down, Christ the host at the head of the table.
//
// Tent poles (CRAFT rule 11), each with its act's light and the question that
// opens the act (the chapters, `acts.ts`):
// - `cold`: the feast table, the series lead holding a baby's bottle,
//   teal day. "What are milk and meat?"
// - `stones`: a row of plain stones on parchment, peach. "Which truths are
//   the milk?"
// - `math`: the slate of sums combining into one great sum, peach to dawn
//   (episodes 07 and 10 reuse the slate). "Do we leave the milk behind?"
// - `priest`: the veil with gold light behind it, dawn gold. "So what is the
//   meat?"
// - `name`: the set table under the teal landing sky. "How does anyone
//   grow?" (its act opens on `grain`).
//
// Registers (CRAFT rule 3): IDEA (parchment, flat figures, one gold prop) for
// `milk`, `stones`, `teeth`, `rush`, `math`, `path`; STORY (cardboard
// diorama, faces) for `cold`, `bottle` (Corinth), `grain` (a field), `eat`
// (Jeremiah); `priest` goes from IDEA into STORY; the landing merges them.
// The film has no black moment; its valley is a short dusk in `bottle`. The
// narration's words appear on screen only as full-screen cards the engine
// sets (CRAFT rule 1): no picture carries lettering. The thesis's card is
// the take's first clause, "Grow in grace", since a card holds 12 words at
// most and those three are the answer to `cold`'s question.
//
// The cast (the draft's `## Cast`; character-design 2.3, casting.md). Every
// figure wears sleeves, a circle hand at each sleeve's end and no thumbs, and
// is shaded with colour, never grey or black (CRAFT rule 12).
// - Every figure is dressed in the Bible's own time (the owner's direction A;
//   the cast lineup is each record's reference).
// - The young man at the feast is the series lead, never named: the young
//   lead of the lineup, beardless, in a cream tunic with a teal mantle over
//   his left shoulder (the owner: "C: the young lead as he was"), recorded
//   in the library as `lead-feast`, about 3.36 of his
//   heads tall like every figure (the cast canon). The mother and the baby at
//   the cup are this film's `feast-mother`. The IDEA figures are plain
//   villagers in undyed linen: the child (on the first stone, the one who
//   skips the stones, at the slate) is the library's `villager-child` and the
//   toddler who runs is `villager-toddler` (base sizes for filler cast); the
//   grown villager (the eater and the watcher) is a dress variant of the
//   library's `sower`
//   (his face, beard and build, and the sower's linen headcloth with its walnut band, the mantle off, so he is never read as Christ), and he and the
//   baby are drawn in this film's `idea-villagers`.
// - Jesus Christ is the locked figure (`src/library/cast/christ`), at the top
//   of the court canon's height band, never short: as Priest in `priest` (a
//   white robe, the golden girdle and the breastplate, seen from behind
//   passing in through the veil), and in His library dress (the plain white
//   robe and the gold sash; owner, 2026-10-25) as the host in `name`. The
//   Father is never pictured: the host is Christ.
// - Paul (`bottle`), the sower (`grain`) and Jeremiah (`eat`) are Bible
//   figures in story cloth, each drawn once as shared cast.
// - The wedding guests and the Corinthian church come from the crowd kit
//   (casting.md 2.2, 2.6), a seeded mix of the base rigs. The recurring cast
//   (docs/ensemble.md) may sit among the guests as background, and none is
//   required.
//
// Quoted Scripture: 11 passages, 161 of 884 spoken words (18.2 %). 2 Peter
// 3:18 (`thesis`) is quoted from "Grow", its opening "But" dropped; Proverbs
// 4:18 (`path`) likewise.

import { defineScript } from '@manna/film/core';

/** The film's name: the film, its title card and its credits all read it here. */
export const TITLE = 'In Its Order';

/** Every brief carries it (CRAFT rule 1). */
const CARDS =
  "The narration's words appear only as full-screen cards: nothing in the picture carries lettering.";

export const script = defineScript([
  {
    id: 'cold',
    say: '{baby}A baby drinks milk, and nobody minds. {/} {grown}But picture a young man at a wedding feast, {bottle}still asking for his {*}bottle. {/} {letter}Now picture a letter to believers that says nearly the {*}same. {/} {quote}They “are become such as have need of milk, and not of strong {*}meat.” {//} {ouch}And that letter is in our {*}Bible. {/} {what}So what is milk, and what is meat? {/} {why}And why would the Bible care which one we eat?',
    cite: ['Hebrews 5:12'],
    cast: ['lead-feast', 'feast-mother'],
    picture: `STORY: a cardboard courtyard at a village wedding, teal day, lanterns strung, a long table of bread, fruit and dishes. On \`baby\` a mother lifts a cup to a baby's lips, close on the baby's glad face. On \`grown\` the camera trucks down the table to a tall young man in his festive long cream tunic and teal mantle, the series lead; on \`bottle\` he holds up a baby's bottle, hopeful, and the guests either side turn and stare (a light moment). On \`letter\` a rolled scroll drops onto the table in front of him and unrolls; on \`quote\` its words are not shown (CRAFT rule 1), only the gold seal. On \`ouch\` he winces. On \`what\` the camera lifts to a cup of milk and a platter of bread side by side, the only props lit. ${CARDS}`,
  },
  {
    id: 'title',
    picture: `STORY: Title over the teal sky above the courtyard: The Path of the Just. Under it a thin gold path rises toward a small dawn light, the hill of \`path\` in miniature. No cup and no loaf: the title names no milk (owner, 2026-10-20). ${CARDS}`,
  },
  {
    id: 'milk',
    say: "{start}Start with the milk. {/} {peter}Peter writes, {newborn}“As newborn babes, desire the sincere milk of the word, that ye may {*}grow thereby.” {/} {sincere}Sincere here means pure, {mixed}with {*}nothing mixed in. {/} {word}So the milk is God's word, plain and unmixed. {/} {good}And milk is {*}good. {/} {need}A baby cannot do without it. {/} {began}Every one of us began there, {shame}and there is no shame in a cup of milk.",
    cite: [
      '1 Peter 2:2',
      'E. J. Waggoner, The Present Truth, August 17, 1893, 315',
      'E. J. Waggoner, The Medical Missionary, September 1904, 286',
    ],
    cast: ['idea-villagers', 'villager-child', 'villager-toddler', 'lead-feast'],
    picture: `IDEA: the parchment page, matched from the cup on the courtyard table in \`cold\`. A grown linen villager in his linen headcloth holds a small clay cup; on \`newborn\` a book opens beside it and a ribbon of white pours from its pages into the cup (\`word\`). On \`mixed\` a dropper of dark ink hovers over the cup and is waved away. On \`need\` the cup passes along a row of linen villagers of every height (the baby, the toddler, the child, the grown villager), each drinking in turn; on \`shame\` the series lead from \`cold\`, in his cream tunic and teal mantle, takes a cup too and smiles. ${CARDS}`,
  },
  {
    id: 'stones',
    say: '{which}So which truths are the milk? {/} {first}Hebrews calls them the first principles of the oracles of God. {/} {spoken}An oracle is a word God himself has spoken. {/} {plain}First principles are the plain {*}beginnings: {/} {child}simple enough for a child, {/} {build}and strong enough to build a whole life {*}on. {/} {foundation}Hebrews calls them a {*}foundation, {/} {christ}and Paul names that foundation: “other foundation can no man lay than that is laid, which is Jesus {*}Christ.” {//} {begins}That is where this series {*}begins.',
    cite: ['Hebrews 5:12', 'Hebrews 6:1', '1 Corinthians 3:11'],
    cast: ['villager-child'],
    picture: `IDEA: the parchment. On \`first\` a gold speech-ribbon unrolls from the top of the page. On \`plain\` a level line is drawn, and on \`child\` and \`build\` plain paper stones settle onto it one after another, each a simple cut-paper block with no icon, mark or letter (the first principles are not drawn as a list). On \`foundation\` the camera pulls back: a row of plain stones, a foundation with nothing yet built on it, the gold ribbon settled under them as their bed. On \`christ\` a warm gold light rises from inside the first stone and runs through the whole row until every stone glows: the foundation is Christ. On \`begins\` the linen child steps onto the first glowing stone. ${CARDS}`,
  },
  {
    id: 'bottle',
    say: "{but}But some of us never get past the {*}bottle. {/} {easy}We want it all made so easy we can swallow it without {*}chewing. {/} {think}And chewing is {*}thinking. {/} {strong}So we never grow strong. {/} {paul}Paul had a church like that, in Corinth. {/} {fed}“I have fed you with milk, and not with meat: for hitherto ye were not able to bear it.” {/} {slow}Why not? {/} Were they {*}slow? {/} {quarrel}No. {/} They were {*}quarrelling. {/} {more}Growing in God's word is never only knowing {*}more. {/} {like}It is growing more like {*}Christ.",
    cite: [
      'E. J. Waggoner, The Medical Missionary, September 1904, 286',
      '1 Corinthians 3:1–3',
      'Ellen G. White, Medical Ministry, 124',
    ],
    cast: ['lead-feast', 'paul'],
    picture: `STORY: on \`easy\` a quick comic beat on the parchment: the series lead from \`cold\` lifts a plate and tips the whole meal into his mouth unchewed. On \`paul\` push through into a Corinthian house at dusk (the film's short valley), a room of Corinthian believers in the dress of their own time (the crowd kit), in two knots, arguing, hands raised. Paul (his kept sheet: the balding crown, the grey-brown beard, the slate-blue travel cloak over his linen tunic; a face at a third of the frame) sits writing by a lamp; on \`fed\` close on his face as he writes, tired and fond. On \`quarrel\` the two knots turn their backs on each other. On \`like\` the lamp's light warms and one figure from each knot turns back and offers the other a hand. ${CARDS}`,
  },
  {
    id: 'teeth',
    say: '{milk}Feed a baby on milk, and she grows {teeth}{*}teeth. {/} {sign}And teeth are a sign {time}that it is time for solid {*}food. {/} {hebrews}Hebrews says strong meat belongs to those {use}who “by reason of use have their senses exercised to discern both good and evil.” {/} {practice}Use. {/} Practice. {/} {*}Chewing.',
    cite: ['E. J. Waggoner, The Medical Missionary, September 1904, 286', 'Hebrews 5:14'],
    cast: ['idea-villagers', 'lead-feast'],
    picture: `IDEA: the parchment. The linen baby grins on \`teeth\` and shows one small white tooth (a light, warm moment). On \`sign\` a little paper signpost springs up beside it pointing right, toward a loaf. On \`use\` the series lead from \`cold\`, in his cream tunic and teal mantle, sits at a small table and chews, thinking, a tiny lamp lit over his head; on \`practice\` a bowl of grain, a loaf and a plate come in, one per word. ${CARDS}`,
  },
  {
    id: 'rush',
    say: '{other}There is a mistake on the other side, too. {/} {skip}Some reach for the strong meat before they have learned the milk, {run}like a child who tries to run before he can {*}walk. {/} {peter}Peter warns of things in Scripture “hard to be understood, which they that are unlearned and unstable wrest.” {/} {twist}To wrest is to twist. {/} {own}The Bible explains its own words, {/} and we learn them one at a time. {/} {fill}Skip those first steps, and we fill its words with meanings of our own, {want}until it says {*}what we wanted. {/} {order}That is why it serves its truth in {*}order.',
    cite: [
      '2 Peter 3:16',
      'Ellen G. White, Education, 190',
      'Ellen G. White, The Great Controversy, 520',
      'Ellen G. White, The Bible Echo, August 26, 1895',
    ],
    cast: ['villager-child', 'villager-toddler'],
    picture: `IDEA: the parchment, the row of plain stones from \`stones\` along the bottom. On \`skip\` the linen child hops over the stones without touching them and reaches for a heaped platter at the top of the page. On \`run\` the linen toddler sets off running, tips forward and sits down hard, unhurt, and gets up (a light moment). On \`peter\` a page of writing appears; on \`twist\` one line of it is wrung like a wet cloth, its letters bending. On \`own\` a small book opens beside the page, each word on the page linked to its entry in the book by a thin gold thread. On \`fill\` the child who skipped writes over the empty entries in a colour of his own, and on \`want\` the page turns into a mirror and shows his face. On \`order\` the mirror clears to the page, and the child steps back down onto the first stone. ${CARDS}`,
  },
  {
    id: 'math',
    say: '{leave}So do we leave the milk {*}behind? {/} {go}Hebrews does say, leaving the principles, let us go on. {/} {but}But leaving them never means throwing them {*}away. {//} {student}Think of a student of mathematics. {/} {adds}First he learns to add and subtract and multiply. {/} {stay}He must not stay there forever. {/} {never}But he never stops {*}using them. {/} {hardest}His hardest problems are those first steps, {*}combined. {/} {meat}So it is with meat. {/} {nothing}Solid food leaves out nothing that was in the milk. {/} {more}It has all of it, and {*}more.',
    cite: [
      'Hebrews 6:1',
      'E. J. Waggoner, The Present Truth, January 31, 1895, 65',
      'E. J. Waggoner, The Medical Missionary, September 1904, 286',
    ],
    cast: ['villager-child', 'idea-villagers'],
    picture: `IDEA: dawn begins to come into the parchment. The linen child at a slate writes 1 + 1 with a stub of white chalk on \`adds\`; the sums multiply across the slate. On \`stay\` the child grows into the grown linen villager across three quick dissolves, the slate growing with it. On \`hardest\` one enormous sum fills the slate, and as the camera pushes in every term in it is one of the first small sums from \`adds\`, picked out in gold. On \`meat\` match cut: the slate's frame becomes the edge of a plate; on \`nothing\` the cup of milk from \`milk\` is set down on the plate beside the bread, not taken away; on \`more\` dishes fill in around it. ${CARDS}`,
  },
  {
    id: 'priest',
    say: '{what}So what is the meat? {/} {right}Hebrews serves it right after the milk. {/} {christ}It is Jesus, made “an high {*}priest for ever after the order of Melchisedec.” {//} {once}Not only what Christ did {*}once, {now}but what he is doing {*}now. {/} {other}The foundation is {*}Christ, {/} and the meat is Christ {*}too. {/} {him}Never something other: {*}more of him. {/} {light}Every deeper truth is read by one light, and that light streams from his {*}cross.',
    cite: [
      'Hebrews 5:10–11',
      'Hebrews 6:19–20',
      'Hebrews 8:1–2',
      'Ellen G. White, Gospel Workers, 315',
    ],
    cast: ['christ'],
    picture: `IDEA, then STORY. The parchment: the row of plain stones from \`stones\`, glowing gold as when Christ was named their foundation, no icon on any; on \`right\` a gold path runs on from the last stone up the page. On \`christ\` push through into STORY, a medium shot: the tall woven veil fills the frame, glowing gold from behind, and a figure in a priest's white robe and breastplate (Christ), seen from behind, centred and filling most of the frame's height, one hand parting the veil as he passes in through it (never a face of the Father, never a throne in this film). On \`once\` a small cardboard hill with an empty cross at dawn appears in a round panel; on \`now\` the panel slides to sit beside the veil, both lit. On \`light\` pull back to IDEA: a small gold cross at the centre of the page, its light widening in rings across the stones and up the path. ${CARDS}`,
  },
  {
    id: 'grain',
    say: '{how}So how does anyone grow? {/} {jesus}Jesus said the kingdom grows like {*}grain. {/} {sow}A man sows seed, {sleeps}and sleeps, and gets up, {knoweth}and it grows, he knows not {*}how. {/} {first}It comes up “first the blade, then the ear, after that the full corn in the ear.” {/} {watch}You cannot watch it happen. {/} {quiet}It is quiet, and it never {*}stops. {/} {blade}A blade is not a failed ear. {/} {stage}At every stage it can be {*}perfect, {still}and still it keeps {*}growing. {/} {isaiah}Isaiah says God teaches the same way, a line at a time, here a little, and there a little. {/} {bear}And Jesus gave them the word as much as they were able to {*}hear. {/} {simple}Simple truths, again and again, {bottom}and not one of them has a {*}bottom.',
    cite: [
      'Mark 4:26–28',
      'Ellen G. White, Education, 105–106',
      'Isaiah 28:9–10',
      'Mark 4:33',
      'E. J. Waggoner, The Present Truth, May 4, 1899, 277',
    ],
    cast: ['sower'],
    picture: `STORY: a cardboard field on a hillside, peach morning, 3–5 planes (the far hills, the field, a low stone wall near). On \`sow\` the sower (his kept sheet: the linen headcloth with its walnut band, the short green-olive mantle over his linen tunic; a face at a third of the frame) scatters seed and walks off; quick sun arcs on \`sleeps\`/\`knoweth\` (day, night, day). On \`first\` a single blade tears up out of the soil, then the green ear, then the full gold ear, one per phrase, each a paper layer folding up. On \`blade\` the camera returns to the young blade alone, upright and bright green, whole for what it is. On \`quiet\` the camera holds low by the stalk while a snail crosses the wall: nothing seems to move, but the stalk is visibly taller at the end of the hold. On \`isaiah\` the field dissolves to the parchment: one line of gold writing drawn, then another under it; on \`bear\` the next line waits, unwritten, until the one above it has filled with light; on \`bottom\` the camera drops through one line of the writing as if it were a well, and finds more light below. ${CARDS}`,
  },
  {
    id: 'eat',
    say: '{nobody}And nobody can eat your food for you. {/} {jer}The prophet Jeremiah said, {found}“Thy words were found, and I did eat them; and thy word was unto me the {joy}joy and rejoicing of mine heart.” {//} {body}Your body lives on the food you eat yourself. {/} {soul}And your soul lives on the {*}word you take in yourself.',
    cite: ['Jeremiah 15:16', 'Ellen G. White, The Signs of the Times, June 25, 1902'],
    cast: ['jeremiah', 'idea-villagers'],
    picture: `STORY: a small cardboard room in Jerusalem, warm lamplight; Jeremiah (his kept sheet: the linen headcloth with its olive band, the close beard, the olive mantle over his linen tunic; a scroll on his knees, a face at a third of the frame) reads, and on \`found\` his face lifts and softens; on \`joy\` he laughs out loud, alone. On \`body\` cut to the parchment: two grown linen villagers at one table, one eating, the other only watching; the eater glows faintly from the chest (\`soul\`), the watcher does not; the watcher picks up a spoon. ${CARDS}`,
  },
  {
    id: 'path',
    say: '{path}Here is the path ahead. {/} {just}“The path of the just is as the shining light, that shineth more and more unto the {*}perfect day.” {//} {stones}First, the {*}foundation. {/} {then}Then the meat Hebrews was eager to serve: {priest}a priest in heaven, {sanct}a sanctuary, {cov}a covenant, {rest}and a rest. {/} {last}And last, the strongest meat, {come}the things to {*}come. {/} {one}And all of it is {*}Christ.',
    cite: ['Proverbs 4:18', 'Hebrews 6:1–2', 'Hebrews 8:1–2, 6', 'Hebrews 4:9', '2 Peter 1:19'],
    picture: `IDEA: the series map. The parchment widens into a long hill: the row of plain stones at its foot (Tier One), glowing gold as in \`stones\`, the gold path climbing past a veil, a small tent sanctuary, two tablets in an ark and a resting figure under a tree (Tier Two), up to a city on the summit under a dawn sky (Tier Three). On \`just\` the dawn behind the summit brightens in three soft steps, more and more, never all at once. On \`one\` the gold cross's light from \`priest\` spreads until the whole hill lies inside it. ${CARDS}`,
  },
  {
    id: 'name',
    say: '{back}Back to the feast. {/} {sets}The young man sets down his bottle. {/} {bad}Not because milk was {*}bad. {/} {table}But because the table was set for him all along, {cup}and the milk is on it {*}still. {/} {taste}“O taste and see that the LORD is good.” {/} {leaving}Going from milk to meat never leaves Christ {*}behind. {/} {into}It is growing up {//3} into {*}him.',
    cite: [
      'Psalm 34:8',
      'Ephesians 4:13–15',
      'E. J. Waggoner, The Medical Missionary, September 1904, 286',
    ],
    cast: ['lead-feast', 'christ'],
    picture: `IDEA and STORY merged, the landing: the wedding courtyard from \`cold\` in the same layout and framing, now under the teal-to-yellow landing sky. The series lead stands where he stood; on \`sets\` he sets the baby's bottle down. On \`table\` the host's hand (the host is Christ, in His library dress, the plain white robe and the gold sash, at the head of the table) gestures to the place set for him: bread from the field in \`grain\`, and on \`cup\` the cup of milk from \`milk\` beside the plate. On \`taste\` he tastes, close on his face, delight. On \`leaving\` the plain stones of the foundation show for a breath as the courtyard's paving under the table. On \`into\` he stands taller beside the host; the gold cross's light from \`priest\` warms the whole courtyard. The held pause comes after \`into\`. ${CARDS}`,
  },
  {
    id: 'thesis',
    say: '{grow}{*}“Grow in grace, and in the knowledge of our Lord and Saviour Jesus Christ.”',
    lead: 1,
    min: 30,
    cite: ['2 Peter 3:18'],
    cast: ['lead-feast', 'christ'],
    picture: `STORY: The answer comes as the only text, the take's own first clause on the full-screen card: "Grow in grace", "Grow" large in gold, the answer to \`cold\`'s question. The music rises alone for about thirty seconds while the camera eases back and lifts over the courtyard, the young man still at the host's side at the set table (the host is Christ, in His library dress, the plain white robe and the gold sash, as in \`name\`). Past the courtyard wall, the field from \`grain\` moves in the wind, full corn, and the hill of \`path\` rises beyond it. ${CARDS}`,
  },
  {
    id: 'end',
    min: 28,
    picture: `STORY: the credits over the landing's last pull back, the wedding courtyard from above under the landing sky, the field and the hill beyond its wall, nothing breathing. The film's name and its sources roll up a torn paper strip at the left for about 22 s; then the strip goes and the courtyard holds clear for the end screens. ${CARDS}`,
  },
]);

/** A beat of the film, by its id. */
export type BeatId = (typeof script)[number]['id'];
