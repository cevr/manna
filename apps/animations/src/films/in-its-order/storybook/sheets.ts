import type { SheetDecl } from '../../../library/storybook/scene.ts';

/** The film's sentence every brief and image prompt carries (CRAFT rule 1). */
export const CARDS_RULE =
  "The narration's words appear only as full-screen cards: nothing in the picture carries lettering.";

/** What every sheet of the film asks beyond the house rules: the cards sentence, the props, and faces turned by pose words alone. */
const FILM_RULES = [
  CARDS_RULE,
  'A held prop is named in the pose words and is the same prop, the same size and the same colours in every figure that holds it. No prop carries text, letters, numbers or marks.',
  "Where a pose turns the head, it turns exactly as the pose words say, toward the viewer's left or right as written, whatever way the description or the reference images face.",
] as const;

/** The rules of a seated sheet: the seat in one named paint, and the whole figure drawn, soles included, the table left out. */
const seated = (seat: string): ReadonlyArray<string> => [
  ...FILM_RULES,
  `The seat is one low plain wooden stool painted exactly ${seat}, flat, with no shade of its own.`,
  'Each seated figure is drawn whole, from the top of the head to the soles of both feet resting flat on the ground line: no table, bench or anything else in front of the figure hides any part of it.',
];

/** The rules of a standing sheet. */
const standing: ReadonlyArray<string> = FILM_RULES;

/** The pose words of a blink: the figure exactly as `of`, the eyes closed. */
const blink = (of: string): string =>
  `exactly as the ${of} figure, every line the same, the eyes closed in a blink: each eye a short downward-curved ink line`;

/** The lead's baby's bottle's paint, his table sheet's prop, as his sheet draws it (asked as `BOTTLE` names it; a measured paint): a butter cream apart from his tunic's and his sash's creams (a bottle asked in a costume paint snapped to his sash and read as its top, critique 1, items 6 and 7). Its teat takes his skin: the tan drawn for it lies in his skin's own drawn grain, so a teat paint mottled his face and hands. */
const BOTTLE_PROPS = [{ name: 'bottle', base: '#fcebb4', role: 'prop' }] as const;

/** The lead's baby's bottle, as every key that holds it names it: one cream, its teat one tan, each its own paint. */
const BOTTLE =
  "a small plain baby's bottle painted exactly butter cream #f3e3a0, flat in that one colour, with a short rounded teat painted exactly tan #b98a5e";

/** The small clay cup, in the member's footwear brown, milk in its pale paint inside. */
const cup = (clay: string, milk: string): string =>
  `a small plain clay cup painted exactly ${clay}, milk ${milk} showing at its rim`;

/** The lead's cup, seen from the side so its rim hides the milk: one paint, his sandals' brown, which no cloth of his is near (his sash's cream read as a sash where milk showed). */
const LEAD_CUP =
  'a small plain clay cup painted exactly #7a5236, seen from the side, its rim hiding the milk';
const VILLAGER_CUP = cup('#7a5236', '#d9cdb8');

/** What the lead's seated sheets ask beyond `seated`: his sash's pale cream on the sash alone, since his tunic's cream is near it and anything else in it read as the sash's top. */
const SASH_ALONE =
  "The sash's pale cream #eadcc2 is on the sash alone: the tunic, its neckline and anything held, the bottle too, are the tunic's warm cream #f2d8b7 or another paint, never the sash's.";

/** What a seated sheet whose skirt reaches the feet asks beyond `seated`: one hem line in every figure. */
const HEMMED =
  'The robe or dress ends in one level hem at the same height in every figure, just above the ankles, the sandals and ankles showing below it, and nothing of the robe hangs between the feet.';

/** The lead at the table with the bottle set down (critique 1, item 6): the first figure's head and body unchanged, only the eyes lowered to the table before him. */
const TABLE_DOWN =
  'seated on the stool exactly as in the first figure, the head held exactly as in the first figure, the same hair, ears, face and size, only the eyes lowered: the upper lids half down and the eyes looking down at the table in front of him, both round hands resting empty on the knees in their sleeves, no bottle, a small sheepish mouth';

