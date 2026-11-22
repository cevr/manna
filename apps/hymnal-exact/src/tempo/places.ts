/**
 * The tempo dial's measures, in points (a letter spacing where named), as
 * the current app's `DialView.tsx` and `DialPanel.tsx` draw a row dial on
 * its panel: a stop (`detent`), the panel's padding, the name column and
 * its inset and spacing, and the notch. `src/tempo/tempo.test.ts` reads
 * each from the current app's files.
 */
export const TEMPO_PLACES = {
  detent: 52,
  pad: 8,
  title: 58,
  titlePad: 16,
  titleSpacing: 1.1,
  notch: 9,
  notchWide: 2,
};
