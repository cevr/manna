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
