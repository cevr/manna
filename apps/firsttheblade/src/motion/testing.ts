/**
 * What the motion's tests hold the shaders against (`./sun.test.ts`,
 * `./shaders.test.ts`).
 */
import { TURN } from './sun.ts';

/**
 * The rays' turn `seconds` into the motion, in radians added to each ray's
 * angle (a positive turn swings the fan clockwise on the screen), as the
 * field's shader writes it from `TURN` (`./shaders.ts`). With a coarse
 * pointer the shader multiplies it by 0 (`u_turning`, from `raysTurn` in
 * `./query.ts`); under less motion no shader runs and the still shows.
 */
export const turnAt = (seconds: number) =>
  TURN.swing * Math.sin((seconds * 2 * Math.PI) / TURN.period);
