// The words okra repaints a part sheet's hidden paint by: the fragments a
// member's `HIDDEN` prompts are written from (read by `film concept parts`).
// A fragment that names a figure's clothes takes them from the member's data.
// Pure.

/** The okra repaint's opening: the picture and what was cut away. */
export const CUT_AWAY =
  'Edit this picture. It is a cut-paper character on cream paper; the flat magenta areas are where';

/** Where a body's sides run under the arms: out to the shoulders and the garment below (`lower`), not in at the sleeves' inner edges, with `cloth` filling them. */
export const sides = (wear: { readonly lower: string; readonly cloth: string }) =>
  `Each side of his body runs straight down from the outer end of his shoulder to the outer edge of his ${wear.lower} below, so his body under the arms is as wide as his shoulders and his ${wear.lower}, and ${wear.cloth} fill everything inside that line with the same soft shade and fine paper grain the sheet paints beside each arm.`;

/** The shade the arms cast on the body stays, and runs on under them. */
export const SHADE =
  'Keep the soft shade each arm casts on his body beside it exactly as it is, and carry that same shade on under where the arm was.';

/** The paper grain the sheet shows on what lies under the arms (`what`), carried into the paint there. */
export const grain = (what: string) =>
  `Paint ${what} with the same fine paper grain the sheet shows on them beside the arms: a fine, even speckle through every flat area of colour, never smooth flat colour.`;

/** The repaint's close: nothing else moves. */
export const KEEP_REST =
  'Keep every other pixel exactly as it is: the same size, position and framing, and every part that is not magenta unchanged.';
