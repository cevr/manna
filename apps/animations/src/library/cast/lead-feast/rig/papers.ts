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
  ear: { color: '#f5a068', light: '#f5a068' },
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
  /** His teal sleeve (his left arm, under the mantle): the mantle's teal, its far side toward blue-violet. */
  mantleSleeve: {
    color: '#5d8790',
    shade: '#435770',
    light: '#6f979c',
    crease: TURN.sleeve,
    rim: 0,
  },
  /** His bare feet in their sandals: his skin. */
  foot: { color: '#f8a466', light: '#f8a466' },
  /** His hands: his skin, shaded only at the far edge, toward rose. */
  hand: { color: '#fdaf72', shade: '#e8906a', light: '#fec48e', crease: TURN.hand },
});

/** The colours laid on his papers as tones, as the sheet paints them. */
export const TONES = {
  /** The teal mantle across his tunic. */
  mantle: '#4f7385',
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
  /** His sandals' straps: a warm brown. */
  strap: '#5c3627',
  /** His sandals' soles: a dark brown, as heavy as the line. */
  sole: '#3b2418',
  /** The dark of his hair under its curls. */
  hairShade: '#5d3626',
  /** The light on his curls. */
  hairLight: '#7b4530',
  /** The edge of his cream sleeve where it lies on his tunic: its shade, turned toward rose. */
  creamEdge: '#dcb5a0',
  /** The edge of his teal sleeve where it lies on his mantle: toward blue-violet. */
  tealEdge: '#4a6479',
  /** The edge of his cream sleeve where it crosses his cream tunic whole (seated, his hand at his chin): deeper, the one thing that parts them. */
  creamAcross: '#c79c8b',
} as const satisfies Record<string, `#${string}`>;
