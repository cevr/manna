export { EASE, type Expression, acted } from './face.ts';
export { figure } from './figure.ts';
export { figureOverrides, figuresFile, figuresRml, lockedPrints } from './figures-file.ts';
export { RIM, keyLight, parchment, peoplePaper, shading } from './house.ts';
export { citedBy } from './override.ts';
export { type Crease, papers, rampedPaper } from './paper.ts';
export { Arm, JointedArm, armHand, armReach } from './parts/arm.ts';
export { Beard } from './parts/beard.ts';
export { Robe } from './parts/body.ts';
export { Ear } from './parts/ear.ts';
export { Sandals, Shoes, Trousers } from './parts/feet.ts';
export { Hair } from './parts/hair.ts';
export { Hands } from './parts/hands.ts';
export { Headcloth } from './parts/headcloth.ts';
export { Head } from './parts/head.ts';
export { KitA, tracedKit } from './parts/kit.ts';
export { OpenMouth } from './parts/mouth.ts';
export { Bands } from './parts/over.ts';
export { Stance } from './parts/stance.ts';
export { GivenRobe, Stain } from './parts/states.ts';
export { Stature } from './parts/stature.ts';
export {
  FIGURE_TIMELINES,
  type FigureTimeline,
  HAND_ART,
  HAND_TIMELINES,
  type HandTimeline,
} from './rig/draw.ts';
export { type Pt, boilTime, boxOf, creaseOf, ellipse, reachAbout, smooth } from './rig/parts.ts';
export { roundedPolygon, shifted } from './rig/shapes.ts';
export {
  type TracedFigureSpec,
  type TracedKnob,
  type TracedTone,
  tracedFigure,
  tracedHands,
} from './traced.ts';
