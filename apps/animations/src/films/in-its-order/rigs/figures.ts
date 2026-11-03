import { figuresFile } from '@manna/film/style';
import * as LEAD from '../../../library/cast/lead-feast/rig/lead.ts';
import { PAPERS as LEAD_FEAST } from '../../../library/cast/lead-feast/rig/papers.ts';

const WEIGHT = 0.95;

const BAKED = false;

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

export const ARTBOARDS = FIGURES.artboards;
