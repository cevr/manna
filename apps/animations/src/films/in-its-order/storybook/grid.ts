import type { Grid } from '../../../library/storybook/scene.ts';

/** The frame In Its Order's storybook shots are drawn on: the film's size and its `fps` (`film.ts`, held equal by `grid.test.ts`). */
export const GRID: Grid = { size: { width: 1920, height: 1080 }, fps: 30 };