/** What the lead's table sheet asks of his sash and his bottle: the sash's pale cream on the sash alone, the bottle its own cream. */
const TABLE_SASH =
  "The sash's pale cream #eadcc2 is on the sash alone, and the tunic and its neckline are the tunic's warm cream #f2d8b7: the bottle is its own butter cream #f3e3a0, never the tunic's or the sash's.";

/** What the lead's table sheet asks of his head in every figure (critique 1, items 6 and 16): the front reference's head, so a key swap changes only the face. */
const TABLE_HEAD =
  "Every figure's head is drawn exactly as in the front reference image and as in the first figure, at the same size: the hair his warm brown #6c432b, its plum shade #57384a only in the small undersides of a few curls, no flecks of it at the hairline, jaw or collar; the ears and the neck his skin #f2b27c; the round hands his skin #f2b27c, never cream. Only the eyes, the mouth and the held arm change from figure to figure.";

/** The lead at the feast table (shots 2, 3 and the title): seated, the bottle up, then set down on the table (a plate), his eyes on it. */
const leadTable: SheetDecl = {
  member: 'lead-feast',
  id: 'iio-table',
  keys: ['front', 'frontBlink', 'lift', 'bottle', 'down', 'downBlink'],
  poses: {
    front:
      'seated on the low stool facing the viewer square, both round hands resting on the knees in their sleeves, head and eyes to the viewer, a calm short smile line',
    frontBlink: `seated ${blink('first')}`,
    lift: `seated on the stool exactly as in the first figure, the left hand (on the viewer's right) lifted in its sleeve to the chest holding ${BOTTLE} upright, the other hand on the knee, a hopeful smile`,
    bottle: `seated on the stool exactly as in the first figure, the left hand (on the viewer's right) raised in its sleeve beside the head holding up ${BOTTLE}, hopeful, eyes to the viewer, the other hand on the knee`,
    down: TABLE_DOWN,
    downBlink: `seated ${blink('fifth')}`,
  },
  refs: ['front', 'threeQuarterRight', 'poses-1'],
  rules: [...seated('#7a5236'), TABLE_SASH, TABLE_HEAD],
  props: BOTTLE_PROPS,
};

/** His table sheet, as a reference of his close: its fifth figure is the man the shot before the card leaves on screen (a path from his views folder, since a reference is named from there). */
const TABLE_SHEET_REF = '../../shot-sheets/iio-table/sheet';

/** What the lead's close asks of his head and dress beyond `seated` (critique 2, finding 1: a close drawn from his front reference opened his eyes, clumped plum in his fringe, lengthened his face, widened his sash and drew lavender sickles on his robe): the man his table sheet's fifth figure draws, only larger. */
const CLOSE_AS_TABLE =
  "The first reference image is his table sheet: every figure here is exactly the man its fifth figure draws, only larger, the same in every line: the same head and face (a little longer than wide, as there, never longer), the same ears and neck in his skin #f2b27c; the same short curls in his warm brown #6c432b, with no darker clumps or patches in them, his plum shade #57384a at most a thin line under a curl or two; the same narrow sash and small knot in the sash's pale cream #eadcc2; the robe in its flat paints as there, its folds a few ink lines only, with no lavender, violet or grey marks, wedges or shading on the folds, the chest or the sleeves; the sandals' brown #7a5236 on the sandals and the stool alone.";

/** The sash's light as his kept front view draws it (a measured paint), a paint his close alone adds: the close draws its sash so near its tunic's cream that the split gave the sash's paint one pixel and the proportions read no sash top; this light, 2.5 from the sash's base, gathers the drawn sash. */
const CLOSE_SASH = [{ name: 'sash light', base: '#f2dec8', role: 'sash' }] as const;

