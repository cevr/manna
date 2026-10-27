// In Its Order's Rive project: every figure rig of the film in one file
// (`figures.riv`, built by `build.ts`), laid by one table (`FIGURES`), which
// the house prints (`@manna/film/style` `figuresRml`). Each artboard has its
// own view model, its name, the seed its paper's boil crawls by and its place
// on the stage. It draws a composed figure, one a view of a member's kept
// sheets (the series lead's compositions are the library's,
// `src/library/cast/lead-feast/rig/`), with the artboard its hands are drawn
// on, or a circle hand. The figures' ink is the house look's line, as heavy
// against a head as the kept sheets draw it (`WEIGHT`), its widths bound to
// the shot (`BAKED` false: thinner in a close shot, as RBF's). Pure.

import { figuresFile } from '@manna/film/style';
import * as LEAD from '../../../library/cast/lead-feast/rig/lead.ts';
import { PAPERS as LEAD_FEAST } from '../../../library/cast/lead-feast/rig/papers.ts';

/**
 * The figures' ink against the house study's: the kept sheets line a head
 * about 6.5 px of its 199 (0.033), the study's line 0.035 of a head.
 */
const WEIGHT = 0.95;

/** Whether the ink's widths are written into the print, bound to no `ink` number: they are bound, so a close shot thins the line. */
const BAKED = false;

/** IIO's figures file: each artboard by its key, in the order the file draws them, left to right on the stage. */
export const FIGURES = figuresFile({
  weight: WEIGHT,
  baked: BAKED,
  boards: {
    leadFeastFront: {
      name: 'LeadFeastFront',
      seed: 3101,
      stage: 0,
      figure: LEAD.leadFeastFront.figure,
      hands: 'leadFeastHand',
    },
    // The series lead's hands, every view's: one artboard, of his hands' paper.
    leadFeastHand: { name: 'LeadFeastHand', seed: 3102, stage: 400, hand: LEAD_FEAST.hand },
    leadFeastThreeQuarterLeft: {
      name: 'LeadFeastThreeQuarterLeft',
      seed: 3103,
      stage: 520,
      figure: LEAD.leadFeastThreeQuarterLeft.figure,
      hands: 'leadFeastHand',
    },
    leadFeastProfileLeft: {
      name: 'LeadFeastProfileLeft',
      seed: 3104,
      stage: 1040,
      figure: LEAD.leadFeastProfileLeft.figure,
      hands: 'leadFeastHand',
    },
    leadFeastBack: {
      name: 'LeadFeastBack',
      seed: 3105,
      stage: 1560,
      figure: LEAD.leadFeastBack.figure,
      hands: 'leadFeastHand',
    },
    leadFeastProfileRight: {
      name: 'LeadFeastProfileRight',
      seed: 3106,
      stage: 2080,
      figure: LEAD.leadFeastProfileRight.figure,
      hands: 'leadFeastHand',
    },
    leadFeastThreeQuarterRight: {
      name: 'LeadFeastThreeQuarterRight',
      seed: 3107,
      stage: 2600,
      figure: LEAD.leadFeastThreeQuarterRight.figure,
      hands: 'leadFeastHand',
    },
    leadFeastSeated: {
      name: 'LeadFeastSeated',
      seed: 3108,
      stage: 3120,
      figure: LEAD.leadFeastSeated.figure,
      hands: 'leadFeastHand',
    },
    leadFeastRaised: {
      name: 'LeadFeastRaised',
      seed: 3109,
      stage: 3640,
      figure: LEAD.leadFeastRaised.figure,
      hands: 'leadFeastHand',
    },
    leadFeastReaching: {
      name: 'LeadFeastReaching',
      seed: 3110,
      stage: 4160,
      figure: LEAD.leadFeastReaching.figure,
      hands: 'leadFeastHand',
    },
    leadFeastDrinking: {
      name: 'LeadFeastDrinking',
      seed: 3111,
      stage: 4680,
      figure: LEAD.leadFeastDrinking.figure,
      hands: 'leadFeastHand',
    },
  },
});

/** The artboards, by name: what a prop asks the file for. */
export const ARTBOARDS = FIGURES.artboards;
