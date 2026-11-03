export const CUT_AWAY =
  'Edit this picture. It is a cut-paper character on cream paper; the flat magenta areas are where';

export type Pronoun = 'his' | 'her' | 'their';

export const sides = (wear: {
  readonly pronoun: Pronoun;
  readonly lower: string;
  readonly cloth: string;
}) => {
  const p = wear.pronoun;
  return `Each side of ${p} body runs straight down from the outer end of ${p} shoulder to the outer edge of ${p} ${wear.lower} below, so ${p} body under the arms is as wide as ${p} shoulders and ${p} ${wear.lower}, and ${wear.cloth} fill everything inside that line with the same soft shade and fine paper grain the sheet paints beside each arm.`;
};

export const shade = (pronoun: Pronoun) =>
  `Keep the soft shade each arm casts on ${pronoun} body beside it exactly as it is, and carry that same shade on under where the arm was.`;

export const grain = (what: string) =>
  `Paint ${what} with the same fine paper grain the sheet shows on them beside the arms: a fine, even speckle through every flat area of colour, never smooth flat colour.`;

export const KEEP_REST =
  'Keep every other pixel exactly as it is: the same size, position and framing, and every part that is not magenta unchanged.';