/** The lead close (`cold-ouch`): three keys, so a close stays under the enlargement cap. His `down` is his table sheet's `down`, lids half down on the scroll, as the shot before the card leaves him. */
const leadClose: SheetDecl = {
  member: 'lead-feast',
  id: 'iio-close',
  keys: ['down', 'downBlink', 'wince'],
  poses: {
    down: "seated on the low stool facing the viewer, the head held exactly as in the table sheet's fifth figure, the upper lids half down and the eyes looking down at the table in front of him, both round hands in their sleeves resting empty on the knees, no bottle, a small sheepish mouth",
    downBlink: `seated ${blink('first')}`,
    wince:
      'seated on the stool exactly as in the first figure, both hands resting empty on the knees, the head held the same, wincing: the eyes squeezed shut as two short tight ink lines, the brows drawn together and tilted up at their inner ends, the mouth a short wavy line',
  },
  refs: [TABLE_SHEET_REF, 'front'],
  rules: [...seated('#7a5236'), SASH_ALONE, CLOSE_AS_TABLE],
  props: CLOSE_SASH,
};

/** The lead on the parchment (`milk-row`): standing, taking a cup. */
const leadMilk: SheetDecl = {
  member: 'lead-feast',
  id: 'iio-milk',
  keys: ['front', 'frontBlink', 'lift', 'cup'],
  poses: {
    front:
      'standing facing the viewer square, both arms hanging in their sleeves at the sides, a calm short smile line',
    frontBlink: `standing ${blink('first')}`,
    lift: `standing facing the viewer, the left hand (on the viewer's right) lifted in its sleeve to the front of the waist holding ${LEAD_CUP}, the other arm hanging, a glad smile`,
    cup: `standing facing the viewer, both round hands in their sleeves holding ${LEAD_CUP} up before the chest, a broad warm closed smile, the cheeks lifted`,
  },
  refs: ['front', 'poses-1'],
  rules: standing,
};

/** The mother with her baby (`cold-baby` to the title): seated, the cup at the baby's lips. */
const motherBaby: SheetDecl = {
  member: 'feast-mother',
  id: 'iio-baby',
  keys: ['cup', 'sip', 'cupBlink'],
  poses: {
    cup: `seated on the low stool facing the viewer, the baby in her left arm, her right hand in its sleeve holding ${cup('#c9877e', '#eadcc2')} to the baby's lips, her head tilted toward the baby, a tender smile; her brown hair under the veil and her sandals painted exactly #c9877e`,
    sip: "seated exactly as in the first figure, the cup held the same at the baby's lips, the baby drinking with its eyes shut as two glad upward-curved ink lines and its cheeks lifted, the mother smiling",
    cupBlink: `seated ${blink('first')}, the mother's eyes closed and the baby's open`,
  },
  refs: ['poses-1', 'poses-2', 'front'],
  rules: seated('#c9877e'),
};

/** A guest beside the lead at the table, turning toward him at picture `side` (the man at his left turns right). */
const guest = (member: string, side: 'right' | 'left', seat: string): SheetDecl => ({
  member,
  id: 'iio-table',
  keys: ['neutral', 'neutralBlink', 'stare', 'smile'],
  poses: {
    neutral:
      'seated on the low stool facing the viewer square, both round hands resting on the knees, head and eyes to the viewer, a calm short smile line',
    neutralBlink: `seated ${blink('first')}`,
    stare: `seated on the stool exactly as in the first figure, the head a quarter turned toward the viewer's ${side}, staring at someone at the picture's ${side}: the eyes, nose and mouth shifted toward the picture's ${side}, the eyes wide, the brows raised, the mouth a small flat line`,
    smile: `seated on the stool exactly as in the first figure, the head a quarter turned toward the viewer's ${side} as in the third figure, a broad warm closed smile, the mouth shut, the cheeks lifted`,
  },
  refs: ['poses-1', 'poses-2', 'poses-3'],
  rules: seated(seat),
});

/**
 * The guest woman's take-5 sheet (`feast-courtyard`, the woman the owner chose
 * as the guest), cast as drawn: its pose words as its record holds them, no
 * rules of the film's, since it was drawn before them (`storybook draw`
 * refuses an id drawn already). No shot draws it: it is her table sheet's
 * first reference, and the sheet the film's checks hold her others to.
 */
