// The series lead's papers, as his kept sheets paint them, sampled there
// (`turnaround.png`): each a lit colour, its shade a hue of its own past the
// crease where the sheet turns it (CRAFT rule 12, never the colour dimmed),
// and the light on its edge. His face, hair and ears are flat, as the sheet
// lays them; his tunic turns on its far side toward a warm lavender, his
// mantle toward a deeper blue-violet, his hands at their far edge toward
// rose (look.md). What a paper is and how it is checked are the house's
// (`@manna/film/style`). Pure.

import { type Crease, papers } from '@manna/film/style';

/** Where his papers turn: his garment sharply on its far side, his sleeves softly (each cut at its elbow, so a sharp turn would step there), his hands only at their far edge. */
const TURN = {
  robe: { at: 0.62, soft: 0.04, toward: 0.25 },
  sleeve: { at: 0.7, soft: 0.25 },
  hand: { at: 0.75, soft: 0.06 },
} as const satisfies Record<string, Crease>;

/** His papers, by what each is, each checked as the module loads (`papers`). */
export const PAPERS = papers({
  /** His skin: a warm peach, flat, as the sheet paints his face. */
  skin: { color: '#fdaf72', light: '#fec48e' },
  /** His ears: his skin a touch deeper, flat, with no rim (cut inside his head's outline). */
  ear: { color: '#f59d66', light: '#f59d66' },
  /** His hair: a warm mid brown, flat; its dark under the curls laid on it as tones. */
  hair: { color: '#71442e', light: '#71442e' },
  /** His cream tunic: its far side turned toward a warm lavender-beige. */
  tunic: { color: '#fde1bc', shade: '#e8c3ad', light: '#fff0d8', crease: TURN.robe },
  /** His cream sleeve (his right arm), in the light: the tunic's cream. */
  sleeve: { color: '#fbe0bb', shade: '#e8c3ad', light: '#fff0d8', crease: TURN.sleeve, rim: 0 },
  /** His cream sleeve where it crosses his cream tunic whole (seated, his hand at his chin): a step darker, as the sheet paints it there, so it parts from the tunic with no line. */
  sleeveAcross: {
    color: '#f0d4b8',
    shade: '#dcb7a3',
    light: '#fbe6cc',
    crease: TURN.sleeve,
    rim: 0,
  },
  /**
   * His cream sleeve raised clear of his side (poses-1): flat, a step darker
   * than his tunic, as the sheet paints it (#f1d1ad at 75,455), so it parts
   * from his tunic at his shoulder with no line; its shade laid on it as
   * tones (`RAISED_SLEEVE` in `lead.ts`).
   */
  sleeveRaised: { color: '#f1d2b0', light: '#fbe6c3', rim: 0 },
  /** His teal sleeve (his left arm, under the mantle): greener than the mantle, as the sheet paints it (#628989, hue 180), its far side toward blue-violet. */
  mantleSleeve: {
    color: '#608989',
    shade: '#435770',
    light: '#729c99',
    crease: TURN.sleeve,
    rim: 0,
  },
  /**
   * His bare feet in their sandals: his skin. The light core inside their
   * line is his soles' leather (`TONES.sole`): the house lays it half outside
   * the paper, past the tones clipped to it, so a skin core showed as a peach
   * line between his sole and his ink, where the sheet's sole runs into its
   * line (front x 40-75, rows 845-858).
   */
  foot: { color: '#f8a466', light: '#3b2418' },
  /** His hands: his skin, shaded only at the far edge, toward rose. */
  hand: { color: '#fdaf72', shade: '#e8906a', light: '#fec48e', crease: TURN.hand },
});

/** The colours laid on his papers as tones, as the sheet paints them. */
export const TONES = {
  /** The teal mantle across his tunic: the sheet's lit teal, hue 193°. */
  mantle: '#4f7a85',
  /** The mantle's far side, turned toward blue-violet. */
  mantleShade: '#456079',
  /** The cream sash, its knot and its ends. */
  sash: '#fee9c8',
  /** The sash's edge, where it turns from the light: a dusty rose. */
  sashShade: '#c9a39b',
  /** The shade his chin lays on his neck: his skin turned toward rose. */
  neck: '#e58a62',
  /** The deep shade his jaw lays on his neck right under his chin, the edge it closes over: his skin turned deep toward rose. */
  jaw: '#c8704e',
  /** The line his jaw lays under his chin where the sheet paints it (#7d482d at 138,388 on the turnaround). */
  chinLine: '#7d482f',
  /** That line where it lightens toward his ear (#9d5733 at 408,372; its mean L 110). */
  chinFade: '#a05b38',
  /** The lit rim of his ears, paler than his skin, toward the sheet's yellow there (#f9d695 to #f8da9b at 68,308). */
  earLight: '#fbd593',
  /** An ear turned to the light, its skin as lit as his face's but for its hollow (#fcbc84 at 1338,334; #fbbf86 at 1330,319, the three-quarter right's). */
  earLit: '#fcbd84',
  /** The hollow of an ear in shade: his skin turned toward rose (#e07a55 at 204,319 on the turnaround, its deepest). */
  earHollow: '#e07a53',
  /** An ear where it turns from the light (#f09261 at 212,319; #e79162 at 432,319). */
  earShade: '#ea9060',
  /** The rose shade under his jaw's line, on his head and his neck (#e07a50 at 392,390; #dc7651 by the ear). */
  jawShade: '#e27f55',
  /** The soft rose round that shade, below his ear and down his neck (#f3a374 at 414,352). */
  jawSoft: '#f2a06c',
  /** The line his jaw lays under his chin where the poses sheet paints it in a deep rose, not brown (#d47048 at 764,508; #d4744a at 482,398). */
  jawRose: '#d5714a',
  /** The dark brown band the sheet paints round a front ear as its contour (#4b2e1e at 81,314). */
  earBand: '#4b2e1e',
  /** His sandals' straps: a warm brown. */
  strap: '#5c3627',
  /** His sandals' soles: a dark brown, as heavy as the line. */
  sole: '#3b2418',
  /** The dark of his hair under its curls, turned 12° from his hair toward rose. */
  hairShade: '#58302a',
  /** The light on his curls. */
  hairLight: '#7b4530',
  /** The edge of his cream sleeve where it lies on his tunic: its shade, turned toward rose. */
  creamEdge: '#dcb5a0',
  /** The edge of his teal sleeve where it lies on his mantle: toward blue-violet. */
  tealEdge: '#4a6479',
  /** The underside of his raised sleeve, its upper arm and elbow: the sheet's shade there, toward rose (#e9c6a6 at 120,497). */
  raisedUnder: '#e9c6a6',
  /** The fold his raised sleeve makes at its elbow, down from the notch: the sheet's (#d6b29b at 108,455). */
  raisedFold: '#d6b29b',
  /** The edge of his cream sleeve where it crosses his cream tunic whole (seated, his hand at his chin): deeper, the one thing that parts them. */
  creamAcross: '#c79c8b',
} as const satisfies Record<string, `#${string}`>;
