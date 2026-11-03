import { figuresFile } from '@manna/film/style';
import { christ, christFront } from './christ-rig.ts';
import { farmer } from './farmer-rig.ts';
import { HAND_OUT_STEPS } from './hand-rig.ts';
import { judge } from './judge-rig.ts';
import { lead } from './lead-rig.ts';
import { prosecutor } from './prosecutor-rig.ts';

const WEIGHT = 1.45;

const BAKED = false;

export const FIGURES = figuresFile({
  weight: WEIGHT,
  baked: BAKED,
  boards: {
    lead: { name: 'Lead', seed: 2301, stage: 0, figure: lead, hands: 'leadHand' },
    leadHand: { name: 'LeadHand', seed: 2302, stage: 400, hand: lead.hands.paper },
    judge: { name: 'Judge', seed: 2303, stage: 520, figure: judge, hands: 'skinHand' },
    prosecutor: {
      name: 'Prosecutor',
      seed: 2304,
      stage: 1020,
      figure: prosecutor,
      hands: 'skinHand',
    },
    skinHand: { name: 'SkinHand', seed: 2305, stage: 1420, hand: judge.hands.paper },
    christ: { name: 'Christ', seed: 2306, stage: 1540, figure: christ, hands: 'christHand' },
    christHand: { name: 'ChristHand', seed: 2307, stage: 1860, hand: christ.hands.paper },
    farmer: { name: 'Farmer', seed: 2308, stage: 1960, figure: farmer, hands: 'farmerHand' },
    farmerHand: { name: 'FarmerHand', seed: 2309, stage: 2280, hand: farmer.hands.paper },
    christFront: {
      name: 'ChristFront',
      seed: 2310,
      stage: 2400,
      figure: christFront,
      hands: 'christHand',
    },
    christHandOut1: {
      name: 'ChristHandOut1',
      seed: 2311,
      stage: 2720,
      hand: christ.hands.paper,
      size: HAND_OUT_STEPS[0],
    },
    christHandOut2: {
      name: 'ChristHandOut2',
      seed: 2312,
      stage: 2800,
      hand: christ.hands.paper,
      size: HAND_OUT_STEPS[1],
    },
    christHandOut3: {
      name: 'ChristHandOut3',
      seed: 2313,
      stage: 2900,
      hand: christ.hands.paper,
      size: HAND_OUT_STEPS[2],
    },
    christHandOut4: {
      name: 'ChristHandOut4',
      seed: 2314,
      stage: 3020,
      hand: christ.hands.paper,
      size: HAND_OUT_STEPS[3],
    },
  },
});

export const ARTBOARDS = FIGURES.artboards;