const guestWoman: SheetDecl = {
  member: 'feast-guest-woman',
  id: 'feast-courtyard',
  keys: ['neutral', 'smile', 'turn', 'neutralBlink'],
  poses: {
    neutral:
      'seated on the low wooden stool facing the viewer square, both round hands resting on the knees, head and eyes to the viewer, a calm short smile line',
    smile:
      'seated on the stool exactly as in the first figure, head and eyes still to the viewer, a broad warm closed smile, the mouth shut, the cheeks lifted',
    turn: "seated on the stool exactly as in the first figure, the head a quarter turned toward the viewer's left (whatever side the description names), looking at someone who stands there, the same broad warm closed smile, the mouth shut",
    neutralBlink:
      'seated on the stool exactly as in the first figure, every line the same, the eyes closed in a blink: each eye a short downward-curved ink line',
  },
  refs: ['poses-1', 'poses-2', 'poses-3'],
  rules: [],
};

/** Her take-5 sheet, as a reference of her table sheet (a path from her views folder, since a reference is named from there). */
const COURTYARD_SHEET_REF = '../../shot-sheets/feast-courtyard/sheet';

/** What the guest woman's table sheet asks beyond `seated` (owner, critique 2: she stares as the man does): the woman her take-5 sheet draws, the one the owner chose, the same in every line but the head's turn and the face. */
const WOMAN_AS_COURTYARD =
  "The first reference image is her kept feast sheet: every figure here is exactly the woman its first figure draws, at the same size, the same in every line: the same head and face (an upright oval a little taller than wide, ears showing, the same eyes, brows and mouth marks), her skin #fdbd83; the same olive mantle #80774c, its shaded side #686141, drawn over her head as a veil framing the face and open down the front; a little of her dark-brown hair #6e3f1f parted in the middle at the brow; the same cream robe #fdf4e2, its shaded side #e7d7ef, and plain flat sash; the same round hands resting on the knees; the same brown sandals #553019 on bare feet. Only the head's turn, the eyes, the brows and the mouth change from figure to figure.";

/** The guest woman at the table (`cold-table` to `cold-ouch`), drawn from her take-5 sheet so she is the woman the owner chose: the man's four keys, her stare turned toward the lead at the picture's left. */
const guestWomanTable: SheetDecl = {
  ...guest('feast-guest-woman', 'left', '#8e4c27'),
  refs: [COURTYARD_SHEET_REF, 'poses-1'],
  rules: [...seated('#8e4c27'), HEMMED, WOMAN_AS_COURTYARD],
};

/** One dressed diner at the long table, the n-th person of `filler-dressed`, turning toward a neighbour at picture `side` to talk. */
const diner = (n: 1 | 2 | 3 | 4, side: 'right' | 'left'): SheetDecl => ({
  member: 'filler-dressed',
  id: `iio-diner-${n}`,
  keys: ['neutral', 'neutralBlink', 'talk'],
  poses: {
    neutral:
      'seated on the low stool facing the viewer square, both round hands resting on the knees, head and eyes to the viewer, a calm short smile line',
    neutralBlink: `seated ${blink('first')}`,
    talk: `seated on the stool exactly as in the first figure, the head a quarter turned toward the viewer's ${side}, talking to a neighbour at the picture's ${side}, the mouth open in a glad smile`,
  },
  refs: [`poses-${n}`],
  rules: [
    ...seated('#6b4630'),
    `Draw only the one person of the reference image: the ${['', 'first', 'second', 'third', 'fourth'][n]} person the description names, in exactly that person's headcloth or veil, mantle, beard and robe; the other three people of the description are not on this sheet. Their sandals painted exactly #6b4630.`,
    ...[HEMMED].filter(() => n === 4),
  ],
  props: [DINER_MOUTH].filter(() => n === 3),
});

/** The older man's open talking mouth, as his sheet draws it (a measured paint): the diners' palette has no red, so his mouth snapped toward the walnut mantle and he could not talk (critique 1, item 17). */
const DINER_MOUTH = { name: 'open mouth', base: '#b6502e', role: 'prop' } as const;

/** The grown villager on the parchment (`milk-cup` to `milk-row`): five keys, the cup in every one. */
const villagerMilk: SheetDecl = {
  member: 'idea-villagers',
  id: 'iio-milk',
  keys: ['cup', 'cupBlink', 'look', 'wave', 'drink'],
  poses: {
    cup: `the grown villager standing facing the viewer, both round hands in their sleeves holding ${VILLAGER_CUP} before the waist, smiling`,
    cupBlink: `standing ${blink('first')}`,
    look: `standing exactly as in the first figure, the cup held the same, the head a quarter turned toward the viewer's right, looking at something beside him at the picture's right, curious, the brows raised`,
    wave: `standing facing the viewer, the cup held in the right hand (on the viewer's left) before the waist, the left hand (on the viewer's right) raised in its sleeve beside the shoulder, the round hand turned out, waving something away, a gentle smiling no`,
    drink:
      'standing facing the viewer, both round hands in their sleeves holding the same cup up to the lips, drinking, the eyes shut as two glad upward-curved ink lines',
  },
  refs: ['poses-3', 'poses-6'],
  rules: [
    ...standing,
    'Draw only the grown villager of the description (the bearded man in the linen headcloth): no child, toddler or baby on this sheet.',
  ],
};

/** The baby of the villagers' row (`milk-row`), sitting with the cup in both hands. */
const babyMilk: SheetDecl = {
  member: 'idea-villagers',
  id: 'iio-milk-baby',
  keys: ['sit', 'sitBlink', 'drink'],
  poses: {
    sit: `the baby sitting on the ground facing the viewer, legs out in front, both round hands in their sleeves holding ${VILLAGER_CUP} in the lap, a small glad smile`,
    sitBlink: `sitting ${blink('first')}`,
    drink:
      "sitting exactly as in the first figure, both round hands lifting the same cup to one corner of the mouth at the picture's left, drinking, the middle of the face, the chin and the neck clear of the cup, the eyes shut as two glad upward-curved ink lines",
  },
  refs: ['poses-4'],
  rules: [
    ...standing,
    'Draw only the baby of the description (the small tuft of hair, the round head): no grown villager, child or toddler on this sheet. The baby sits on the ground line, its soles on it.',
  ],
};

/** A small villager of the row standing with the cup in both hands, drinking in turn. */
const small = (member: string, refs: ReadonlyArray<string>, who: string): SheetDecl => ({
  member,
  id: 'iio-milk',
  keys: ['hold', 'holdBlink', 'drink'],
  poses: {
    hold: `${who} standing facing the viewer, both round hands in their sleeves holding ${VILLAGER_CUP} before the waist, a small glad smile`,
    holdBlink: `standing ${blink('first')}`,
    drink:
      'standing exactly as in the first figure, both round hands lifting the same cup to the lips, drinking, the eyes shut as two glad upward-curved ink lines',
  },
  refs,
  rules: standing,
});

/** Every shot sheet act 1 draws, in the order they are drawn. */
export const SHEETS: ReadonlyArray<SheetDecl> = [
  leadTable,
  leadClose,
  leadMilk,
  motherBaby,
  guest('feast-guest-man', 'right', '#692e18'),
  guestWoman,
  guestWomanTable,
  diner(1, 'right'),
  diner(2, 'left'),
  diner(3, 'right'),
  diner(4, 'left'),
  villagerMilk,
  babyMilk,
  small('villager-toddler', ['poses-1', 'poses-2'], 'the toddler'),
  small('villager-child', ['poses-5'], 'the child'),
];

/** A declared sheet by member and id. */
export const sheetNamed = (member: string, id: string) =>
  SHEETS.find((s) => s.member === member && s.id === id);
